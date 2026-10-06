import json
import re
from urllib.parse import quote
from app.application.rag.contracts import Citation, ContextPackage
from app.application.rag.documents import ENUMS, STATUS
from app.application.rag.intent import normalize

SPEC_LIMITATION = "Thông số trong database chủ yếu từ DVM-CAR thị trường Anh; không xác nhận phiên bản kỹ thuật tại Việt Nam. Trường chưa có nguồn riêng chỉ dẫn tới bản ghi dữ liệu."
PRICE_LIMITATION = "Đây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực."
WARRANTY_LIMITATION = "Cần xác nhận điều kiện bảo hành theo xe, VIN và ngày bán cụ thể."
LABELS = {"body_type": "Kiểu xe", "seats": "Số chỗ", "fuel_type": "Nhiên liệu", "transmission": "Hộp số",
          "engine": "Động cơ", "engine_power_hp": "Công suất", "length_mm": "Dài", "width_mm": "Rộng",
          "height_mm": "Cao", "wheelbase_mm": "Chiều dài cơ sở", "price_as_of": "Ngày giá tham khảo",
          "duration_months": "Thời hạn bảo hành", "distance_limit_km": "Giới hạn bảo hành", "conditions": "Điều kiện bảo hành"}


def requested_spec_fields(question):
    q = normalize(question)
    terms = {"seats": ("so cho", "cho ngoi", "ghe"), "fuel_type": ("nhien lieu", "may dau", "xang"),
             "transmission": ("hop so", "so san", "tu dong"), "engine": ("dong co",),
             "engine_power_hp": ("cong suat",), "length_mm": ("chieu dai",), "width_mm": ("chieu rong",),
             "height_mm": ("chieu cao",), "wheelbase_mm": ("chieu dai co so",)}
    requested = {field for field, words in terms.items()
                 if any(re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)",
                                  q.replace("chieu dai co so", "") if field == "length_mm" else q)
                        for word in words)}
    if not requested and "thong so" in q:
        requested = set(terms)
    return requested


def comparison_requirements(result):
    if result.analysis.intent != "compare_cars":
        return set()
    requested = requested_spec_fields(result.analysis.question)
    if re.search(r"\bgia\b(?!\s+dinh\b)|bao nhieu tien", normalize(result.analysis.question)):
        requested.add("price_vnd_from")
    return {(c.car_id, field) for c in result.cars for field in requested
            if getattr(c, field) is not None and (field != "price_vnd_from" or c.price_source_id)}


def missing_requested_facts(result):
    if result.analysis.intent not in {"ask_specification", "compare_cars"}:
        return []
    requested = requested_spec_fields(result.analysis.question)
    return [f"{c.display_name}: chưa có dữ liệu {LABELS[field].lower()}."
            for c in result.cars for field in sorted(requested) if getattr(c, field) is None]


def required_qualifiers(result, context_ids=None):
    used = [e for e in result.evidence if context_ids is None or e.context_id in context_ids]
    lines = list(result.analysis.limitations) + missing_requested_facts(result)
    for section, qualifier in (("price", PRICE_LIMITATION), ("specifications", SPEC_LIMITATION), ("warranty", WARRANTY_LIMITATION)):
        if any(e.section == section and e.metadata.get("facts") for e in used):
            lines.append(qualifier)
    for e in used:
        if e.section == "warranty":
            condition = e.metadata.get("policyConditions") or e.metadata.get("facts", {}).get("conditions", {}).get("value")
            if condition:
                lines.append(condition)
    for c in result.cars:
        if any(e.car_id == c.car_id for e in used) and c.market_status_vn != "official_current":
            lines.append(f"{c.display_name}: " + STATUS.get(c.market_status_vn, "Chưa xác minh tình trạng thị trường."))
    return list(dict.fromkeys(lines))


def build_context(result):
    facts, citations, statements = {}, [], {}
    for e in result.evidence:
        name = e.metadata.get("displayName") or e.metadata.get("brand") or e.metadata.get("entityId")
        ids = []
        for field, fact in e.metadata.get("facts", {}).items():
            fid = f"{e.context_id}:{field}"
            ids.append(fid)
            facts[fid] = dict(fact, contextId=e.context_id,
                                                   subjectId=e.car_id or e.metadata.get("entityId"))
            value = fact["value"]
            if field == "price_vnd_from":
                formatted = f"{value:,}".replace(",", ".")
                statements[f"{name} có giá tham khảo từ {formatted} VND."] = [fid]
            elif field == "seats":
                statements[f"{name} có {value} chỗ."] = [fid]
            elif field in LABELS:
                value = ENUMS.get(value, value)
                statements[f"{name} — {LABELS[field]}: {value}{(' ' + fact['unit']) if fact.get('unit') else ''}."] = [fid]
        if ids:
            statements[e.content] = ids
        for sid in e.source_ids or [None]:
            source = result.sources.get(sid)
            citations.append(Citation(context_id=e.context_id, source_id=sid if source else None,
                title=source.title if source else f"Bản ghi dữ liệu — {e.context_id}",
                url=source.url if source else None,
                source_detail_path=f"/sources/{quote(sid, safe='')}" if source else None))
    payload = {"question": result.analysis.question, "intent": result.analysis.intent,
               "filters": result.filters.model_dump(), "limitations": result.analysis.limitations,
               "facts": facts, "evidence": [e.model_dump() for e in result.evidence],
               "citations": [c.model_dump() for c in citations],
               "allowedStatements": [{"text": text, "factIds": ids} for text, ids in statements.items()]}
    return ContextPackage(result, facts, citations, json.dumps(payload, ensure_ascii=False, default=str), statements)
