import uuid
from datetime import date

from sqlalchemy import Integer, String, Float, Date, ForeignKey, Text
from app.database import GUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, GUID


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    phase_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    phase_name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned/in-progress/complete/delayed
    budget_allocated: Mapped[float] = mapped_column(Float, default=0.0)
    budget_spent: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="schedules")
