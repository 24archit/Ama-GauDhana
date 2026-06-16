import traceback
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Depends

from core import globals as glb
from schemas import RegistrationJobPayload, SearchRequest
from services.registration_service import process_registration_safe, get_job_status
from services.search_service import search_cow_safe, delete_cow_embeddings_from_db, get_all_cow_ids_from_db
from core.security import verify_token, limiter

router = APIRouter()

@router.post("/register", dependencies=[Depends(verify_token)])
async def async_register(payload: RegistrationJobPayload, background_tasks: BackgroundTasks):
    """Entrypoint for Node server to dispatch an async registration job."""
    background_tasks.add_task(process_registration_safe, payload.dict())
    return {"status": "Job accepted"}

@router.post("/search", dependencies=[Depends(verify_token)])
async def search_cow(req: SearchRequest, fastapi_req: Request):
    """Entrypoint for synchronous biometric cattle search."""
    return await search_cow_safe(req, fastapi_req)

@router.delete("/cow/{cow_id}", dependencies=[Depends(verify_token)])
async def delete_cow_embeddings(cow_id: str):
    """Deletes the Qdrant vector embeddings for a specific cow."""
    return delete_cow_embeddings_from_db(cow_id)

@router.get("/vectors/cow_ids", dependencies=[Depends(verify_token)])
async def get_all_cow_ids():
    """Returns a list of all unique cow IDs currently in Qdrant for reconciliation."""
    return get_all_cow_ids_from_db()

@router.get("/status/{cow_id}", dependencies=[Depends(verify_token)])
async def get_status(cow_id: str):
    """Returns the status of an asynchronous registration task."""
    return get_job_status(cow_id)

@router.get("/health")
@limiter.limit("5/minute")
async def health_check(request: Request):
    """Liveness check for Load Balancers."""
    return {
        "status": "healthy", 
        "model_loaded": bool(glb.dl),
        "db_connected": bool(glb.db)
    }
