import uuid

from sqlalchemy import String, Float
from app.database import GUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, GUID


class Section(Base):
    """AISC W-Shape section property lookup table."""
    __tablename__ = "sections"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    designation: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # e.g. W14x22
    depth_in: Mapped[float] = mapped_column(Float, nullable=False)       # d
    bf_in: Mapped[float] = mapped_column(Float, nullable=False)          # flange width
    area_in2: Mapped[float] = mapped_column(Float, nullable=False)       # A
    ix_in4: Mapped[float] = mapped_column(Float, nullable=False)         # Ix (moment of inertia)
    sx_in3: Mapped[float] = mapped_column(Float, nullable=False)         # Sx (elastic section modulus)
    zx_in3: Mapped[float] = mapped_column(Float, nullable=False)         # Zx (plastic section modulus)
    weight_plf: Mapped[float] = mapped_column(Float, nullable=False)     # weight lb/ft
    fy_ksi: Mapped[float] = mapped_column(Float, default=50.0)           # yield strength
    e_ksi: Mapped[float] = mapped_column(Float, default=29000.0)         # modulus of elasticity
