from pathlib import Path

from pydantic_settings import BaseSettings

# Always resolve the backend .env relative to this file so that uvicorn
# finds it regardless of the working directory it was launched from.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # SQLAlchemy (kept for analytical services)
    database_url: str = "sqlite:///./vision.db"

    # MongoDB
    mongodb_url: str = ""
    mongodb_db_name: str = "vision"

    # Clerk auth
    clerk_secret_key: str = ""
    clerk_jwks_url: str = "https://eternal-airedale-89.clerk.accounts.dev/.well-known/jwks.json"

    # Gemini / Google AI
    gemini_api_key: str = ""

    # Cerebras AI (jurisdiction-aware compliance RAG)
    cerebras_api_key: str = ""

    # Optional services
    redis_url: str = "redis://localhost:6379/0"
    aps_client_id: str = ""
    aps_client_secret: str = ""
    materials_api_key: str = ""
    cesium_ion_token: str = ""
    hasdata_api_key: str = ""

    @property
    def mongodb_uri(self) -> str:
        """Alias — routers that use mongodb_uri get the same value as mongodb_url."""
        return self.mongodb_url

    @property
    def mongodb_db(self) -> str:
        """Alias — routers that use mongodb_db get the same value as mongodb_db_name."""
        return self.mongodb_db_name

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]

    model_config = {
        "env_file": str(_ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
