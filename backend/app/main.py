from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.models import *  # noqa: F401,F403 — register all models
from app.routers import floorplan, structural, cost, market, risk, zoning, schedule, compliance
from app.routers import projects, seed
from app import mongodb
from app.services import ml_predictor

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    # SQLite / SQLAlchemy tables
    Base.metadata.create_all(bind=engine)

    # MongoDB connection
    if settings.mongodb_url:
        try:
            await mongodb.connect()
            logger.info("MongoDB connected")
        except Exception as exc:
            logger.warning(f"MongoDB connection failed (non-fatal): {exc}")

    # Auto-train ML model on startup if not already trained
    try:
        ml_predictor.ensure_trained()
        logger.info("ML model ready")
    except Exception as exc:
        logger.warning(f"ML model init failed (non-fatal): {exc}")

    yield

    # Cleanup
    await mongodb.close()


app = FastAPI(
    title="Vision API",
    description="AI-Powered Land Feasibility Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(floorplan.router, prefix="/api/floorplan", tags=["Floor Plan"])
app.include_router(structural.router, prefix="/api/structural", tags=["Structural"])
app.include_router(cost.router, prefix="/api/cost", tags=["Cost"])
app.include_router(market.router, prefix="/api/market", tags=["Market"])
app.include_router(risk.router, prefix="/api/risk", tags=["Risk"])
app.include_router(zoning.router, prefix="/api/zoning", tags=["Zoning"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["Schedule"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["Compliance"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(seed.router,     prefix="/api/seed-data", tags=["Seed"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}
