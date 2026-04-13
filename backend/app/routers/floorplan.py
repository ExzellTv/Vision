"""
Floor Plan Router — generate, import, CRUD, versioning, and DXF export.
"""

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse
import io
import zipfile

from app.schemas.api import (
    FloorplanGenerateRequest,
    FloorplanGenerateResponse,
    FloorplanUpdateRequest,
    DXFExportRequest,
    DXFExportAllRequest,
)
from app.services import floorplan_service
from app.services.dxf_export import generate_dxf

router = APIRouter()


@router.post("/generate")
def generate_floorplan(req: FloorplanGenerateRequest) -> dict:
    """Generate a floor plan from parameters."""
    result = floorplan_service.generate({
        "target_sf": req.targetSF,
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "stories": req.stories,
        "lot_width_ft": req.lotWidth,
        "lot_depth_ft": req.lotDepth,
        "style": req.style.lower(),
        "garage": req.garage,
        "open_plan": req.openFloorPlan,
    })
    return result


@router.post("/export/dxf")
def export_dxf(req: DXFExportRequest) -> StreamingResponse:
    """Export a floor plan as a professional DXF file for CAD tools."""
    dxf_bytes = generate_dxf(req.floor_plan, req.project_name)
    filename = req.project_name.replace(" ", "_") + "_floor_plan.dxf"
    return StreamingResponse(
        iter([dxf_bytes]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/dxf-all")
def export_dxf_all(req: DXFExportAllRequest) -> StreamingResponse:
    """Export all story floor plans as DXF files bundled in a single zip."""
    total = len(req.story_plans)
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i, plan in enumerate(req.story_plans):
            floor_label = f"Floor {i + 1} of {total}" if total > 1 else ""
            dxf_bytes = generate_dxf(plan, req.project_name, floor_label)
            dxf_filename = f"Floor_{i + 1}.dxf"
            zf.writestr(dxf_filename, dxf_bytes)
    zip_buf.seek(0)
    zip_filename = req.project_name.replace(" ", "_") + "_floor_plans.zip"
    return StreamingResponse(
        iter([zip_buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


@router.post("/import")
def import_floorplan(file: UploadFile = File(...)) -> dict:
    """Import a floor plan file (placeholder)."""
    return {
        "status": "stub",
        "filename": file.filename,
        "message": "File import not yet implemented.",
    }


@router.get("/{id}")
def get_floorplan(id: str) -> dict:
    """Get a floor plan by ID (stub)."""
    return {
        "id": id,
        "rooms": [
            {"name": "Living Room", "area_sf": 350},
            {"name": "Kitchen", "area_sf": 200},
            {"name": "Bedroom 1", "area_sf": 180},
        ],
        "metadata": {"stories": 1, "total_sf": 2000},
    }


@router.put("/{id}")
def update_floorplan(id: str, req: FloorplanUpdateRequest) -> dict:
    """Update a floor plan (stub)."""
    return {
        "id": id,
        "updated": True,
        "rooms": req.rooms,
        "metadata": req.metadata,
    }


@router.get("/{id}/versions")
def list_versions(id: str) -> dict:
    """List versions for a floor plan (stub)."""
    return {
        "id": id,
        "versions": [
            {"version": 1, "created_at": "2026-01-15T10:00:00Z"},
            {"version": 2, "created_at": "2026-01-16T14:30:00Z"},
        ],
    }
