from unittest.mock import AsyncMock

import pytest

from tests.conftest import MOCK_CAR_ROW


def test_comparison_preserves_order_and_dimensions(client, mock_db):
    first = dict(MOCK_CAR_ROW, car_id="car_first", engine_power_hp=150, length_mm=4500)
    second = dict(MOCK_CAR_ROW, car_id="car_second", engine_power_hp=0, length_mm=None)
    mock_db.cars = [first, second]
    response = client.get("/api/cars/compare?ids=car_second,car_first")
    assert response.status_code == 200
    data = response.json()
    assert [car["carId"] for car in data["items"]] == ["car_second", "car_first"]
    assert data["items"][0]["enginePowerHp"] == 0
    assert data["items"][0]["lengthMm"] is None
    assert data["items"][1]["lengthMm"] == 4500
    assert data["missingIds"] == []


@pytest.mark.parametrize("ids", ["", "car_one", "a,b,c,d", "a,a", "a,", "a, ,b"])
def test_invalid_comparison_does_not_query_database(client, mock_db, ids):
    mock_db.fetchrow = AsyncMock()
    assert client.get("/api/cars/compare", params={"ids": ids}).status_code == 422
    mock_db.fetchrow.assert_not_awaited()


def test_missing_comparison_parameter(client):
    assert client.get("/api/cars/compare").status_code == 422


def test_comparison_reports_missing_ids(client, mock_db):
    response = client.get("/api/cars/compare?ids=missing,car_honda_crv")
    assert response.status_code == 200
    assert response.json()["missingIds"] == ["missing"]
    assert response.json()["items"][0]["carId"] == "car_honda_crv"


def test_three_cars_are_supported(client, mock_db):
    mock_db.cars = [dict(MOCK_CAR_ROW, car_id=car_id) for car_id in ["a", "b", "c"]]
    response = client.get("/api/cars/compare?ids=c,a,b")
    assert [car["carId"] for car in response.json()["items"]] == ["c", "a", "b"]
