"""
Chat Router — MongoDB-backed conversations and messages between homeowners and builders.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import optional_user
from app.mongodb import get_db

DEMO_USER_ID = "demo_gallery"

router = APIRouter()


def _resolve_uid(user: dict | None) -> str:
    if user is None:
        return DEMO_USER_ID
    return user.get("sub") or user.get("id") or DEMO_USER_ID


def _conv_to_json(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for key in (
        "archived_at",
        "homeowner_archived_at",
        "builder_archived_at",
        "homeowner_deleted_at",
        "builder_deleted_at",
    ):
        if isinstance(doc.get(key), datetime):
            doc[key] = doc[key].isoformat()
    return doc


def _msg_to_json(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


class SendMessageBody(BaseModel):
    text: str
    sender_role: str  # "homeowner" | "builder"


def _role_fields(role: str) -> tuple[str, str]:
    if role not in ("homeowner", "builder"):
        raise HTTPException(status_code=400, detail="role must be 'homeowner' or 'builder'")
    return f"{role}_archived_at", f"{role}_deleted_at"


def _not_set(field: str) -> dict:
    return {"$or": [{field: {"$exists": False}}, {field: None}]}


def _participant_filter(uid: str) -> dict:
    return {"$or": [{"homeowner_id": uid}, {"builder_id": uid}]}


def _active_filter(uid: str, role: str) -> dict:
    archived_field, deleted_field = _role_fields(role)
    archived_filter = _not_set(archived_field)
    if role == "builder":
        archived_filter = {
            "$and": [
                archived_filter,
                _not_set("archived_at"),
            ]
        }
    return {
        "$and": [
            _participant_filter(uid),
            archived_filter,
            _not_set(deleted_field),
        ]
    }


def _archived_filter(uid: str, role: str) -> dict:
    archived_field, deleted_field = _role_fields(role)
    archived_filter = {archived_field: {"$exists": True, "$ne": None}}
    if role == "builder":
        archived_filter = {
            "$or": [
                archived_filter,
                {"archived_at": {"$exists": True, "$ne": None}},
            ]
        }
    return {
        "$and": [
            _participant_filter(uid),
            archived_filter,
            _not_set(deleted_field),
        ]
    }


def _archive_sort_field(role: str) -> str:
    return "builder_archived_at" if role == "builder" else "homeowner_archived_at"


# NOTE: /conversations/archived must be declared before /conversations/{conv_id}/...
# so FastAPI doesn't treat "archived" as a conv_id parameter.

@router.get("/conversations/archived")
async def list_archived_conversations(
    role: str = Query("homeowner"),
    user=Depends(optional_user),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    uid = _resolve_uid(user)
    cursor = db.conversations.find(_archived_filter(uid, role)).sort(_archive_sort_field(role), -1)
    docs = await cursor.to_list(200)
    return [_conv_to_json(d) for d in docs]


@router.get("/conversations")
async def list_conversations(
    role: str = Query("homeowner"),
    user=Depends(optional_user),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    uid = _resolve_uid(user)
    cursor = db.conversations.find(_active_filter(uid, role)).sort("last_message_at", -1)
    docs = await cursor.to_list(200)
    return [_conv_to_json(d) for d in docs]


@router.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    cursor = db.messages.find({"conversation_id": conv_id}).sort("created_at", 1).limit(200)
    docs = await cursor.to_list(200)
    return [_msg_to_json(d) for d in docs]


@router.post("/conversations/{conv_id}/messages")
async def send_message(
    conv_id: str,
    body: SendMessageBody,
    user=Depends(optional_user),
    db=Depends(get_db),
) -> dict[str, Any]:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    uid = _resolve_uid(user)
    now = datetime.now(timezone.utc)

    doc = {
        "conversation_id": conv_id,
        "sender_id": uid,
        "sender_role": body.sender_role,
        "text": body.text.strip(),
        "created_at": now,
    }
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id

    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {"last_message_at": now}},
    )

    return _msg_to_json(doc)


@router.patch("/conversations/{conv_id}/archive")
async def archive_conversation(
    conv_id: str,
    role: str = Query("homeowner"),
    db=Depends(get_db),
) -> dict[str, Any]:
    archived_field, _ = _role_fields(role)
    now = datetime.now(timezone.utc)
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {archived_field: now}},
    )
    return {"ok": True}


@router.patch("/conversations/{conv_id}/unarchive")
async def unarchive_conversation(
    conv_id: str,
    role: str = Query("homeowner"),
    db=Depends(get_db),
) -> dict[str, Any]:
    archived_field, _ = _role_fields(role)
    updates = {archived_field: None}
    if role == "builder":
        updates["archived_at"] = None
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": updates},
    )
    return {"ok": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: str,
    role: str = Query("homeowner"),
    db=Depends(get_db),
) -> dict[str, Any]:
    _, deleted_field = _role_fields(role)
    now = datetime.now(timezone.utc)
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {deleted_field: now}},
    )
    return {"ok": True, "messages_deleted": 0}
