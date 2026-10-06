"""Build the project text evaluation set from seed or PostgreSQL facts."""
import json
import sys
import argparse
import asyncio
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT))
from app.application.rag.documents import build_documents
from app.application.rag.contracts import Document


def build_ground_truth(cars, warranties, dealers, index_documents=None):
    by_id = {c.car_id: c for c in cars}
    pool = [by_id[cid] for cid in ("car_34_3", "car_57_7", "car_92_34", "car_92_44", "car_34_2",
        "car_57_11", "car_36_24", "car_36_20", "car_29_30", "car_29_9", "car_43_13", "car_64_20", "car_87_10")]
    documents = {d.document_id: d for d in build_documents(cars, warranties, dealers)}
    indexed = {}
    for d in index_documents or documents.values():
        indexed.setdefault(d.metadata.get("parentContextId", d.document_id), []).append(d)
    items = []
    def append(question, intent, subjects, contexts, category, status="ok"):
        selected = []
        for cid in contexts:
            chunks = indexed.get(cid, [])
            if not chunks:
                raise ValueError(f"Ground truth context absent from index snapshot: {cid}")
            if any(d.metadata.get("parentContentHash", d.content_hash) != documents[cid].content_hash for d in chunks):
                raise ValueError(f"Stale ground truth index snapshot: {cid}")
            selected.extend(chunks)
        contexts = [d.document_id for d in selected]
        facts = [f"{d.metadata.get('displayName', d.car_id)}: {field}={fact['value']}"
                 for d in selected for field, fact in d.metadata["facts"].items()
                 if category not in {"comparison", "specification"} or field in
                 ({"price_vnd_from", "seats"} if category == "comparison" else {"seats", "fuel_type", "transmission"})]
        index = len(items) + 51
        items.append({"id": f"Q{index:03d}", "input_type": "text", "question": question, "image": None,
            "intent": intent, "expected_car_ids": [c.car_id for c in subjects], "relevant_context_ids": contexts,
            "required_answer_facts": facts or ["Nêu rõ dữ liệu thiếu hoặc yêu cầu làm rõ"],
            "reference_answer": "\n".join(d.content for d in selected) if selected else
                ("Cần làm rõ điều kiện/tên xe." if status == "needs_clarification" else "Chưa có dữ liệu phù hợp."),
            "created_by": "autowise", "reviewed_by": None, "review_status": "pending",
            "split": "development" if index <= 60 else "evaluation", "category": category, "expected_status": status})
    for c in pool[:12]:
        append(f"Giá tham khảo của {c.display_name} là bao nhiêu?", "ask_price", [c], [f"car:{c.car_id}:price:v1"], "price")
    for c in pool[:10]:
        append(f"{c.display_name} được bảo hành bao lâu, bao nhiêu km và điều kiện áp dụng?", "ask_warranty", [c],
               [f"warranty:car:{c.car_id}:v1"], "warranty")
    for i in range(12):
        a, b = pool[i], pool[(i + 1) % len(pool)]
        append(f"So sánh {a.display_name} và {b.display_name} về giá tham khảo và số chỗ.", "compare_cars", [a, b],
               [f"car:{a.car_id}:price:v1", f"car:{b.car_id}:price:v1", f"car:{a.car_id}:specifications:v1", f"car:{b.car_id}:specifications:v1"], "comparison")
    for brand in ("Honda", "Toyota", "Mazda", "Hyundai", "Ford", "Suzuki"):
        matching = sorted((c for c in cars if c.brand == brand and c.price_source_id and c.price_vnd_from is not None and c.price_vnd_from <= 1500000000),
                          key=lambda c: (c.price_vnd_from, c.display_name))[:5]
        append(f"Tìm xe {brand} có giá không quá 1,5 tỷ đồng.", "find_car", matching,
               [f"car:{c.car_id}:price:v1" for c in matching], "discovery")
    for c in pool[:5]:
        append(f"Thông số số chỗ, nhiên liệu và hộp số của {c.display_name}?", "ask_specification", [c],
               [f"car:{c.car_id}:specifications:v1"], "specification")
    append("Tìm SUV trên 2 tỷ và dưới 1 tỷ.", "find_car", [], [], "edge", "needs_clarification")
    append("So sánh Honda CR-V.", "compare_cars", [], [], "edge", "needs_clarification")
    append("Tìm SUV 5 chỗ dưới 1 triệu đồng.", "find_car", [], [], "edge", "no_data")
    append("Thông số Honda CR-V phiên bản 2025 có đúng với bản Việt Nam không?", "ask_specification", [pool[0]],
           [f"car:{pool[0].car_id}:specifications:v1"], "edge", "partial")
    append("Hãy viết một bài thơ về biển.", "other", [], [], "edge", "no_data")
    return items


if __name__ == "__main__":
    from eval.seed_snapshot import load_seed_snapshot
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", action="store_true", help="Use current configured PostgreSQL facts")
    parser.add_argument("--index-documents", type=Path, help="Resolve context IDs against actual indexing export")
    parser.add_argument("--export-seed-documents", action="store_true", help="Explicitly replace data/documents.jsonl with offline seed documents")
    args = parser.parse_args()
    if args.export_seed_documents and (args.database or args.index_documents):
        parser.error("Seed document export must use offline seed without an index snapshot")
    if args.database:
        import asyncpg
        from app.core.config import get_settings
        from app.repositories.rag_repository import RagRepository
        async def snapshot():
            conn = await asyncpg.connect(get_settings().get_postgres_dsn(), timeout=5)
            try:
                return await RagRepository(conn).snapshot()
            finally:
                await conn.close()
        cars, warranties, dealers, sources = asyncio.run(snapshot())
    else:
        cars, warranties, dealers, sources = load_seed_snapshot()
    indexed = [Document(**json.loads(line)) for line in args.index_documents.read_text(encoding="utf-8").splitlines()] if args.index_documents else None
    items = build_ground_truth(cars, warranties, dealers, indexed)
    (ROOT / "eval/ground_truth_text.jsonl").write_text("".join(json.dumps(q, ensure_ascii=False) + "\n" for q in items), encoding="utf-8")
    if args.export_seed_documents:
        output = ROOT / "data/documents.jsonl"
        output.parent.mkdir(exist_ok=True)
        output.write_text("".join(json.dumps(d.__dict__, ensure_ascii=False) + "\n" for d in build_documents(cars, warranties, dealers)), encoding="utf-8")
    print(f"Authored {len(items)} pending-review cases; active vector readiness requires separate validation.")
