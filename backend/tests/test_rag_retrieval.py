import asyncio
from tests.rag_fixtures import car


def test_rrf_deduplicates_and_combines_ranks():
    from app.application.rag.contracts import Evidence
    from app.application.rag.text_retriever import reciprocal_rank_fusion
    a = Evidence(context_id="a", section="price", content="a")
    b = Evidence(context_id="b", section="price", content="b")
    result = reciprocal_rank_fusion([a, b], [b])
    assert [e.context_id for e in result] == ["b", "a"]
    assert abs(result[0].score - (1 / 62 + 1 / 61)) < 1e-10


def test_vector_validation():
    import pytest
    from app.infrastructure.ai.embedding import validate_vector
    for v in ([1.0] * 512, [0.0] * 768, [float("nan")] * 768):
        with pytest.raises(ValueError):
            validate_vector(v)
    assert len(validate_vector([1.0] * 768)) == 768


class MemoryRepository:
    def __init__(self, cars):
        self.cars = cars

    async def catalogue(self):
        return self.cars

    async def snapshot(self):
        return self.cars, [], [], {}

    async def candidates(self, filters, car_ids=None):
        from app.application.rag.intent import matches_filters
        return [c for c in self.cars if matches_filters(c, filters) and (car_ids is None or c.car_id in car_ids)]

    async def lexical(self, *args, **kwargs):
        return []

    async def vector(self, *args, **kwargs):
        return []

    async def index_compatible(self, *args):
        return False


def test_structured_fallback_respects_filters_and_returns_fresh_evidence():
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository([car(price_vnd_from=790000000), car("b", "Mazda CX-5", ["CX-5"], price_vnd_from=900000000)])

    async def run():
        analysis = await analyze("SUV 7 chỗ dưới 800 triệu", repo.cars)
        return await TextRetriever(repo).retrieve(analysis)
    result = asyncio.run(run())
    assert [c.car_id for c in result.cars] == ["car_34_3"]
    assert result.evidence and result.retrieval == "postgresql-structured-search"


def test_explicit_filters_override_parsed_filters_and_unknown_ids_do_not_expand():
    from app.application.rag.contracts import RagFilters
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository([car(price_vnd_from=790000000)])

    async def run():
        a = await analyze("Honda dưới 700 triệu", repo.cars)
        retriever = TextRetriever(repo)
        ok = await retriever.retrieve(a, RagFilters(max_price=800000000))
        empty = await retriever.retrieve(a, RagFilters(max_price=800000000), car_ids=["unknown"])
        return ok, empty
    ok, empty = asyncio.run(run())
    assert len(ok.cars) == 1 and empty.cars == []


def test_comparison_has_evidence_for_both_cars():
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")])

    async def run():
        a = await analyze("So sánh CRV và CX-5", repo.cars)
        return await TextRetriever(repo).retrieve(a, top_k=5)
    result = asyncio.run(run())
    assert {e.car_id for e in result.evidence} == {"car_34_3", "b"}


def test_comparison_requested_price_and_specifications_are_present():
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")])
    async def run():
        return await TextRetriever(repo).retrieve(await analyze("So sánh CRV và CX-5 về giá và số chỗ", repo.cars))
    result = asyncio.run(run())
    assert {(e.car_id, e.section) for e in result.evidence} >= {
        ("car_34_3", "price"), ("car_34_3", "specifications"), ("b", "price"), ("b", "specifications")}


def test_split_chunks_do_not_add_the_complete_parent():
    from app.application.rag.documents import build_documents
    from app.application.rag.indexing import split_documents
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    class Tokenizer:
        def encode(self, text, **kwargs):
            return text.split()
    class SplitRepository(MemoryRepository):
        async def lexical(self, *args):
            return [d.evidence() for d in split_documents(build_documents(self.cars, [], []), Tokenizer(), 35)
                    if d.section == "specifications"]
    async def run():
        repo = SplitRepository([car()])
        return await TextRetriever(repo).retrieve(await analyze("Thông số CRV", repo.cars))
    r = asyncio.run(run())
    assert any(":part:" in e.context_id for e in r.evidence)
    assert "car:car_34_3:specifications:v1" not in {e.context_id for e in r.evidence}


def test_comparison_cannot_silently_drop_a_required_car():
    from app.application.rag.intent import analyze
    from app.application.rag.text_retriever import TextRetriever
    repo = MemoryRepository([car(), car("b", "Mazda CX-5", ["CX-5"], brand_name="Mazda")])
    async def run():
        a = await analyze("So sánh CRV và CX-5", repo.cars)
        r = await TextRetriever(repo).retrieve(a, top_k=1)
        assert r.analysis.ambiguities and not r.evidence
    asyncio.run(run())
