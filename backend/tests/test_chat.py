from app.core.database import get_db_connection
from app.main import app
from tests.conftest import MockDbConnection


def test_chat_with_results(client):
    response = client.post("/api/chat", json={"question": "Honda CR-V"})
    assert response.status_code == 200
    data = response.json()
    assert data["grounded"] is True
    assert "Honda CR-V" in data["contexts"][0]["displayName"]
    assert data["contexts"][0]["summary"].startswith(data["contexts"][0]["displayName"] + " là mẫu")
    assert data["contexts"][0]["specifications"]["Số chỗ"].endswith("chỗ")
    assert data["evidence"] and data["generationMode"] == "bedrock-natural"


def test_recognized_car_id_resolves_image_question_without_a_model_name(client):
    response = client.post("/api/chat", json={"question": "đây là xe gì? và bảo hành như thế nào", "carIds": ["car_honda_crv"]})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] != "needs_clarification"
    assert data["contexts"] and all(c["carId"] == "car_honda_crv" for c in data["contexts"])
    assert "Chưa xác định được mẫu xe" not in data["answer"]


def test_unknown_recognized_id_does_not_substitute_another_car(client):
    data = client.post("/api/chat", json={"question": "Xe trong ảnh bảo hành thế nào?", "carIds": ["not-in-catalogue"]}).json()
    assert data["status"] == "no_data"
    assert data["contexts"] == []


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
