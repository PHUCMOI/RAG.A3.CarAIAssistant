from app.core.database import get_db_connection
from app.main import app
from tests.conftest import MockDbConnection


def test_chat_with_results(client):
    response = client.post("/api/chat", json={"question": "Honda CR-V"})
    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is True
    assert "Honda CR-V" in data["contexts"][0]["displayName"]
    assert data["evidence"] and data["generationMode"] == "template"


def test_chat_no_results(client):
    empty_db = MockDbConnection(cars=[], dealers=[])

    async def override_empty_db():
        yield empty_db

    app.dependency_overrides[get_db_connection] = override_empty_db
    try:
        response = client.post("/api/chat", json={"question": "Xe bay 2099"})
        assert response.status_code == 200
        data = response.json()
        assert data["grounded"] is False
        assert len(data["contexts"]) == 0
        assert "Chưa tìm thấy dữ liệu phù hợp" in data["answer"]
    finally:
        app.dependency_overrides.clear()


def test_chat_with_image(client):
    response = client.post("/api/chat", json={"question": "Xe này là xe gì?", "imageName": "car_front.jpg"})
    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is False
    assert "Giao diện đã nhận tên ảnh" in data["answer"]
    assert data["status"] == "needs_clarification"
