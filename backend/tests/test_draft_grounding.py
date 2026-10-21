import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from app.infrastructure.ai.answer_grounding import canonical_sources
from app.infrastructure.ai.natural_answers import compose_grounded, validate_answer


DATA = {"status": "ok", "orderCode": "AW-8617AE4D4CF8", "draftPrepared": True, "actionExecuted": False,
    "retrievedAnswer": "Đã chuẩn bị bản nháp đổi lịch, chưa gửi yêu cầu và chưa đổi lịch nhận xe.",
    "draft": {"type": "reschedule", "orderCode": "AW-8617AE4D4CF8", "status": "draft",
        "requestedDate": "2026-10-21", "requestedDateDisplay": "21/10/2026", "reason": "bận công tác",
        "requiresConfirmation": True, "submitted": False, "scheduleChanged": False,
        "orderDetailUrl": "/account/orders/owned"}}


def test_prepared_draft_is_subject_bound_evidence_with_requested_date_and_reason():
    evidence, citations, status = canonical_sources(DATA)
    draft = next(e for e in evidence if e.context_id == "tool:draft")
    assert status == "ok"
    assert draft.metadata["toolResult"]["requestedDate"] == "2026-10-21"
    assert draft.metadata["toolResult"]["reason"] == "bận công tác"
    assert draft.metadata["orderCode"] == "AW-8617AE4D4CF8"
    assert citations[0].source_detail_path == "/account/orders/owned"


def test_draft_answer_can_repeat_requested_date_without_claiming_schedule_changed():
    answer = "Đã chuẩn bị bản nháp đổi lịch đơn AW-8617AE4D4CF8 sang 21/10/2026 vì bận công tác. Bạn cần xác nhận gửi; lịch nhận xe chưa thay đổi."
    provider = AsyncMock()
    provider._chat.side_effect = [{"answer": answer},
        {"supported": True, "contextIds": ["tool:draft"], "reason": "Prepared draft only, no submission or schedule change"}]
    with patch("app.infrastructure.ai.natural_answers.BedrockProvider", return_value=provider):
        result = asyncio.run(compose_grounded("Hãy tạo đề nghị đổi lịch", DATA))
    assert result["answer"] == answer
    assert result["grounded"] is True
    assert result["evidence"][0]["metadata"]["toolResult"]["submitted"] is False


def test_draft_does_not_allow_unverified_dates_or_payments():
    with pytest.raises(ValueError, match="Có số không khớp nguồn"):
        validate_answer("Ngày nhận đã đổi sang 25/10/2026, bạn đã trả 999.000.000 VND.", DATA)


def test_audit_can_still_reject_claiming_a_draft_changed_the_schedule():
    provider = AsyncMock()
    provider._chat.side_effect = [
        {"answer": "Đã đổi lịch nhận xe thành công sang 21/10/2026."},
        {"supported": False, "contextIds": [], "reason": "Only a draft; actual schedule unchanged"},
        {"answer": "Đã đổi lịch nhận xe thành công sang 21/10/2026."},
        {"supported": False, "contextIds": [], "reason": "Only a draft; actual schedule unchanged"}]
    with patch("app.infrastructure.ai.natural_answers.BedrockProvider", return_value=provider):
        with pytest.raises(HTTPException) as error:
            asyncio.run(compose_grounded("Đổi lịch nhận xe", DATA))
    assert error.value.status_code == 503
