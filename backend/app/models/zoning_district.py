import uuid

from sqlalchemy import String, Float
from app.database import GUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, GUID


class ZoningDistrict(Base):
    """Dallas residential zoning templates (8-10 common classifications)."""
    __tablename__ = "zoning_districts"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    classification: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    max_height_ft: Mapped[float] = mapped_column(Float, nullable=False)
    front_setback_ft: Mapped[float] = mapped_column(Float, nullable=False)
    side_setback_ft: Mapped[float] = mapped_column(Float, nullable=False)
    rear_setback_ft: Mapped[float] = mapped_column(Float, nullable=False)
    far: Mapped[float] = mapped_column(Float, nullable=False)            # Floor Area Ratio
    lot_coverage_pct: Mapped[float] = mapped_column(Float, nullable=False)
