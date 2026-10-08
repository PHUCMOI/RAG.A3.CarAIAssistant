import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from app.infrastructure.ai.natural_answers import compose_answer, validate_answer


def test_bedrock_receives_description_and_verified_tool_data():
    provider = AsyncMock()
    provider._chat.return_value = {"answer": "**Ford Edge** là mẫu SUV 5 chỗ.\n\nGiá tham khảo: **1.560.000.000 VND**."}
    data = {"description": "Ford Edge is an SUV with 5 seats.", "priceVndFrom": 1560000000}
    with patch("app.infrastructure.ai.natural_answers.BedrockProvider", return_value=provider):
        answer = asyncio.run(compose_answer("xe này giá bao nhiêu?", data))
    assert "SUV 5 chỗ" in answer
    payload = json.loads(provider._chat.call_args.args[0][1]["content"])
    assert payload["verifiedData"] == data
    assert payload["question"] == "xe này giá bao nhiêu?"
    assert provider._chat.call_args.kwargs["num_predict"] == 2400


@pytest.mark.parametrize("answer", ["Giá 450 triệu", "Mở https://evil.test", "<script>alert(1)</script>"])
def test_rejects_new_numbers_links_and_html(answer):
    with pytest.raises(ValueError):
        validate_answer(answer, {"price": 1560000000})


def test_preserves_measurement_units_instead_of_confusing_mm_with_metres():
    with pytest.raises(ValueError, match="measurement unit"):
        validate_answer("Chiều dài 4.808 m", {"lengthMm": 4808})
    assert validate_answer("Chiều dài 4.808 mm", {"lengthMm": 4808})


def test_generic_engine_advice_does_not_require_a_technical_source_disclaimer():
    data = {"specificationScope": "Thông số từ thị trường Anh."}
    assert validate_answer("Bạn ưu tiên động cơ hay không gian nội thất?", data)
    with pytest.raises(ValueError):
        validate_answer("Công suất 207 hp", {**data, "enginePowerHp": 207})
    assert validate_answer("Công suất 207 hp theo catalogue Anh.", {**data, "enginePowerHp": 207})


def test_comparison_does_not_claim_sixty_months_is_double_thirty_six():
    with pytest.raises(ValueError):
        validate_answer('Bảo hành 60 tháng lâu gấp đôi 36 tháng.', {'durations': [60, 36]})


def test_image_answer_must_keep_nearest_match_score_and_uncertainty():
    data = {"imageMatch": {"similarityPercent": 65.2, "uncertain": True}}
    with pytest.raises(ValueError):
        validate_answer("Đây là Ford Edge", data)
    with pytest.raises(ValueError):
        validate_answer("Xe gần giống nhất là Ford Edge, độ tương đồng 65,2%", data)
    assert validate_answer("Xe gần giống nhất là Ford Edge, độ tương đồng 65,2%; kết quả chưa chắc chắn.", data)


def test_retries_invalid_output_and_does_not_silently_return_a_template():
    provider = AsyncMock()
    provider._chat.return_value = {"answer": "Giá 450 triệu"}
    with patch("app.infrastructure.ai.natural_answers.BedrockProvider", return_value=provider):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(compose_answer("giá?", {"price": 1560000000}))
    assert exc.value.status_code == 503
    assert provider._chat.await_count == 2


def test_chat_passes_missing_data_and_image_evidence_to_final_bedrock_stage(client):
    composer = AsyncMock(return_value="Bạn có thể nêu rõ mẫu xe cần tra cứu không?")
    with patch("app.routers.chat.compose_answer", composer):
        response = client.post("/api/chat", json={"question": "Xe này là gì?", "carIds": ["missing"],
            "imageMatch": {"similarityPercent": 65, "uncertain": True}})
    assert response.status_code == 200
    assert response.json()["generationMode"] == "bedrock-natural"
    assert composer.call_args.args[1]["status"] == "no_data"
    assert composer.call_args.args[1]["imageMatch"]["uncertain"] is True


def test_compose_endpoint_uses_bedrock_even_for_clarification(client):
    composer = AsyncMock(return_value="Bạn muốn hỏi đơn nào?")
    with patch("app.routers.chat.compose_answer", composer):
        response = client.post("/api/chat/compose", json={"question": "khi nào giao?",
            "verifiedData": {"retrievedAnswer": "Chưa xác định đơn; hỏi mã đơn."}})
    assert response.json()["answer"] == "Bạn muốn hỏi đơn nào?"
    composer.assert_awaited_once()
