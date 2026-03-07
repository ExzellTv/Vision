import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime, ForeignKey
from app.database import GUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, GUID


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(GUID(), ForeignKey("projects.id"), nullable=False)
    model_type: Mapped[str] = mapped_column(String(10), nullable=False)  # rf/mlp/lr
    cost_per_sf: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    market_value: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_low: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_high: Mapped[float] = mapped_column(Float, default=0.0)
    feature_importance_json: Mapped[dict | None] = mapped_column(JSONB)
    metrics_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="predictions")
