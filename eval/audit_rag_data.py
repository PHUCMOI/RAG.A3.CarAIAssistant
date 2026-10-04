"""Reproducible seed audit for the 13 vehicles most used in the text evaluation set.

This checks internal data/provenance, not current prices on external websites.
"""
import json
import sys
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT))
from eval.seed_snapshot import load_seed_snapshot


def audit(cases, cars, warranties, sources):
    usage = Counter(cid for case in cases for cid in case["expected_car_ids"])
    by_id = {c.car_id: c for c in cars}
    rows = []
    technical = ("engine_power_hp", "length_mm", "width_mm", "height_mm", "wheelbase_mm")
    for cid, count in usage.most_common(13):
        c = by_id[cid]
        policies = [w for w in warranties if w.car_id == cid] or [w for w in warranties if w.car_id is None and w.brand_name == c.brand]
        policy = sorted(policies, key=lambda w: w.warranty_id)[0] if policies else None
        issues = ["Thông số DVM-CAR/UK chưa có provenance riêng theo trường hoặc xác minh phiên bản Việt Nam."]
        missing = [field for field in technical if getattr(c, field) is None]
        if missing:
            issues.append("Thiếu thông số: " + ", ".join(missing))
        if c.price_source_id not in sources or c.price_vnd_from is None:
            issues.append("Thiếu giá có nguồn hợp lệ.")
        if c.presence_source_id not in sources:
            issues.append("Thiếu nguồn tình trạng thị trường.")
        if not policy or policy.source_id not in sources:
            issues.append("Thiếu policy bảo hành có nguồn.")
        elif policy.car_id is None:
            issues.append("Policy theo hãng; cần xác nhận VIN/ngày bán, đặc biệt xe nhập khẩu/lịch sử.")
        if policy and (c.warranty_months, c.warranty_distance_km) != (policy.duration_months, policy.distance_limit_km):
            issues.append("Giá trị bảo hành trên cars khác policy; RAG ưu tiên policy. Cần đối chiếu với nguồn dữ liệu gốc.")
        rows.append({"carId": cid, "displayName": c.display_name, "questionOccurrences": count,
            "marketStatusVn": c.market_status_vn, "priceVndFrom": c.price_vnd_from,
            "priceAsOf": str(c.price_as_of), "priceSourceId": c.price_source_id,
            "warrantyId": policy.warranty_id if policy else None, "issues": issues})
    return {"snapshot": "committed SQL seed", "externalSourceReview": "pending", "cars": rows}


def main():
    cases = [json.loads(line) for line in (ROOT / "eval/ground_truth_text.jsonl").read_text(encoding="utf-8").splitlines()]
    cars, warranties, _, sources = load_seed_snapshot()
    report = audit(cases, cars, warranties, sources)
    (ROOT / "eval/rag_data_audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# Kiểm tra dữ liệu Text RAG", "", "Báo cáo tạo từ SQL seed và bộ câu hỏi text của project; phạm vi là 13 xe xuất hiện nhiều nhất, không phải toàn bộ catalogue.", "", "Tạo lại từ root bằng `.venv/Scripts/python.exe eval/audit_rag_data.py`.", "",
        "Kiểm tra nội bộ trên SQL seed đã commit. Chưa xác minh giá/phiên bản hiện tại từ website nguồn; giá và phiên bản cần được đối chiếu trực tiếp với nguồn trước khi nghiệm thu.", "",
        "| Car ID | Xe | Số lần hỏi | Tình trạng | Giá tham khảo VND |", "|---|---|---:|---|---:|"]
    lines += [f"| {r['carId']} | {r['displayName']} | {r['questionOccurrences']} | {r['marketStatusVn']} | {r['priceVndFrom']} |" for r in report["cars"]]
    lines += ["", "Chi tiết nguồn giá, policy và lỗi theo từng xe: [rag_data_audit.json](../eval/rag_data_audit.json).", "",
        "Các điểm cần xử lý trước khi nghiệm thu: provenance thông số theo trường/phiên bản Việt Nam; trường kỹ thuật còn null; điều kiện áp dụng policy hãng và chênh lệch cars/policy nếu có.", "",
        "RAG hiện giữ cảnh báo DVM-CAR, giá tham khảo, thị trường lịch sử/nhập khẩu và điều kiện VIN/ngày bán; không bổ sung giá trị cho trường null."]
    (ROOT / "docs/RAG_DATA_AUDIT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Audited {len(report['cars'])} vehicles from committed SQL seed; external review pending.")


if __name__ == "__main__":
    main()
