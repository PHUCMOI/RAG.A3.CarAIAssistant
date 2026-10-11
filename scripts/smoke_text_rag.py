"""Live embedding + five-intent model smoke; any degraded mode fails explicitly."""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import get_settings
from app.infrastructure.ai.embedding import E5EmbeddingProvider

CASES = [("find_car", "Tìm SUV 5 chỗ dưới 800 triệu"), ("ask_specification", "Thông số Honda CR-V"),
         ("ask_price", "Giá Honda CR-V"), ("ask_warranty", "Honda CR-V bảo hành bao lâu?"),
         ("compare_cars", "So sánh Honda CR-V và Mazda CX-5 về giá và số chỗ")]


async def run(api_url, output=None):
    settings = get_settings()
    embedding = E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir)
    vectors = await embedding.embed([q for _, q in CASES], query=True)
    report = {"embeddingModel": embedding.model, "embeddingVersion": embedding.version,
              "dimensions": [len(v) for v in vectors], "cases": []}
    report["llmProvider"] = settings.llm_provider
    path = Path(output) if output else ROOT / "eval/live_smoke_text.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=settings.generation_timeout + 30) as client:
        report["bedrockModel"] = settings.bedrock_model_id
        report["awsRegion"] = settings.aws_region
        for intent, question in CASES:
            start = time.perf_counter()
            case = {"question": question, "expectedIntent": intent, "passed": False, "error": ""}
            try:
                response = await client.post(api_url.rstrip("/") + "/api/chat", json={"question": question})
                case["httpStatus"] = response.status_code
                data = response.raise_for_status().json()
                case.update(passed=data["intent"] == intent and data["grounded"] and data["generationMode"] == "bedrock-natural"
                            and data["retrieval"] in {"postgresql-vector-search", "postgresql-hybrid-search"}, response=data)
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                case["error"] = type(exc).__name__
            case["responseSeconds"] = time.perf_counter() - start
            report["cases"].append(case)
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(path), "passed": [c["passed"] for c in report["cases"]]}))
    return 0 if all(c["passed"] for c in report["cases"]) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:5080")
    parser.add_argument("--output", type=Path, help="Persist every case, including failures, to this report")
    args = parser.parse_args()
    try:
        raise SystemExit(asyncio.run(run(args.api_url, args.output)))
    except Exception as exc:
        print(f"Live smoke failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
