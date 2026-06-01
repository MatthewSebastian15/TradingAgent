from __future__ import annotations

from fastapi import APIRouter, Request

from owner_session import issue_owner_session
from rate_limiter import validate_service_credential
from schemas import OwnerSessionResponse

router = APIRouter(tags=["session"])


@router.post("/session", response_model=OwnerSessionResponse)
async def create_owner_session(request: Request):
    """Issue a signed browser owner token after service authentication."""
    validate_service_credential(request)
    return issue_owner_session()
