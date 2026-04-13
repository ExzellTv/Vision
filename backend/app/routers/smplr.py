"""
Smplrspace integration — session tokens + space save endpoint.

Two routes:
  POST /api/smplr/session-token
      Returns a short-lived token the frontend uses to initialize
      smplr.Space.startEditor(). Two modes:
        1. If SMPLRSPACE_API_KEY is configured → proxy to Smplrspace to mint
           a real session/user token (set SMPLRSPACE_TOKEN_URL to the exact
           endpoint from your Smplrspace dashboard).
        2. Otherwise → echo back the public SMPLRSPACE_CLIENT_TOKEN. Works
           for the editor only if your org permits edits via the pub token.

  POST /api/smplr/save
      Receives the edited space JSON from startEditor's onSave callback
      and persists it. Writes to MongoDB `smplr_spaces` collection keyed
      by spaceId, or falls back to logging in-memory if MongoDB isn't
      configured.

Keep SMPLRSPACE_API_KEY server-side only — never expose to the browser.
"""
from datetime import datetime, timezone
from typing import Any

import httpx
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app import mongodb

logger = logging.getLogger(__name__)
router = APIRouter()


class SessionTokenResponse(BaseModel):
    token: str
    expires_at: str | None = None
    mode: str  # "session" (minted) | "public-fallback"


class SaveSpaceRequest(BaseModel):
    space_id: str
    data: dict[str, Any]


class SaveSpaceResponse(BaseModel):
    ok: bool
    space_id: str
    persisted_to: str  # "mongodb" | "memory"


_MEMORY_STORE: dict[str, dict[str, Any]] = {}


@router.post("/session-token", response_model=SessionTokenResponse)
async def mint_session_token() -> SessionTokenResponse:
    """Mint a Smplrspace session token for the embedded editor."""
    api_key = settings.smplrspace_api_key

    if not api_key:
        # Fallback: hand back the publishable client token. The editor will
        # work only if your org allows edits under the pub token's scope.
        if not settings.smplrspace_client_token:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Smplrspace not configured — set SMPLRSPACE_CLIENT_TOKEN "
                    "(and optionally SMPLRSPACE_API_KEY for session tokens) "
                    "in backend/.env"
                ),
            )
        return SessionTokenResponse(
            token=settings.smplrspace_client_token,
            expires_at=None,
            mode="public-fallback",
        )

    # Proxy to Smplrspace to mint a real token. The exact endpoint varies by
    # plan — update SMPLRSPACE_TOKEN_URL after confirming in your dashboard.
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                settings.smplrspace_token_url,
                headers={
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={"scope": "editor"},
            )
    except httpx.HTTPError as exc:
        logger.error("Smplrspace token mint failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Smplrspace unreachable: {exc}") from exc

    if resp.status_code >= 400:
        logger.error("Smplrspace token mint rejected (%s): %s", resp.status_code, resp.text)
        raise HTTPException(
            status_code=502,
            detail=f"Smplrspace returned {resp.status_code}: {resp.text[:200]}",
        )

    payload = resp.json()
    # Support a few plausible response shapes without guessing exactly.
    token = payload.get("token") or payload.get("access_token") or payload.get("sessionToken")
    if not token:
        raise HTTPException(
            status_code=502,
            detail=f"Smplrspace response missing token field: {list(payload.keys())}",
        )

    return SessionTokenResponse(
        token=token,
        expires_at=payload.get("expires_at") or payload.get("expiresAt"),
        mode="session",
    )


@router.post("/save", response_model=SaveSpaceResponse)
async def save_space(req: SaveSpaceRequest) -> SaveSpaceResponse:
    """Persist an edited space from the Smplrspace editor's onSave callback."""
    doc = {
        "space_id": req.space_id,
        "data": req.data,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if settings.mongodb_url:
        try:
            db = mongodb.get_db()
            await db["smplr_spaces"].update_one(
                {"space_id": req.space_id},
                {"$set": doc},
                upsert=True,
            )
            return SaveSpaceResponse(ok=True, space_id=req.space_id, persisted_to="mongodb")
        except Exception as exc:  # pragma: no cover — non-fatal, fall through
            logger.warning("MongoDB save failed, falling back to memory: %s", exc)

    _MEMORY_STORE[req.space_id] = doc
    return SaveSpaceResponse(ok=True, space_id=req.space_id, persisted_to="memory")
