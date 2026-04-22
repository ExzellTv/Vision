"""
Builder Requests Router — stores homeowner→builder request records in MongoDB.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import optional_user, get_user_id
from app.mongodb import get_db

DEMO_USER_ID = "demo_gallery"

router = APIRouter()


def _resolve_user_id(user: dict | None) -> str:
    if user is None:
        return DEMO_USER_ID
    return get_user_id(user)


def _to_json(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


class BuilderRequestCreate(BaseModel):
    project_id: str
    project_name: str
    builder_id: int | str
    builder_name: str
    builder_company: str | None = None
    budget: float | None = None
    address: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_builder_request(
    body: BuilderRequestCreate,
    user=Depends(optional_user),
    db=Depends(get_db),
) -> dict[str, Any]:
    homeowner_id = _resolve_user_id(user)

    # Prevent duplicate pending requests for same project+builder
    existing = await db.builder_requests.find_one({
        "homeowner_id": homeowner_id,
        "project_id": body.project_id,
        "builder_id": str(body.builder_id),
        "status": "pending",
    })
    if existing:
        return _to_json(existing)

    doc = {
        "homeowner_id": homeowner_id,
        "project_id": body.project_id,
        "project_name": body.project_name,
        "builder_id": str(body.builder_id),
        "builder_name": body.builder_name,
        "builder_company": body.builder_company or "",
        "budget": body.budget,
        "address": body.address or "",
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.builder_requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_json(doc)


@router.get("/all-pending")
async def list_all_pending_requests(db=Depends(get_db)) -> list[dict[str, Any]]:
    cursor = db.builder_requests.find({"status": "pending"}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [_to_json(d) for d in docs]


@router.get("/all-approved")
async def list_all_approved_requests(db=Depends(get_db)) -> list[dict[str, Any]]:
    cursor = db.builder_requests.find({"status": "approved"}).sort("created_at", -1)
    docs = await cursor.to_list(500)
    return [_to_json(d) for d in docs]


@router.get("")
async def list_builder_requests(
    user=Depends(optional_user),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    homeowner_id = _resolve_user_id(user)
    cursor = db.builder_requests.find({"homeowner_id": homeowner_id}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [_to_json(d) for d in docs]


@router.get("/for-builder/{builder_id}")
async def list_requests_for_builder(
    builder_id: str,
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    cursor = db.builder_requests.find({"builder_id": builder_id, "status": "pending"}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [_to_json(d) for d in docs]


@router.patch("/{request_id}/status")
async def update_request_status(
    request_id: str,
    body: dict,
    db=Depends(get_db),
) -> dict[str, Any]:
    new_status = body.get("status")
    if new_status not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'denied'")
    oid = ObjectId(request_id)
    await db.builder_requests.update_one({"_id": oid}, {"$set": {"status": new_status}})

    if new_status == "approved":
        req = await db.builder_requests.find_one({"_id": oid})
        if req:
            now = datetime.now(timezone.utc)
            existing = await db.conversations.find_one({
                "project_id": req.get("project_id"),
                "homeowner_id": req.get("homeowner_id"),
            })
            if not existing:
                result = await db.conversations.insert_one({
                    "project_id": req.get("project_id", ""),
                    "project_name": req.get("project_name", ""),
                    "homeowner_id": req.get("homeowner_id", ""),
                    "builder_id": req.get("builder_id", ""),
                    "builder_name": req.get("builder_name", ""),
                    "created_at": now,
                    "last_message_at": now,
                })

                # Send builder intro message
                builder_name = req.get("builder_name", "Your builder")
                company = req.get("builder_company", "")
                project_name = req.get("project_name", "your project")
                address = req.get("address", "")

                company_line = f" at {company}" if company else ""
                location_line = f" in {address}" if address else ""

                intro = (
                    f"Hi! I'm {builder_name}{company_line} — I've just accepted your request for "
                    f"{project_name}{location_line}. 🎉\n\n"
                    f"I'm excited to work with you on this build. Feel free to reach out here anytime "
                    f"with questions, updates, or anything you'd like to discuss. "
                    f"Let's make this project a great one!"
                )

                await db.messages.insert_one({
                    "conversation_id": str(result.inserted_id),
                    "sender_id": req.get("builder_id", "system"),
                    "sender_role": "builder",
                    "text": intro,
                    "created_at": now,
                })

    return {"ok": True}
