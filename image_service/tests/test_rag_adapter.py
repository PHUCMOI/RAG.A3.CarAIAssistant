import asyncio
import json
import httpx
import pytest
from image_service.app.core.rag_adapter import answer_rag


def test_image_consultation_forwards_question_and_recognized_car_to_common_rag():
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"answer": "Dữ liệu đã tra cứu", "intent": "ask_warranty", "contexts": [{"carId": "car_34_3", "displayName": "Honda CR-V", "description": "Catalogue description"}]})
    result = asyncio.run(answer_rag("Xe này bảo hành bao lâu?", ["car_34_3"], transport=httpx.MockTransport(handler)))
    assert captured == [{"question": "Xe này bảo hành bao lâu?", "topK": 5, "carIds": ["car_34_3"]}]
    assert result["answer"] == "Dữ liệu đã tra cứu"
    assert result["contexts"][0]["car_id"] == "car_34_3"
    assert "score" not in result["contexts"][0]
    assert result["catalog_contexts"][0]["description"] == "Catalogue description"


def test_unknown_text_does_not_choose_a_default_car():
    def handler(request):
        assert "carIds" not in json.loads(request.content)
        return httpx.Response(200, json={"answer": "Chưa có dữ liệu", "contexts": []})
    result = asyncio.run(answer_rag("Xe không xác định", transport=httpx.MockTransport(handler)))
    assert result["contexts"] == []


def test_rag_outage_does_not_return_fabricated_warranty_or_price():
    def handler(request):
        return httpx.Response(503)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(answer_rag("Bảo hành xe này", ["car_34_3"], transport=httpx.MockTransport(handler)))


def test_chat_queries_only_top_one_and_preserves_uncertainty(monkeypatch):
    from unittest.mock import AsyncMock
    from fastapi.testclient import TestClient
    from image_service.app.main import app
    from image_service.app.routers.image_search import get_retriever
    class Retriever:
        def search(self, image, top_k):
            return {"uncertain": True, "results": [
                {"car_id": "edge", "brand": "Ford", "model": "Edge", "similarity": .65},
                {"car_id": "ecosport", "brand": "Ford", "model": "EcoSport", "similarity": .61}]}
    rag = AsyncMock(return_value={"answer": "Ford Edge có thông tin catalogue", "intent": "ask_warranty", "contexts": []})
    monkeypatch.setattr("image_service.app.routers.chat.answer_rag", rag)
    app.dependency_overrides[get_retriever] = lambda: Retriever()
    try:
        response = TestClient(app).post("/chat", data={"message": "đây là xe gì? và bảo hành như thế nào"}, files={"file": ("car.jpg", b"test", "image/jpeg")})
        assert response.status_code == 200
        data = response.json()
        assert [c["car_id"] for c in data["identified_cars"]] == ["edge"]
        assert data["uncertain"] is True
        assert "Ford Edge" in data["answer"]
        assert rag.call_args.kwargs["car_ids"] == ["edge"]
        assert rag.call_args.kwargs["image_match"]["similarityPercent"] == 65.0
        assert rag.call_args.kwargs["image_match"]["uncertain"] is True
    finally:
        app.dependency_overrides.pop(get_retriever, None)
