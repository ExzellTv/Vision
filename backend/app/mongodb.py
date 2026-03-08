"""
MongoDB client — Motor (async) driver.

Usage in a FastAPI route:
    from app.mongodb import get_db

    @router.get("/projects")
    async def list_projects(db=Depends(get_db)):
        docs = await db.projects.find().to_list(100)
        return docs
"""

from __future__ import annotations

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    """Return the shared Motor client (created on first call)."""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.mongodb_url, tlsCAFile=certifi.where())
    return _client


async def connect():
    """Called at app startup to warm the connection pool."""
    client = get_client()
    # Ping to verify connectivity
    await client.admin.command("ping")


async def close():
    """Called at app shutdown."""
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_db() -> AsyncIOMotorDatabase:
    """FastAPI dependency — returns the vision database handle."""
    return get_client()[settings.mongodb_db_name]
