import asyncio
from tests.rag_fixtures import car
from tests.test_rag_retrieval import MemoryRepository


class Provider:
    def __init__(self, draft=None):
        self.draft = draft
        self.calls = 0

    async def generate(self, package, repair=None):
        self.calls += 1
        if self.draft is None:
            raise TimeoutError("offline")
        return self.draft


def service(cars, provider=None):
    from app.application.rag.rag import RagService
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository(cars)
    return RagService(repo, TextRetriever(repo), provider), provider


def test_no_context_skips_generation():
    p = Provider()
    s, _ = service([], p)
    result = asyncio.run(s.answer("Honda CR-V giá bao nhiêu?"))
    assert result.status == "no_data" and result.grounded is False and p.calls == 0


def test_provider_timeout_returns_grounded_template():
    s, _ = service([car()], Provider())
    result = asyncio.run(s.answer("Giá CRV"))
    assert result.generation_mode == "template" and result.grounded
    assert "1.109.000.000" in result.answer and result.citations


def test_fabricated_citations_and_wrong_price_rejected():
    for draft in (
        {"answer": "Honda CR-V giá 10 đồng", "factIds": ["fake"], "contextIds": ["fake"]},
        {"answer": "Honda CR-V giá 10 đồng", "factIds": ["car:car_34_3:price:v1:price_vnd_from"],
         "contextIds": ["car:car_34_3:price:v1"]},
    ):
        p = Provider(draft)
        s, _ = service([car()], p)
        result = asyncio.run(s.answer("Giá CRV"))
        assert result.generation_mode == "template" and "10 đồng" not in result.answer
        assert p.calls == 2


def test_missing_comparison_requests_clarification():
    p = Provider()
    s, _ = service([car()], p)
    result = asyncio.run(s.answer("So sánh CRV"))
    assert result.status == "needs_clarification" and not result.grounded and p.calls == 0


def test_image_filename_is_not_evidence():
    s, _ = service([car()], Provider())
    result = asyncio.run(s.answer("Xe này là xe gì?", image_name="car.jpg"))
    assert result.status == "needs_clarification" and not result.grounded


def test_valid_generation_uses_backend_citations():
    p = Provider({"answer": "Honda CR-V có giá tham khảo từ 1.109.000.000 VND.",
        "factIds": ["car:car_34_3:price:v1:price_vnd_from"], "contextIds": ["car:car_34_3:price:v1"]})
    s, _ = service([car()], p)
    result = asyncio.run(s.answer("Giá CRV"))
    assert result.generation_mode == "llm" and result.grounded and result.citations


def test_wrong_units_and_prices_swapped_between_cars_are_rejected():
    drafts = [
        {"answer": "Honda CR-V giá 1.109.000.000 km", "factIds": ["car:car_34_3:price:v1:price_vnd_from"], "contextIds": ["car:car_34_3:price:v1"]},
        {"answer": "Honda CR-V giá 900.000.000 VND.\nMazda CX-5 giá 1.109.000.000 VND.",
         "factIds": ["car:car_34_3:price:v1:price_vnd_from", "car:b:price:v1:price_vnd_from"],
         "contextIds": ["car:car_34_3:price:v1", "car:b:price:v1"]},
    ]
    for draft in drafts:
        s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda", price_vnd_from=900000000)], Provider(draft))
        result = asyncio.run(s.answer("Giá CRV" if len(draft["contextIds"]) == 1 else "So sánh CRV và CX-5"))
        assert result.generation_mode == "template"


def test_unsupported_subject_attribute_and_provenance_are_rejected():
    for answer in ("Toyota Vios có giá 1.109.000.000 VND.",
                   "Honda CR-V dài 1.109.000.000 mét.",
                   "Honda CR-V có giá tham khảo từ 1.109.000.000 VND. Xe an toàn nhất thế giới."):
        s, _ = service([car()], Provider({"answer": answer,
            "factIds": ["car:car_34_3:price:v1:price_vnd_from"], "contextIds": ["car:car_34_3:price:v1"]}))
        assert asyncio.run(s.answer("Giá CRV")).generation_mode == "template"
    s, _ = service([car()], Provider({"answer": "Honda CR-V có 7 chỗ. Đây là thông số chính xác cho phiên bản Việt Nam.",
        "factIds": ["car:car_34_3:specifications:v1:seats"], "contextIds": ["car:car_34_3:specifications:v1"]}))
    r = asyncio.run(s.answer("Thông số CRV phiên bản 2025"))
    assert r.generation_mode == "template" and "không xác nhận" in r.answer


def test_unknown_model_does_not_answer_with_another_car():
    p = Provider()
    s, _ = service([car()], p)
    r = asyncio.run(s.answer("Honda NSX giá bao nhiêu?"))
    assert r.status == "needs_clarification" and not r.grounded and p.calls == 0


