import uuid
from datetime import date

from sqlalchemy import Integer, Float, Date
from app.database import GUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, GUID


class ComparableSale(Base):
    """Pre-loaded Dallas comparable property sales."""
    __tablename__ = "comparable_sales"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    sale_price: Mapped[float] = mapped_column(Float, nullable=False)
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    sf: Mapped[int] = mapped_column(Integer, nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, nullable=False)
    bathrooms: Mapped[float] = mapped_column(Float, nullable=False)
    year_built: Mapped[int] = mapped_column(Integer, nullable=False)
    lot_sf: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_sf: Mapped[float] = mapped_column(Float, nullable=False)
