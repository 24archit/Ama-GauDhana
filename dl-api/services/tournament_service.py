import asyncio
import numpy as np
import pandas as pd
from fastapi import Request
from core.logging_config import logger

from core import globals as glb
from services.image_service import extract_crop_from_b64
from engine.traditional_features import get_texture_features, get_morphology_features
from services.fusion_service import compute_cosine_similarity

async def run_biometric_tournament(query_mega, query_muzzle, query_face, query_mega_face, query_crop: np.ndarray, candidates: list, live_sp_caches: list, fastapi_req: Request = None):
    if not candidates:
        logger.warning("Tournament aborted: Zero database candidates provided.")
        return None, 0.0, {}

    if glb.xgb_model is None:
        logger.warning("XGBoost model is None, skipping candidate scoring.")
        return None, None, None
        
    def _sync_parse():
        with glb.gpu_lock:
            return glb.dl.parse_live_feats(live_sp_caches) if live_sp_caches else []
    live_feats_list = await asyncio.to_thread(_sync_parse)
    
    q_lbp, q_hog = None, None
    if query_crop is not None:
        def _sync_query_feats():
            try:
                return get_texture_features(query_crop)
            except Exception:
                return None, None
        q_lbp, q_hog = await asyncio.to_thread(_sync_query_feats)

    best_xgb_score = -1.0
    best_candidate_id = None
    best_features = None

    logger.info(f"🏆 STARTING BIOMETRIC TOURNAMENT ({len(candidates)} Candidates)")

    async def process_candidate(cand):
        if fastapi_req and await fastapi_req.is_disconnected():
            return None
            
        cow_id = cand["cow_id"]
        c_vectors = cand.get("vectors", {})
        c_part = cand.get("part", "muzzle")
        c_mega = c_vectors.get("megadescriptor") if c_part in ["muzzle", "face_muzzle"] else c_vectors.get("megadescriptor")
        c_muzzle = c_vectors.get("spatial_muzzle")
        c_face = c_vectors.get("spatial_face")
        c_mega_face = c_vectors.get("megadescriptor") if c_part == "face" else None
        
        mega_sim = compute_cosine_similarity(query_mega, c_mega)
        spatial_muzzle_sim = compute_cosine_similarity(query_muzzle, c_muzzle)
        spatial_face_sim = compute_cosine_similarity(query_face, c_face)
        mega_face_sim = compute_cosine_similarity(query_mega_face, c_mega_face)

        cand_crop_b64 = cand.get("muzzle_crop_b64")

        # PHASE 1: CPU-Bound Feature Prep (Runs concurrently across ThreadPoolExecutor)
        def _cpu_prep():
            c_crop = extract_crop_from_b64(cand_crop_b64)
            t_lbp, t_hog = 1.0, 1.0
            
            if c_crop is not None and query_crop is not None:
                try:
                    if q_lbp is not None and q_hog is not None:
                        m_lbp, m_hog = get_texture_features(c_crop)
                        t_lbp = float(np.linalg.norm(q_lbp - m_lbp))
                        t_hog = float(np.linalg.norm(q_hog - m_hog))
                except Exception as e:
                    print(f"Error getting candidate texture feats: {e}")
            return c_crop, t_lbp, t_hog

        c_crop, trad_lbp_dist, trad_hog_dist = await asyncio.to_thread(_cpu_prep)

        # PHASE 2: GPU-Bound LightGlue (Serialized by glb.gpu_lock internally)
        def _gpu_lg():
            with glb.gpu_lock:
                return glb.dl.get_lightglue_metrics_from_cache(live_feats_list, cand.get("superpoint_cache"), query_crop, c_crop)

        lg_metrics = await asyncio.to_thread(_gpu_lg)
        lg_matches = lg_metrics.get("lg_matches", -1)
        trad_inlier_ratio = lg_metrics.get("inlier_ratio", 0.0)
        trad_aligned_ssim = lg_metrics.get("aligned_ssim", 0.0)

        print(f"  [Candidate: {cow_id}] LightGlue Ridges: {lg_matches} (Muzzle Sim: {mega_sim*100:.1f}%)")
        print(f"      Features Extracted -> LBP: {trad_lbp_dist:.4f}, HOG: {trad_hog_dist:.4f}, Inlier: {trad_inlier_ratio:.4f}, SSIM: {trad_aligned_ssim:.4f}")
                
        return {
            "cow_id": cow_id,
            "muzzle_sim": mega_sim,
            "lg_matches": lg_matches,
            "trad_lbp_dist": trad_lbp_dist,
            "trad_hog_dist": trad_hog_dist,
            "trad_aligned_ssim": trad_aligned_ssim,
            "trad_inlier_ratio": trad_inlier_ratio,
            "spatial_muzzle_sim": spatial_muzzle_sim,
            "spatial_face_sim": spatial_face_sim,
            "mega_face_sim": mega_face_sim
        }

    # Dispatch all candidates concurrently
    tasks = [process_candidate(cand) for cand in candidates]
    results = await asyncio.gather(*tasks)

    # Filter out disconnected aborted tasks
    tournament_features = [res for res in results if res is not None]
    
    if len(tournament_features) != len(candidates):
        logger.warning("Client disconnected mid-tournament! Aborting loop.")
        return None, None, None

    if not tournament_features:
        return None, None, None

    df_batch = pd.DataFrame(tournament_features)
    if hasattr(glb.xgb_model, 'feature_names_in_'):
        feature_cols = glb.xgb_model.feature_names_in_
    else:
        feature_cols = ['muzzle_sim', 'lg_matches', 'trad_lbp_dist', 'trad_hog_dist', 'trad_aligned_ssim', 'trad_inlier_ratio']
        
    for col in feature_cols:
        if col not in df_batch.columns:
            df_batch[col] = 0.0
            
    X_batch = df_batch[list(feature_cols)]
    
    try:
        import xgboost as xgb
        dmatrix = xgb.DMatrix(X_batch)
        y_probs_2d = glb.xgb_model.get_booster().predict(dmatrix)
        # Handle case where predict returns 1D (binary logistic) or 2D array
        y_probs = y_probs_2d[:, 1] if len(y_probs_2d.shape) > 1 else y_probs_2d
    except Exception as e:
        logger.error(f"XGBoost predict failed: {e}")
        y_probs = np.zeros(len(tournament_features))
        
    # Get top 5 indices using XGBoost scores
    top_5_indices = np.argsort(y_probs)[-5:][::-1]
    
    logger.info(f"Top 5 candidates from XGBoost selected. Running DS Fusion on them...")
    
    from services.fusion_service import compute_dempster_shafer_fusion
    
    best_candidate_id = None
    best_xgb_score = -1.0
    best_features = None
    best_ds_match = -1.0
    
    for idx in top_5_indices:
        feat = tournament_features[idx]
        xgb_score = float(y_probs[idx])
        
        # Calculate DS Fusion for this candidate
        ds_res = compute_dempster_shafer_fusion(
            muzzle_sim=feat.get("muzzle_sim", 0.0),
            face_sim=feat.get("spatial_face_sim", 0.0),
            lg_matches=feat.get("lg_matches", 0),
            face_conf=feat.get("face_conf", 0.0) # Might not be in feature row, but safely defaults to 0.0
        )
        ds_match_score = ds_res.get("belief_match", 0.0)
        
        logger.debug(f"Candidate {feat['cow_id']} - XGB: {xgb_score:.4f}, DS Match: {ds_match_score:.4f}")
        
        if ds_match_score > best_ds_match:
            best_ds_match = ds_match_score
            best_xgb_score = xgb_score
            best_candidate_id = feat["cow_id"]
            best_features = feat

    logger.info(f"🏁 TOURNAMENT END: Winner {best_candidate_id} (DS Belief: {best_ds_match:.4f}, XGB: {best_xgb_score:.4f})")
    return best_candidate_id, best_xgb_score, best_features