def test_image_candidate_ids_support_deictic_question_without_filename_inference():
    s, _ = service([car()])
    r = asyncio.run(s.answer("Xe trong ảnh giá bao nhiêu?", car_ids=["car_34_3"]))
    assert r.grounded and "1.109.000.000" in r.answer
    r = asyncio.run(s.answer("Xe trong ảnh giá bao nhiêu?"))
    assert r.status == "needs_clarification" and not r.grounded


def test_missing_requested_specification_is_partial_without_numeric_claim():
    s, _ = service([car(engine_power_hp=None)])
    r = asyncio.run(s.answer("Công suất Honda CR-V bao nhiêu?"))
    assert r.status == "partial" and "Công suất: Chưa có dữ liệu" in r.answer


def test_comparison_rejects_answer_that_omits_a_car():
    p = Provider({"answer": "Honda CR-V có giá tham khảo từ 1.109.000.000 VND.",
        "factIds": ["car:car_34_3:price:v1:price_vnd_from"],
        "contextIds": ["car:car_34_3:price:v1"]})
    s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")], p)
    r = asyncio.run(s.answer("So sánh CRV và CX-5 về giá và số chỗ"))
    assert r.generation_mode == "template"
    assert "Mazda CX-5" in r.answer and "7 chỗ" in r.answer


def test_comparison_rejects_answer_that_omits_requested_seats():
    p = Provider({"answer": "Honda CR-V có giá tham khảo từ 1.109.000.000 VND.\n\nMazda CX-5 có giá tham khảo từ 1.109.000.000 VND.",
        "factIds": ["car:car_34_3:price:v1:price_vnd_from", "car:b:price:v1:price_vnd_from"],
        "contextIds": ["car:car_34_3:price:v1", "car:b:price:v1"]})
    s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")], p)
    r = asyncio.run(s.answer("So sánh CRV và CX-5 về giá và số chỗ"))
    assert r.generation_mode == "template" and "7 chỗ" in r.answer


def test_complete_comparison_can_use_llm_without_requiring_unasked_fields():
    p = Provider({"answer": "Honda CR-V có giá tham khảo từ 1.109.000.000 VND.\n\nMazda CX-5 có giá tham khảo từ 1.109.000.000 VND.\n\nHonda CR-V có 7 chỗ.\n\nMazda CX-5 có 5 chỗ.",
        "factIds": ["car:car_34_3:price:v1:price_vnd_from", "car:b:price:v1:price_vnd_from",
                     "car:car_34_3:specifications:v1:seats", "car:b:specifications:v1:seats"],
        "contextIds": ["car:car_34_3:price:v1", "car:b:price:v1", "car:car_34_3:specifications:v1", "car:b:specifications:v1"]})
    s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda", seats=5)], p)
    r = asyncio.run(s.answer("So sánh CRV và CX-5 về giá và số chỗ"))
    assert r.generation_mode == "llm"
    assert "7 chỗ" in r.answer and "5 chỗ" in r.answer


def test_comparison_with_insufficient_evidence_budget_is_partial():
    s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")])
    r = asyncio.run(s.answer("So sánh CRV và CX-5 về giá và số chỗ", top_k=2))
    assert r.status == "partial"


def test_comparison_of_wheelbase_only_requires_overall_length_when_also_requested():
    for question, expected_mode in (
        ("So sánh CRV và CX-5 về chiều dài cơ sở", "llm"),
        ("So sánh CRV và CX-5 về chiều dài và chiều dài cơ sở", "template"),
    ):
        p = Provider({"answer": "Honda CR-V — Chiều dài cơ sở: 2630 mm.\n\nMazda CX-5 — Chiều dài cơ sở: 2700 mm.",
            "factIds": ["car:car_34_3:specifications:v1:wheelbase_mm", "car:b:specifications:v1:wheelbase_mm"],
            "contextIds": ["car:car_34_3:specifications:v1", "car:b:specifications:v1"]})
        s, _ = service([car(length_mm=4605, wheelbase_mm=2630),
                        car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda", length_mm=4540, wheelbase_mm=2700)], p)
        r = asyncio.run(s.answer(question))
        assert r.generation_mode == expected_mode


def test_family_car_comparison_does_not_require_unasked_price():
    p = Provider({"answer": "Honda CR-V có 7 chỗ.\n\nMazda CX-5 có 5 chỗ.",
        "factIds": ["car:car_34_3:specifications:v1:seats", "car:b:specifications:v1:seats"],
        "contextIds": ["car:car_34_3:specifications:v1", "car:b:specifications:v1"]})
    s, _ = service([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda", seats=5)], p)
    r = asyncio.run(s.answer("So sánh xe gia đình CRV và CX-5 về số chỗ"))
    assert r.generation_mode == "llm"
