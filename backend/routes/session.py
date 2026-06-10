from __future__ import annotations

from fastapi import APIRouter, Request, Response

from config import IS_PRODUCTION, OWNER_SESSION_TTL_SECONDS
from owner_session import OWNER_SESSION_COOKIE_NAME, issue_owner_session
from rate_limiter import validate_service_credential
from schemas import OwnerSessionResponse

router = APIRouter(tags=["session"])


@router.post("/session", response_model=OwnerSessionResponse)
async def create_owner_session(request: Request, response: Response):
    """Issue a signed browser owner token after service authentication."""
    validate_service_credential(request)
    session = issue_owner_session()
    response.set_cookie(
        OWNER_SESSION_COOKIE_NAME,
        session["owner_token"],
        max_age=OWNER_SESSION_TTL_SECONDS,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        path="/api",
    )
    return session