def compute_traditional_metrics(query_crop_dict, matched_crop_b64):
    results = {
        "trad_morphology": None,
        "trad_lbp_dist": None,
        "trad_hog_dist": None,
        "trad_inlier_ratio": None,
        "trad_aligned_ssim": None
    }
    if not query_crop_dict or "clahe" not in query_crop_dict:
        return results

    query_crop = query_crop_dict["clahe"]
    
    try:
        results["trad_morphology"] = get_morphology_features(query_crop)
    except Exception as e:
        print(f"Morphology error: {e}")

    if not matched_crop_b64:
        return results
        
    try:
        matched_crop = extract_crop_from_b64(matched_crop_b64)
        if matched_crop is not None:
            q_lbp, q_hog = get_texture_features(query_crop)
            m_lbp, m_hog = get_texture_features(matched_crop)
            
            results["trad_lbp_dist"] = float(np.linalg.norm(q_lbp - m_lbp))
            results["trad_hog_dist"] = float(np.linalg.norm(q_hog - m_hog))
            
            lg_geom_feats = glb.dl.get_lightglue_geometric_features(query_crop, matched_crop)
            results["trad_inlier_ratio"] = lg_geom_feats.get("inlier_ratio")
            results["trad_aligned_ssim"] = lg_geom_feats.get("aligned_ssim")
            
    except Exception as e:
        print(f"Error computing traditional metrics against matched candidate: {e}")
        
    return results
