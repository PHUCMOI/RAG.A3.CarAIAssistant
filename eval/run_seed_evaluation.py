"""Deterministic seed regression diagnostics. Does not claim vector/LLM performance."""
import asyncio
import csv
import json
import statistics
import sys
import time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT))
from eval.seed_snapshot import load_seed_snapshot
from eval.text_metrics import retrieval_metrics
from app.application.rag.intent import matches_filters
from app.application.rag.rag import RagService
from app.application.rag.text_retriever import TextRetriever


class SeedRepository:
    def __init__(self):
        self.data = load_seed_snapshot()
    async def catalogue(self):
        return self.data[0]
    async def snapshot(self):
        return self.data
    async def candidates(self, filters, car_ids=None):
        return sorted([c for c in self.data[0] if matches_filters(c, filters) and (car_ids is None or c.car_id in car_ids)],
                      key=lambda c: (c.price_vnd_from if c.price_vnd_from is not None else 10**20, c.display_name))
    async def lexical(self, *args):
        return []


async def main():
    repo = SeedRepository()
    service = RagService(repo, TextRetriever(repo))
    cases = [json.loads(line) for line in (ROOT / "eval/ground_truth_text.jsonl").read_text(encoding="utf-8").splitlines()]
    rows = []
    for case in cases:
        start = time.perf_counter()
        result = await service.answer(case["question"])
        r = result.retrieval_result
        metrics = retrieval_metrics([e.context_id for e in r.evidence], case["relevant_context_ids"])
        rows.append({"id": case["id"], "split": case["split"], "intent_correct": int(r.analysis.intent == case["intent"]),
            "status_correct": int(result.status == case["expected_status"]),
            "context_precision_at_5": metrics["precision"], "context_recall_at_5": metrics["recall"],
            "response_seconds": time.perf_counter() - start, "generation_mode": result.generation_mode,
            "answer": result.answer, "faithfulness": None, "answer_completeness": None, "human_review": "pending"})
    path = ROOT / "eval/seed_template_results.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    report = {"runtime": "offline committed SQL snapshot / structured template only", "vector": False, "llm": False,
              "humanReview": "pending", "splits": {}}
    for split in ("development", "evaluation"):
        group = [r for r in rows if r["split"] == split]
        report["splits"][split] = {"cases": len(group)}
        for field in ("intent_correct", "status_correct", "context_precision_at_5", "context_recall_at_5", "response_seconds"):
            values = [r[field] for r in group if r[field] is not None]
            report["splits"][split][field] = statistics.mean(values) if values else None
    (ROOT / "eval/seed_template_summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
