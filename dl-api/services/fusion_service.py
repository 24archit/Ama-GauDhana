import numpy as np

def compute_cosine_similarity(v1, v2):
    if not v1 or not v2:
        return 0.0
    v1_arr = np.array(v1)
    v2_arr = np.array(v2)
    norm1 = np.linalg.norm(v1_arr)
    norm2 = np.linalg.norm(v2_arr)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    sim = float(np.dot(v1_arr, v2_arr) / (norm1 * norm2))
    return max(0.0, sim)

def combine_ds(b1, b2):
    m1, mm1, u1 = b1
    m2, mm2, u2 = b2
    
    K = 1.0 - (m1 * mm2 + mm1 * m2)
    if K <= 0:
        K = 0.0001
        
    match_f = (m1 * m2 + m1 * u2 + u1 * m2) / K
    mismatch_f = (mm1 * mm2 + mm1 * u2 + u1 * mm2) / K
    uncert_f = (u1 * u2) / K
    
    return (match_f, mismatch_f, uncert_f)

def compute_dempster_shafer_fusion(muzzle_sim: float, face_sim: float, lg_matches: int, face_conf: float = 0.0) -> dict:
    # Expert 1: Spatial Muzzle
    # A true match is typically > 0.70. Low cosine similarity (<0.65) is a strong indicator of a mismatch.
    m_match = min(1.0, max(0.0, (muzzle_sim - 0.70) / 0.30)) * 0.90
    m_mismatch = min(1.0, max(0.0, (0.75 - muzzle_sim) / 0.25)) * 0.90
    m_uncertain = max(0.0, 1.0 - m_match - m_mismatch)
    b_muzzle = (m_match, m_mismatch, m_uncertain)

    # Expert 2: Spatial Face
    # If a face was confidently detected by YOLO, or the similarity is > 0, we trust the score.
    if face_conf >= 0.4 or face_sim > 0.0:
        f_match = min(1.0, max(0.0, (face_sim - 0.70) / 0.30)) * 0.85
        f_mismatch = min(1.0, max(0.0, (0.75 - face_sim) / 0.25)) * 0.85
        f_uncertain = max(0.0, 1.0 - f_match - f_mismatch)
        b_face = (f_match, f_mismatch, f_uncertain)
    else:
        b_face = (0.0, 0.0, 1.0)

    # Expert 3: LightGlue Physical Ridges
    lg = max(0, lg_matches)
    l_match = min(1.0, max(0.0, (lg - 100) / 150)) * 0.90
    l_mismatch = min(1.0, max(0.0, (130 - lg) / 130)) * 0.90
    l_uncertain = max(0.0, 1.0 - l_match - l_mismatch)
    b_lg = (l_match, l_mismatch, l_uncertain)
    
    # Dempster's Rule of Combination sequentially for all experts
    b_fusion = combine_ds(b_muzzle, b_face)
    b_fusion = combine_ds(b_fusion, b_lg)

    from core.logging_config import logger
    logger.debug(f"DS Fusion: Muzzle=(M:{b_muzzle[0]:.3f}, MM:{b_muzzle[1]:.3f}, U:{b_muzzle[2]:.3f}) "
                 f"Face=(M:{b_face[0]:.3f}, MM:{b_face[1]:.3f}, U:{b_face[2]:.3f}) "
                 f"LG=(M:{b_lg[0]:.3f}, MM:{b_lg[1]:.3f}, U:{b_lg[2]:.3f}) "
                 f"Final=(M:{b_fusion[0]:.3f}, MM:{b_fusion[1]:.3f}, U:{b_fusion[2]:.3f})")

    return {
        "belief_match": b_fusion[0],
        "belief_mismatch": b_fusion[1],
        "uncertainty": b_fusion[2]
    }

def evaluate_biometric_match(muzzle_sim: float, face_sim: float = 0.0, lg_matches: int = -1, xgb_score: float = None, face_conf: float = 0.0) -> dict:
    if xgb_score is None:
        xgb_score = 0.0

    max_allowed_xgb = max(muzzle_sim, face_sim) + 0.15
    clamped_xgb = min(xgb_score, max_allowed_xgb)

    ds = compute_dempster_shafer_fusion(muzzle_sim, face_sim, lg_matches, face_conf)
    b_match = ds["belief_match"]
    b_mismatch = ds["belief_mismatch"]
    uncertainty = ds["uncertainty"]
    
    XGB_TARGET_THRESHOLD = 0.85
    xgb_mapped_conf = clamped_xgb
    if clamped_xgb > 0.90:
        xgb_mapped_conf = XGB_TARGET_THRESHOLD + ((clamped_xgb - 0.90) / 0.10) * (1.0 - XGB_TARGET_THRESHOLD)
    
    xgb_mapped_conf = max(0.0, min(1.0, xgb_mapped_conf))

    match = False
    confidence = 0.0
    developer_reason = ""
    user_reason = ""

    if b_match >= 0.90:
        match = True
        confidence = b_match
        developer_reason = f"Gatekeeper [DS Belief Match]: Fusion confirms match with belief {b_match*100:.1f}%."
        user_reason = "Match successful."
        
    else:
        match = False
        confidence = b_match
        developer_reason = f"Gatekeeper [DS Belief Reject]: Fusion rejected match with belief {b_match*100:.1f}%."
        user_reason = "Registration/Search failed: The AI could not confidently match the biometrics. Please ensure the muzzle is perfectly clean and the face is aligned correctly without angles."

    return {
        "match": match,
        "confidence": round(confidence, 4),
        "reason": developer_reason,
        "developer_reason": developer_reason,
        "user_reason": user_reason,
        "muzzle_sim": round(muzzle_sim, 4),
        "face_sim": round(face_sim, 4),
        "ridges": lg_matches,
        "xgb_mapped": round(xgb_mapped_conf, 4) if xgb_score is not None else None,
        "ds_belief_match": round(b_match, 4),
        "ds_belief_mismatch": round(b_mismatch, 4),
        "ds_uncertainty": round(uncertainty, 4)
    }
