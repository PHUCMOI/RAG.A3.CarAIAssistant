import logging
from app.application.rag.contracts import RetrievalResult
from app.application.rag.documents import build_documents
from app.application.rag.intent import merge_filters, matches_filters, normalize

logger = logging.getLogger(__name__)


def reciprocal_rank_fusion(*rankings):
    scores, items = {}, {}
    for ranking in rankings:
        seen = set()
        for rank, item in enumerate(ranking, 1):
            if item.context_id in seen:
                continue
            seen.add(item.context_id)
            items[item.context_id] = item
            scores[item.context_id] = scores.get(item.context_id, 0.0) + 1 / (60 + rank)
    return [items[key].model_copy(update={"score": scores[key]})
            for key in sorted(scores, key=lambda key: (-scores[key], key))]


class TextRetriever:
    def __init__(self, repository, embedding=None):
        self.repository, self.embedding = repository, embedding

    async def retrieve(self, analysis, explicit_filters=None, top_k=5, car_ids=None):
        top_k = max(1, min(top_k or 5, 20))
        filters = merge_filters(analysis.filters, explicit_filters)
        ids = analysis.car_ids or None
        if car_ids is not None:
            ids = [cid for cid in car_ids if ids is None or cid in ids]
        result = RetrievalResult(analysis, filters)
        if not ids and car_ids is None and any(w in normalize(analysis.question) for w in ("xe nay", "trong anh", "trong hinh")):
            analysis.ambiguities.append("Vui lòng xác định mẫu xe; cần candidate IDs từ module ảnh để tra cứu xe trong ảnh.")
        if explicit_filters and any(v is not None for v in (explicit_filters.min_price, explicit_filters.max_price)):
            analysis.ambiguities = [a for a in analysis.ambiguities if a != "Khoảng giá không có giá trị phù hợp."]
        if filters.min_price is not None and filters.max_price is not None and (
            filters.min_price > filters.max_price or (filters.min_price == filters.max_price and
            not (filters.min_price_inclusive and filters.max_price_inclusive))):
            analysis.ambiguities.append("Khoảng giá không có giá trị phù hợp.")
        if analysis.ambiguities or analysis.intent == "other":
            return result
        if analysis.intent == "compare_cars" and top_k < len(analysis.car_ids):
            analysis.ambiguities.append("topK cần đủ ít nhất một evidence cho mỗi xe so sánh.")
            return result
        cars = await self.repository.candidates(filters, ids)
        # Defense in depth, also protecting image candidate integration against accidental widening.
        cars = [c for c in cars if matches_filters(c, filters) and (ids is None or c.car_id in ids)]
        all_cars, warranties, dealers, sources = await self.repository.snapshot()
        candidate_ids = {c.car_id for c in cars}
        cars = [c for c in all_cars if c.car_id in candidate_ids and matches_filters(c, filters)]
        if analysis.intent == "compare_cars" and set(analysis.car_ids) - {c.car_id for c in cars}:
            analysis.ambiguities.append("Một xe so sánh không có dữ liệu hoặc không đáp ứng filters; vui lòng kiểm tra điều kiện.")
            return result
        result.sources = sources
        fresh = build_documents(cars, warranties, dealers if analysis.intent == "find_dealer" else [])
        sections = {"ask_price": {"price"}, "ask_specification": {"specifications", "overview"},
                    "ask_warranty": {"warranty"}, "find_dealer": {"dealer"}}
        allowed = sections.get(analysis.intent, {"overview", "specifications", "price", "warranty"})
        documents = []
        for d in fresh:
            if d.section not in allowed:
                continue
            if d.car_id is None:
                if d.section == "dealer":
                    if filters.brand and filters.brand not in d.metadata.get("brands", []):
                        continue
                    if filters.city and normalize(filters.city) != normalize(d.metadata.get("city", "")):
                        continue
                    if car_ids is not None and not cars:
                        continue
                elif d.section == "warranty":
                    # Include direct brand policies only for brand-level questions without explicit models.
                    if ids is not None or not filters.brand or d.metadata.get("brand") != filters.brand:
                        continue
            documents.append(d)
        current = {d.document_id: d for d in documents}
        ids_for_search = list(current)
        if not ids_for_search:
            return result
        lexical, vector = [], []
        try:
            lexical = await self.repository.lexical(analysis.question, ids_for_search)
        except Exception as exc:
            # Missing migration/index is an expected degraded mode; SQL facts are still available.
            logger.warning("Lexical retrieval unavailable: %s", type(exc).__name__)
        if self.embedding:
            try:
                if await self.repository.has_embeddings():
                    query_vector = (await self.embedding.embed([analysis.question], query=True))[0]
                    if await self.repository.index_compatible(self.embedding.model, self.embedding.version, ids_for_search):
                        vector = await self.repository.vector(query_vector, ids_for_search, self.embedding.model, self.embedding.version)
            except Exception as exc:
                logger.warning("Vector retrieval unavailable: %s", type(exc).__name__)
        def fresh_only(ranking):
            valid = []
            for e in ranking:
                parent_id = e.metadata.get("parentContextId", e.context_id)
                parent = current.get(parent_id)
                if parent and e.metadata.get("parentContentHash", e.metadata.get("contentHash")) == parent.content_hash:
                    valid.append(e)
            return valid
        lexical, vector = fresh_only(lexical), fresh_only(vector)
        if lexical and vector:
            result.retrieval = "postgresql-hybrid-search"
        elif vector:
            result.retrieval = "postgresql-vector-search"
        elif lexical:
            result.retrieval = "postgresql-lexical-search"
        ranked = reciprocal_rank_fusion(lexical, vector)
        seen = {e.metadata.get("parentContextId", e.context_id) for e in ranked}
        preference = {"price": 0, "warranty": 1, "specifications": 2, "overview": 3, "dealer": 0}
        if analysis.intent == "compare_cars":
            preference.update(specifications=1, warranty=2)
        ranked += [d.evidence() for d in sorted(documents, key=lambda d: (preference[d.section], d.document_id)) if d.document_id not in seen]
        if analysis.intent == "compare_cars":
            ranked.sort(key=lambda e: (preference[e.section], -e.score, e.context_id))
        # Reserve a slot per explicit car before filling the remaining evidence budget.
        selected = []
        reserve_ids = ids or list(dict.fromkeys(e.car_id for e in ranked if e.car_id))
        for cid in reserve_ids:
            evidence = next((e for e in ranked if e.car_id == cid), None)
            if evidence:
                selected.append(evidence)
            if len(selected) == top_k:
                break
        selected_ids = {e.context_id for e in selected}
        selected += [e for e in ranked if e.context_id not in selected_ids][:max(0, top_k - len(selected))]
        result.evidence = selected
        used_ids = {e.car_id for e in selected if e.car_id}
        result.cars = [c for c in cars if c.car_id in used_ids][:top_k]
        return result
