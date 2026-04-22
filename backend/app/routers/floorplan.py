"""
Floor Plan Router — generate, import, CRUD, versioning, and DXF export.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import io
import zipfile
from pathlib import Path

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


SUPPORTED_IMPORT_EXTS = {".dxf", ".dwg", ".rvt", ".3dm", ".ifc", ".skp"}
MAX_IMPORT_BYTES = 50 * 1024 * 1024  # 50 MB cap — guards against accidental huge uploads


def _collect_dxf_points(entities) -> tuple[list[float], list[float]]:
    """Pull (x, y) coords from whichever positional attribute each entity carries."""
    xs: list[float] = []
    ys: list[float] = []
    for e in entities:
        dxf = getattr(e, "dxf", None)
        if dxf is None:
            continue
        for attr in ("start", "end", "insert", "center"):
            pt = getattr(dxf, attr, None)
            if pt is None:
                continue
            try:
                xs.append(float(pt[0]))
                ys.append(float(pt[1]))
            except (TypeError, IndexError):
                pass
    return xs, ys


def _parse_dxf_summary(data: bytes) -> dict:
    """Parse a DXF payload into an entity/layer/bbox summary. Raises on parse error."""
    import ezdxf
    import tempfile, os
    from ezdxf import recover

    # Write to a temp file — ezdxf's file-based reader handles both ASCII and
    # binary DXF and performs auto-recovery on malformed files. The in-memory
    # `ezdxf.read(StringIO(...))` path silently drops entities for some versions.
    tmp = tempfile.NamedTemporaryFile(suffix=".dxf", delete=False)
    try:
        tmp.write(data); tmp.close()
        try:
            doc, _auditor = recover.readfile(tmp.name)
        except Exception as err:
            raise HTTPException(status_code=422, detail=f"DXF parse failed: {err}") from err
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    entities = list(doc.modelspace())
    layers = [layer.dxf.name for layer in doc.layers]
    xs, ys = _collect_dxf_points(entities)

    bbox = None
    if xs and ys:
        bbox = {
            "min_x": min(xs), "max_x": max(xs),
            "min_y": min(ys), "max_y": max(ys),
            "width":  max(xs) - min(xs),
            "height": max(ys) - min(ys),
        }

    return {
        "dxf_version":  doc.dxfversion,
        "entity_count": len(entities),
        "layers":       layers[:50],  # cap so a pathological file doesn't bloat the response
        "layer_count":  len(layers),
        "bounding_box": bbox,
    }


@router.post("/import")
async def import_floorplan(file: UploadFile = File(...)) -> dict:
    """Import a structural-model file from the user's computer.

    DXF files are parsed with `ezdxf` to extract entity counts, layers, and
    a bounding box — useful feedback for the import card. Other formats are
    acknowledged but not parsed (the native readers aren't available in the
    FastAPI container).
    """
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()

    if ext not in SUPPORTED_IMPORT_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_IMPORT_EXTS))}",
        )

    data = await file.read()
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB import limit")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    response: dict = {
        "status": "ok",
        "filename": filename,
        "ext": ext,
        "size_bytes": len(data),
    }

    if ext == ".dxf":
        summary = _parse_dxf_summary(data)
        response["summary"] = summary
        response["message"] = (
            f"Imported {summary['entity_count']} entities across {summary['layer_count']} layers."
        )
    else:
        response["message"] = (
            f"{ext.upper().lstrip('.')} file received. Full conversion for this format isn't "
            f"enabled in this build; use .dxf for a parsed summary."
        )

    return response


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
