"""
Schedule Router — project schedule creation and phase management.
"""

from fastapi import APIRouter, HTTPException

from app.schemas.api import ScheduleCreateRequest, PhaseUpdateRequest
from app.services import schedule_service

router = APIRouter()


@router.post("/create")
def create_schedule(req: ScheduleCreateRequest) -> dict:
    """Create a project schedule."""
    result = schedule_service.create_schedule({
        "project_name": req.project_name,
        "total_sf": req.total_sf,
        "stories": req.stories,
        "foundation_type": req.foundation_type,
    })
    return result


@router.patch("/{id}/phase/{phase}")
def update_phase(id: str, phase: str, req: PhaseUpdateRequest) -> dict:
    """Update the status of a schedule phase (stub)."""
    return {
        "schedule_id": id,
        "phase": phase,
        "status": req.status,
        "notes": req.notes,
        "updated": True,
    }


@router.get("/{id}")
def get_schedule(id: str) -> dict:
    """Get a schedule by ID (stub)."""
    return {
        "id": id,
        "project_name": "Sample Project",
        "phases": [
            {"name": "Site Prep", "duration_days": 14, "status": "completed"},
            {"name": "Foundation", "duration_days": 21, "status": "in_progress"},
            {"name": "Framing", "duration_days": 28, "status": "pending"},
            {"name": "MEP Rough-In", "duration_days": 21, "status": "pending"},
            {"name": "Finishes", "duration_days": 35, "status": "pending"},
        ],
        "total_duration_days": 119,
    }
