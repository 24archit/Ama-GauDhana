from pydantic import BaseModel

from typing import List, Dict, Any, Optional

class RegistrationJobPayload(BaseModel):
    farmer_id: str
    cow_id: str
    cow_name: str = None
    face_image_url: str
    muzzle_image_url: str

class SearchRequest(BaseModel):
    user_id: str
    role: str  # "farmer" or "admin"
    face_image_url: str
    muzzle_image_url: str

class TournamentCandidate(BaseModel):
    cow_id: str
    superpoint_cache: Dict[str, Any]

class TournamentRequest(BaseModel):
    live_superpoint_cache: Dict[str, Any]
    candidates: List[TournamentCandidate]