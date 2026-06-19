from pydantic import BaseModel

from typing import List, Dict, Any, Optional

class RegistrationJobPayload(BaseModel):
    farmer_id: str
    cow_id: str
    cow_name: Optional[str] = None
    face_image_url: Optional[str] = None
    muzzle_image_url: Optional[str] = None
    face_image_b64: Optional[str] = None
    muzzle_image_b64: Optional[str] = None

class SearchRequest(BaseModel):
    user_id: str
    role: str  # "farmer" or "admin"
    face_image_url: Optional[str] = None
    muzzle_image_url: Optional[str] = None
    face_image_b64: Optional[str] = None
    muzzle_image_b64: Optional[str] = None

class TournamentCandidate(BaseModel):
    cow_id: str
    superpoint_cache: Dict[str, Any]

class TournamentRequest(BaseModel):
    live_superpoint_cache: Dict[str, Any]
    candidates: List[TournamentCandidate]