"""HTTP text metrics and honest human-review placeholders, separated by split."""
import argparse
import csv
import json
import statistics
import sys
import time
from pathlib import Path
import httpx
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from eval.text_metrics import retrieval_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:5080")
    parser.add_argument("--ground-truth", type=Path, default=ROOT / "eval/ground_truth_text.jsonl")
    parser.add_argument("--output", type=Path, default=ROOT / "eval/results_text.csv")
    parser.add_argument("--split", choices=["development", "evaluation", "all"], default="evaluation")
    args = parser.parse_args()
    cases = [json.loads(line) for line in args.ground_truth.read_text(encoding="utf-8").splitlines() if line.strip()]
    rows, groups = [], {}
    with httpx.Client(timeout=100) as client:
        for case in cases:
            if args.split != "all" and case["split"] != args.split:
                continue
            start = time.perf_counter()
            row = {"id": case["id"], "split": case["split"], "intent_correct": None, "context_precision_at_5": None,
                   "context_recall_at_5": None, "faithfulness": None, "answer_completeness": None,
                   "human_review": "pending", "error": ""}
            try:
                response = client.post(args.api_url.rstrip("/") + "/api/chat", json={"question": case["question"]})
                response.raise_for_status()
                data = response.json()
                retrieved = [e["contextId"] for e in data["evidence"]]
                metrics = retrieval_metrics(retrieved, case["relevant_context_ids"])
                row.update(intent_correct=int(data["intent"] == case["intent"]),
                    context_precision_at_5=metrics["precision"], context_recall_at_5=metrics["recall"],
                    status_correct=int(data["status"] == case["expected_status"]), generation_mode=data["generationMode"],
                    answer=data["answer"], retrieved_context_ids=json.dumps(retrieved),
                    citations=json.dumps(data["citations"], ensure_ascii=False),
                    required_answer_facts=json.dumps(case["required_answer_facts"], ensure_ascii=False))
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                row["error"] = type(exc).__name__
            row["response_seconds"] = time.perf_counter() - start
            rows.append(row)
            groups.setdefault(case["split"], []).append(row)
    fields = list(dict.fromkeys(key for row in rows for key in row))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    summary = {}
    for split, group in groups.items():
        summary[split] = {"cases": len(group), "errors": sum(bool(r["error"]) for r in group), "humanReview": "pending"}
        for field in ("intent_correct", "context_precision_at_5", "context_recall_at_5", "response_seconds"):
            values = [r[field] for r in group if r[field] is not None and not r["error"]]
            summary[split][field] = statistics.mean(values) if values else None
    args.output.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 1 if any(row["error"] for row in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
