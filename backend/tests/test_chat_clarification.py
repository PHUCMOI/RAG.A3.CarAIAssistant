from unittest.mock import AsyncMock, patch


def test_unresolved_car_reference_returns_clarification_without_generation(client):
    composer = AsyncMock(side_effect=AssertionError("Clarification must not need factual generation"))
    with patch("app.routers.chat.compose_grounded", composer):
        response = client.post("/api/chat", json={"question": "So sánh chiếc Mazda bên trên với Toyota Camry"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "needs_clarification"
    assert data["answer"]
    assert data["grounded"] is False
    assert data["generationMode"] == "clarification"
    assert data["evidence"] == [] and data["citations"] == []
    composer.assert_not_awaited()


def test_internal_ambiguous_history_returns_exact_question_without_model(client):
    composer = AsyncMock(side_effect=AssertionError("Clarification must not need factual generation"))
    clarification = "Bạn muốn so sánh Mazda CX-5 hay Mazda 3 với Toyota Camry?"
    with patch("app.routers.chat.compose_grounded", composer):
        response = client.post("/api/chat", headers={"X-AutoWise-Internal-Token": "test-internal-token"},
            json={"question": "So sánh chiếc Mazda bên trên với Toyota Camry", "clarification": clarification})
    assert response.status_code == 200
    assert response.json()["answer"] == clarification
    assert response.json()["status"] == "needs_clarification"
    assert response.json()["grounded"] is False
    composer.assert_not_awaited()
