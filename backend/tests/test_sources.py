from datetime import date
from unittest.mock import AsyncMock



SOURCE = {
    "source_id": "src_honda_vn", "title": "Honda Vietnam", "url": "https://example.test",
    "source_type": "official", "supports": "Prices", "checked_at": date(2026, 10, 2),
}


def test_source_detail_with_grouped_references(client, mock_db):
    mock_db.fetchrow = AsyncMock(return_value=SOURCE)
    mock_db.fetch = AsyncMock(return_value=[
        {"category": "cars", "record_id": "car_1", "label": "Honda CR-V", "car_id": "car_1"},
        {"category": "prices", "record_id": "car_1", "label": "Honda CR-V", "car_id": "car_1"},
        {"category": "warranties", "record_id": "1", "label": "Honda", "car_id": None},
        {"category": "dealers", "record_id": "2", "label": "Honda Hanoi", "car_id": None},
    ])
    response = client.get("/api/sources/src_honda_vn")
    assert response.status_code == 200
    data = response.json()
    assert data["sourceId"] == "src_honda_vn"
    assert data["checkedAt"] == "2026-10-02"
    assert data["references"]["cars"][0]["carId"] == "car_1"
    assert data["references"]["prices"][0]["recordId"] == "car_1"
    assert data["references"]["warranties"][0]["carId"] is None
    assert data["references"]["documents"] == []
    sql, source_id = mock_db.fetch.call_args.args
    assert source_id == "src_honda_vn"
    assert "presence_source_id = $1" in sql and "price_source_id = $1" in sql


def test_source_without_references(client, mock_db):
    mock_db.fetchrow = AsyncMock(return_value=SOURCE)
    mock_db.fetch = AsyncMock(return_value=[])
    response = client.get("/api/sources/src_honda_vn")
    assert response.status_code == 200
    assert all(not items for items in response.json()["references"].values())


def test_missing_source_does_not_query_references(client, mock_db):
    mock_db.fetchrow = AsyncMock(return_value=None)
    mock_db.fetch = AsyncMock()
    assert client.get("/api/sources/missing").status_code == 404
    mock_db.fetch.assert_not_awaited()
