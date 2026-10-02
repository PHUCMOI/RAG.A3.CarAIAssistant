import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.core import database
from app.core.config import Settings


def test_cors_setting(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://example.test")
    assert Settings(_env_file=None).frontend_origin == "https://example.test"


def test_connection_password_is_url_encoded():
    settings = Settings(_env_file=None, database_url=None,
                        postgres_user="user", postgres_password="a@b/#%")
    assert "user:a%40b%2F%23%25@localhost" in settings.get_postgres_dsn()


def test_database_url_takes_precedence():
    url = "postgresql://user:password@db:5432/catalogue"
    assert Settings(_env_file=None, database_url=url).get_postgres_dsn() == url


def test_non_url_database_setting_is_rejected():
    with pytest.raises(ValueError, match="DATABASE_URL must be a PostgreSQL URL"):
        Settings(_env_file=None, database_url="Host=localhost;Database=car_rag")


@pytest.mark.asyncio
async def test_concurrent_reconnect_creates_one_pool(monkeypatch):
    pool = object()
    monkeypatch.setattr(database, "_pool", None)
    monkeypatch.setattr(database, "_pool_lock", asyncio.Lock())

    async def connect(**kwargs):
        await asyncio.sleep(0)
        return pool

    with patch("app.core.database.asyncpg.create_pool", new=AsyncMock(side_effect=connect)) as create:
        results = await asyncio.gather(*(database.get_db_pool() for _ in range(10)))
        assert all(result is pool for result in results)
        create.assert_awaited_once()


def test_database_outage_returns_503(client):
    from app.main import app
    app.dependency_overrides.pop(database.get_db_connection)
    with patch("app.core.database.get_db_pool", new=AsyncMock(side_effect=OSError("offline"))):
        response = client.get("/api/cars")
    assert response.status_code == 503


def test_empty_chat_is_rejected(client):
    assert client.post("/api/chat", json={"question": ""}).status_code == 422
