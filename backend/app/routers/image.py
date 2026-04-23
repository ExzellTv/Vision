from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.image_generation import render_with_flux

router = APIRouter()


class RenderRequest(BaseModel):
    screenshot_base64: str
    style: str = "modern exterior"


@router.post("/render")
async def render_house(req: RenderRequest):
    try:
        return await render_with_flux(req.screenshot_base64, req.style)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}")
