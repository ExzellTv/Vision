import uuid

from sqlalchemy import String, Float, ForeignKey
from app.database import GUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, GUID


class StructuralAnalysis(Base):
    __tablename__ = "structural_analyses"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    floor_plan_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("floor_plans.id"), nullable=False)
    section_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), ForeignKey("sections.id"))
    governing_combo_id: Mapped[str | None] = mapped_column(String(10))  # LC1-LC6
    max_moment: Mapped[float] = mapped_column(Float, default=0.0)        # in-lb
    max_shear: Mapped[float] = mapped_column(Float, default=0.0)         # lb
    max_deflection: Mapped[float] = mapped_column(Float, default=0.0)    # inches
    sci_score: Mapped[float] = mapped_column(Float, default=0.0)         # 0-10
    checks_json: Mapped[dict] = mapped_column(JSONB(), default=dict)

    floor_plan = relationship("FloorPlan", back_populates="structural_analyses")
    section = relationship("Section")
