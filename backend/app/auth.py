"""
Clerk JWT authentication — FastAPI dependency.

Clerk issues RS256 JWTs.  We verify them against Clerk's JWKS endpoint
(cached in-memory after the first request).

Usage — required auth:
    @router.get("/me")
    async def me(user=Depends(require_user)):
        return user

Usage — optional auth (returns None when no token):
    @router.get("/projects")
    async def projects(user=Depends(optional_user)):
        ...
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import jwt, JWTError

from app.config import settings

# ---------------------------------------------------------------------------
# JWKS cache
# ---------------------------------------------------------------------------

_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0
_JWKS_TTL = 3600  # re-fetch once per hour


async def _get_jwks() -> dict:
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache is None or now - _jwks_fetched_at > _JWKS_TTL:
        async with httpx.AsyncClient() as client:
            r = await client.get(settings.clerk_jwks_url, timeout=5)
            r.raise_for_status()
            _jwks_cache = r.json()
            _jwks_fetched_at = now
    return _jwks_cache


# ---------------------------------------------------------------------------
# Token extractor
# ---------------------------------------------------------------------------

async def _decode_token(token: str) -> dict[str, Any]:
    """Verify and decode a Clerk-issued JWT. Raises HTTPException on failure."""
    try:
        jwks = await _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't set aud by default
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Auth service unavailable: {exc}",
        )


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def optional_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Return the decoded user dict, or None if no token was provided."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    return await _decode_token(token)


async def require_user(
    user: dict | None = Depends(optional_user),
) -> dict[str, Any]:
    """Require a valid Clerk session. Raises 401 if missing / invalid."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_user_id(user: dict[str, Any]) -> str:
    """Extract Clerk user ID from decoded payload."""
    return user.get("sub", "")
