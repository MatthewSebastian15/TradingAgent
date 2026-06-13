from __future__ import annotations

from fastapi import APIRouter, Request, Response

from config import IS_PRODUCTION, OWNER_SESSION_TTL_SECONDS
from errors import AuthenticationError
from owner_session import OWNER_SESSION_COOKIE_NAME, issue_owner_session, read_owner_session
from rate_limiter import validate_service_credential
from schemas import OwnerSessionResponse

router = APIRouter(tags=["session"])


@router.post("/session", response_model=OwnerSessionResponse)
async def create_owner_session(request: Request, response: Response):
    """Issue a signed browser owner token after service authentication."""
    validate_service_credential(request)
    owner_token = (
        request.headers.get("x-owner-token", "").strip()
        or str(request.cookies.get(OWNER_SESSION_COOKIE_NAME) or "").strip()
    )
    session = None
    if owner_token:
        try:
            existing = read_owner_session(owner_token)
            session = {"owner_token": owner_token, "expires_at": existing["expires_at"]}
        except AuthenticationError:
            session = None
    if session is None:
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
