"""
Projects Router — MongoDB-backed CRUD with Clerk auth.

Every document is scoped to the authenticated user's Clerk user ID.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import require_user, optional_user, get_user_id

DEMO_USER_ID = "demo_gallery"


def _resolve_user_id(user: dict | None) -> str:
    """Return real Clerk user ID, or demo fallback when unauthenticated."""
    if user is None:
        return DEMO_USER_ID
    return get_user_id(user)
from app.mongodb import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_json(doc: dict) -> dict:
    """Convert a MongoDB document to JSON-serialisable dict."""
    doc["id"] = str(doc.pop("_id"))
    return doc


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    generate_params: dict[str, Any] | None = None
    floor_plan: dict[str, Any] | None = None
    story_plans: list[dict[str, Any]] | None = None
    materials: list[dict[str, Any]] = []
    notes: str = ""
    schedule: dict[str, Any] | None = None
    building_context: dict[str, Any] | None = None
    location: dict[str, Any] | None = None  # { "city": "Detroit", "state": "MI" }


class ProjectUpdate(BaseModel):
    name: str | None = None
    generate_params: dict[str, Any] | None = None
    floor_plan: dict[str, Any] | None = None
    story_plans: list[dict[str, Any]] | None = None
    materials: list[dict[str, Any]] | None = None
    notes: str | None = None
    schedule: dict[str, Any] | None = None
    building_context: dict[str, Any] | None = None
    compliance_cache: dict[str, Any] | None = None
    diagnosis_cache: list[dict[str, Any]] | None = None
    location: dict[str, Any] | None = None  # { "city": "Detroit", "state": "MI" }
    plot: dict[str, Any] | None = None  # selected land parcel { address, lat, lng, price, lot_sf, zoning, url }
    status: str | None = None            # e.g. "completed"
    completed_at: str | None = None      # ISO timestamp set when builder finishes


class ProjectScheduleUpdate(BaseModel):
    schedule: dict[str, Any]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def list_projects(
    user: dict | None = Depends(optional_user),
    db=Depends(get_db),
) -> list[dict]:
    """List all projects belonging to the current user."""
    user_id = _resolve_user_id(user)
    cursor = db.projects.find({"user_id": user_id, "status": {"$ne": "completed"}}).sort("updated_at", -1)
    docs = await cursor.to_list(200)
    return [_to_json(d) for d in docs]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: dict | None = Depends(optional_user),
    db=Depends(get_db),
) -> dict:
    """Create a new project for the current user."""
    user_id = _resolve_user_id(user)
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "name": body.name,
        "generate_params": body.generate_params,
        "floor_plan": body.floor_plan,
        "story_plans": body.story_plans,
        "materials": body.materials,
        "notes": body.notes,
        "schedule": body.schedule,
        "building_context": body.building_context,
        "location": body.location or None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_json(doc)


@router.get("/completed-count")
async def completed_project_count(db=Depends(get_db)) -> dict:
    """Return the total number of completed projects across all users."""
    count = await db.projects.count_documents({"status": "completed"})
    return {"count": count}


@router.get("/available")
async def list_available_projects(
    db=Depends(get_db),
) -> list[dict]:
    """Return all homeowner projects available for builders to claim."""
    cursor = db.projects.find({}).sort("created_at", -1)
    docs = await cursor.to_list(200)
    return [_to_json(d) for d in docs]


@router.patch("/{project_id}/schedule")
async def update_project_schedule(
    project_id: str,
    body: ProjectScheduleUpdate,
    db=Depends(get_db),
) -> dict:
    """Update only the schedule field — no user_id check so builders can save to homeowner projects."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    updates = {"schedule": body.schedule, "updated_at": datetime.now(timezone.utc)}
    result = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": updates},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_json(result)


@router.get("/{project_id}/public")
async def get_project_public(
    project_id: str,
    db=Depends(get_db),
) -> dict:
    """Read a project without user ownership check — for builders viewing homeowner projects."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    doc = await db.projects.find_one({"_id": oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_json(doc)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict | None = Depends(optional_user),
    db=Depends(get_db),
) -> dict:
    """Get a single project (must belong to current user)."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    user_id = _resolve_user_id(user)
    doc = await db.projects.find_one({"_id": oid, "user_id": user_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_json(doc)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: dict | None = Depends(optional_user),
    db=Depends(get_db),
) -> dict:
    """Partial-update a project."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    user_id = _resolve_user_id(user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)

    result = await db.projects.find_one_and_update(
        {"_id": oid, "user_id": user_id},
        {"$set": updates},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _to_json(result)


@router.patch("/{project_id}/finish")
async def finish_project(
    project_id: str,
    db=Depends(get_db),
) -> dict:
    """Mark a project as completed. No ownership check — builders call this on homeowner projects."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    now = datetime.now(timezone.utc)
    result = await db.projects.find_one_and_update(
        {"_id": oid},
        {"$set": {"status": "completed", "completed_at": now, "updated_at": now}},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Auto-message the homeowner via the project's conversation
    conv = await db.conversations.find_one({"project_id": project_id})
    if conv:
        await db.messages.insert_one({
            "conversation_id": str(conv["_id"]),
            "sender_id": "system",
            "sender_role": "builder",
            "text": "🏗️ This project has been marked as complete. Thank you for building with Vision — it's been a pleasure working on your home!",
            "created_at": now,
        })
        await db.conversations.update_one(
            {"_id": conv["_id"]},
            {"$set": {"last_message_at": now}},
        )

    return _to_json(result)


@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project(
    project_id: str,
    user: dict | None = Depends(optional_user),
    db=Depends(get_db),
) -> dict:
    """Delete a project."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    user_id = _resolve_user_id(user)
    result = await db.projects.delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": True}
