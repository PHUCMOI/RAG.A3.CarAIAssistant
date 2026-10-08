import asyncio
import logging
import re
from app.application.rag.contracts import Draft, RagResult
from app.application.rag.context_builder import build_context, required_qualifiers, missing_requested_facts, comparison_requirements
from app.application.rag.intent import analyze

logger = logging.getLogger(__name__)


def validate_draft(draft, package):
    draft = Draft.model_validate(draft)
    contexts = {e.context_id for e in package.retrieval.evidence}
    if set(draft.context_ids) - contexts or set(draft.fact_ids) - package.facts.keys():
        raise ValueError("Unknown context/fact reference")
    if any(package.facts[f]["contextId"] not in draft.context_ids for f in draft.fact_ids):
        raise ValueError("Fact and context do not match")
    if re.search(r"https?://|www\.", draft.answer, re.I):
        raise ValueError("Model must not create URLs")
    # MVP generation is extractive: select whole verified statements, separated by
    # blank lines. An arbitrary paraphrase cannot be proven by checking numbers alone.
    used = set()
    for block in draft.answer.strip().split("\n\n"):
        statement = block.strip()
        if statement not in package.statements:
            raise ValueError("Use an exact allowedStatement; unsupported subject/attribute or prose")
        used.update(package.statements[statement])
    if used != set(draft.fact_ids):
        raise ValueError("Fact references must match statements actually used")
    if {package.facts[f]["contextId"] for f in used} != set(draft.context_ids):
        raise ValueError("Context references must match statements actually used")
    if package.retrieval.analysis.intent == "compare_cars":
        subjects = {package.facts[f]["subjectId"] for f in used}
        if set(package.retrieval.analysis.car_ids) - subjects:
            raise ValueError("Comparison must include facts for every requested car")
        covered = {(package.facts[f]["subjectId"], f.rsplit(":", 1)[-1]) for f in used}
        missing = comparison_requirements(package.retrieval) - covered
        if missing:
            raise ValueError(f"Comparison omits requested facts: {sorted(missing)}")
    # Qualifiers are appended by the backend after validation, even when a split
    # chunk or selected fact does not contain the original disclaimer.
    return draft


def template_answer(package):
    lines = []
    for e in package.retrieval.evidence:
        if e.metadata.get("facts"):
            text = e.content
            for fact in e.metadata["facts"].values():
                if isinstance(fact["value"], int) and fact.get("unit") == "VND":
                    text = text.replace(str(fact["value"]), f"{fact['value']:,}".replace(",", "."))
            lines.append(text + f" [{e.context_id}]")
    if not lines:
        return "Chưa có dữ liệu đủ căn cứ cho câu hỏi này."
    answer = "\n\n".join(lines)
    return answer + "\n\n" + "\n".join(q for q in required_qualifiers(package.retrieval) if q not in answer)


class RagService:
    def __init__(self, repository, retriever, generator=None, timeout=90.0):
        self.repository, self.retriever, self.generator, self.timeout = repository, retriever, generator, timeout

    async def answer(self, question, explicit_filters=None, car_ids=None, top_k=5, image_name=None):
        catalogue = await self.repository.catalogue()
        analysis = await analyze(question, catalogue, self.generator if hasattr(self.generator, "classify") else None, car_ids=car_ids)
        if image_name and not analysis.car_ids and car_ids is None:
            analysis.ambiguities.append("Giao diện đã nhận tên ảnh; tên file không phải dữ liệu nhận diện. Vui lòng nêu mẫu xe hoặc gửi ảnh qua module ảnh.")
        retrieval = await self.retriever.retrieve(analysis, explicit_filters, top_k, car_ids)
        if car_ids is not None and set(car_ids) - {c.car_id for c in catalogue}:
            return RagResult("Mẫu xe được chọn chưa có trong catalogue; chưa thể tra cứu dữ liệu.", retrieval, status="no_data")
        if analysis.ambiguities:
            return RagResult(" ".join(dict.fromkeys(analysis.ambiguities)), retrieval, status="needs_clarification")
        package = build_context(retrieval)
        if not package.facts:
            return RagResult("Chưa tìm thấy dữ liệu phù hợp hoặc đủ căn cứ cho câu hỏi này.", retrieval)
        answer, mode, citations = template_answer(package), "template", package.citations
        if self.generator:
            async def generate():
                repair = None
                for _ in range(2):
                    try:
                        return validate_draft(await self.generator.generate(package, repair), package)
                    except ValueError as exc:
                        repair = str(exc)
                return None
            try:
                draft = await asyncio.wait_for(generate(), timeout=self.timeout)
                if draft:
                    answer, mode = draft.answer, "llm"
                    answer += "\n\n" + "\n".join(q for q in required_qualifiers(retrieval, draft.context_ids) if q not in answer)
                    citations = [c for c in citations if c.context_id in draft.context_ids]
            except Exception as exc:
                logger.warning("Generation fell back: %s", type(exc).__name__)
        available = {(fact["subjectId"], fid.rsplit(":", 1)[-1]) for fid, fact in package.facts.items()}
        missing = (any(not e.metadata.get("facts") for e in retrieval.evidence)
                   or bool(analysis.limitations) or bool(missing_requested_facts(retrieval))
                   or bool(comparison_requirements(retrieval) - available))
        return RagResult(answer, retrieval, citations, True, "partial" if missing else "ok", mode)
