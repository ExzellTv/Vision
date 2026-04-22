"""
Chat Router — MongoDB-backed conversations and messages between homeowners and builders.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
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
    if isinstance(doc.get("archived_at"), datetime):
        doc["archived_at"] = doc["archived_at"].isoformat()
    return doc


def _msg_to_json(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


class SendMessageBody(BaseModel):
    text: str
    sender_role: str  # "homeowner" | "builder"


def _active_filter(uid: str) -> dict:
    return {
        "$and": [
            {"$or": [{"homeowner_id": uid}, {"builder_id": uid}]},
            {"$or": [{"archived_at": {"$exists": False}}, {"archived_at": None}]},
        ]
    }


# NOTE: /conversations/archived must be declared before /conversations/{conv_id}/...
# so FastAPI doesn't treat "archived" as a conv_id parameter.

@router.get("/conversations/archived")
async def list_archived_conversations(
    user=Depends(optional_user),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    uid = _resolve_uid(user)
    cursor = db.conversations.find({
        "$and": [
            {"$or": [{"homeowner_id": uid}, {"builder_id": uid}]},
            {"archived_at": {"$exists": True, "$ne": None}},
        ]
    }).sort("archived_at", -1)
    docs = await cursor.to_list(200)
    return [_conv_to_json(d) for d in docs]


@router.get("/conversations")
async def list_conversations(
    user=Depends(optional_user),
    db=Depends(get_db),
) -> list[dict[str, Any]]:
    uid = _resolve_uid(user)
    cursor = db.conversations.find(_active_filter(uid)).sort("last_message_at", -1)
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
    db=Depends(get_db),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {"archived_at": now}},
    )
    return {"ok": True}


@router.patch("/conversations/{conv_id}/unarchive")
async def unarchive_conversation(
    conv_id: str,
    db=Depends(get_db),
) -> dict[str, Any]:
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {"archived_at": None}},
    )
    return {"ok": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: str,
    db=Depends(get_db),
) -> dict[str, Any]:
    del_msgs = await db.messages.delete_many({"conversation_id": conv_id})
    await db.conversations.delete_one({"_id": ObjectId(conv_id)})
    return {"ok": True, "messages_deleted": del_msgs.deleted_count}
