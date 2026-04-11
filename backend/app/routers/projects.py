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
    cursor = db.projects.find({"user_id": user_id}).sort("updated_at", -1)
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
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
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
