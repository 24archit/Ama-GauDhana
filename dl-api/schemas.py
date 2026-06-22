from pydantic import BaseModel, model_validator

from typing import List, Dict, Any, Optional, Literal

class RegistrationJobPayload(BaseModel):
    farmer_id: str
    cow_id: str
    cow_name: Optional[str] = None
    face_image_url: Optional[str] = None
    muzzle_image_url: Optional[str] = None
    face_image_bytes: Optional[bytes] = None
    muzzle_image_bytes: Optional[bytes] = None

    @model_validator(mode='after')
    def check_image_sources(self):
        has_face = self.face_image_url or self.face_image_bytes
        has_muzzle = self.muzzle_image_url or self.muzzle_image_bytes
        if not (has_face and has_muzzle):
            raise ValueError("Both face and muzzle image sources (url or bytes) are required.")
        return self

class SearchRequest(BaseModel):
    user_id: str
    role: Literal["farmer", "admin"]
    face_image_url: Optional[str] = None
    muzzle_image_url: Optional[str] = None
    face_image_bytes: Optional[bytes] = None
    muzzle_image_bytes: Optional[bytes] = None

class TournamentCandidate(BaseModel):
    cow_id: str
    superpoint_cache: Dict[str, Any]

class TournamentRequest(BaseModel):
    live_superpoint_cache: Dict[str, Any]
    candidates: List[TournamentCandidate]