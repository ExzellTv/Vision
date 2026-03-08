from pydantic_settings import BaseSettings


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
    google_api_key: str = ""

    # Optional services
    redis_url: str = "redis://localhost:6379/0"
    aps_client_id: str = ""
    aps_client_secret: str = ""
    materials_api_key: str = ""
    cesium_ion_token: str = ""
    mongodb_uri: str = ""
    mongodb_db: str = "vision"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
