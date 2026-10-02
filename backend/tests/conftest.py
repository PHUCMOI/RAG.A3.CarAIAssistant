import sys
from unittest.mock import AsyncMock, patch
from datetime import date
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import get_db_connection
from app.main import app

MOCK_CAR_ROW = {
    "car_id": "car_honda_crv",
    "genmodel_id": "gen_honda_crv_2023",
    "brand_name": "Honda",
    "source_model_name": "CR-V",
    "display_name": "Honda CR-V 2023",
    "description": "Mid-size crossover SUV with turbo engine and Honda Sensing.",
    "aliases": '["CRV", "CR-V Turbo"]',
    "market_status_vn": "official_current",
    "body_type": "SUV",
    "fuel_type": "Petrol",
    "transmission": "CVT",
    "seats": 7,
    "engine": "1.5L VTEC Turbo",
    "price_vnd_from": 1109000000,
    "price_as_of": date(2026, 10, 1),
    "price_source_id": "src_honda_vn",
    "warranty_months": 36,
    "warranty_distance_km": 100000,
    "presence_source_id": "src_honda_vn",
    "missing_fields": '[]',
    "image_count": 5,
}

MOCK_DEALER_ROW = {
    "dealer_id": 1,
    "name": "Honda Tay Ho",
    "address": "197 Nghi Tam, Yen Phu, Tay Ho",
    "city": "Hanoi",
    "phone": "024 3719 8888",
    "website": "https://hondatayho.com.vn",
    "supported_brands": '["Honda"]',
    "source_id": "src_dealers_hanoi",
    "checked_at": date(2026, 10, 1),
}


class MockDbConnection:
    """Mock asyncpg connection for isolated unit testing."""

    def __init__(self, cars=None, dealers=None):
        self.cars = cars if cars is not None else [MOCK_CAR_ROW]
        self.dealers = dealers if dealers is not None else [MOCK_DEALER_ROW]

    async def fetch(self, query: str, *args):
        q = query.lower()
        if "from cars" in q:
            results = list(self.cars)
            if args and isinstance(args[-1], int):
                results = results[: args[-1]]
            return results
        elif "from dealers" in q:
            results = list(self.dealers)
            return results
        return []

    async def fetchrow(self, query: str, *args):
        q = query.lower()
        if "from cars" in q:
            car_id = args[0] if args else None
            for car in self.cars:
                if car["car_id"] == car_id:
                    return car
            return None
        return None

    async def fetchval(self, query: str, *args):
        return 1


@pytest.fixture
def mock_db():
    return MockDbConnection()


@pytest.fixture
def client(mock_db):
    """FastAPI TestClient with dependency override for get_db_connection."""
    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db_connection] = override_get_db
    try:
        with patch("app.main.init_db_pool", new_callable=AsyncMock), patch("app.main.close_db_pool", new_callable=AsyncMock):
            with TestClient(app) as test_client:
                yield test_client
    finally:
        app.dependency_overrides.clear()
