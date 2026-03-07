from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./vision.db"
    redis_url: str = "redis://localhost:6379/0"
    aps_client_id: str = ""
    aps_client_secret: str = ""
    materials_api_key: str = ""
    cesium_ion_token: str = ""
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
