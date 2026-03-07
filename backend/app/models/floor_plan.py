import uuid
from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey
from app.database import GUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, GUID


class FloorPlan(Base):
    __tablename__ = "floor_plans"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    plan_json: Mapped[dict] = mapped_column(JSONB(), nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), default="generated")  # generated/imported/edited
    parent_version_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("floor_plans.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="floor_plans")
    material_selections = relationship("MaterialSelection", back_populates="floor_plan", cascade="all, delete-orphan")
    structural_analyses = relationship("StructuralAnalysis", back_populates="floor_plan", cascade="all, delete-orphan")
