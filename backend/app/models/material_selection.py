import uuid

from sqlalchemy import Integer, String, Float, ForeignKey
from app.database import GUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, GUID


class MaterialSelection(Base):
    __tablename__ = "material_selections"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    floor_plan_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("floor_plans.id"), nullable=False)
    layer_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-7
    material_type: Mapped[str] = mapped_column(String(50), nullable=False)
    material_name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    waste_factor: Mapped[float] = mapped_column(Float, default=0.10)
    labor_rate: Mapped[float] = mapped_column(Float, default=0.0)
    labor_cost: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)

    floor_plan = relationship("FloorPlan", back_populates="material_selections")
