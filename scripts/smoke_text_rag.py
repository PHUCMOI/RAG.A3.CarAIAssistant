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


async def run(api_url):
    settings = get_settings()
    embedding = E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir)
    vectors = await embedding.embed([q for _, q in CASES], query=True)
    report = {"embeddingModel": embedding.model, "embeddingVersion": embedding.version,
              "dimensions": [len(v) for v in vectors], "cases": []}
    report["llmProvider"] = settings.llm_provider
    async with httpx.AsyncClient(timeout=settings.generation_timeout + 30) as client:
        if settings.llm_provider == "ollama":
            tags = (await client.get(settings.ollama_url.rstrip("/") + "/api/tags")).raise_for_status().json()
            model = next((m for m in tags["models"] if m.get("name") == settings.ollama_model), None)
            report["ollamaModel"] = settings.ollama_model
            report["ollamaDigest"] = model.get("digest") if model else None
            if not report["ollamaDigest"]:
                raise ValueError("Configured Ollama model is not installed")
        else:
            report["bedrockModel"] = settings.bedrock_model_id
            report["awsRegion"] = settings.aws_region
        for intent, question in CASES:
            start = time.perf_counter()
            data = (await client.post(api_url.rstrip("/") + "/api/chat", json={"question": question})).raise_for_status().json()
            report["cases"].append({"question": question, "expectedIntent": intent,
                "passed": data["intent"] == intent and data["grounded"] and data["generationMode"] == "llm"
                          and data["retrieval"] in {"postgresql-vector-search", "postgresql-hybrid-search"},
                "responseSeconds": time.perf_counter() - start, "response": data})
    path = ROOT / "eval/live_smoke_text.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(path), "passed": [c["passed"] for c in report["cases"]]}))
    return 0 if all(c["passed"] for c in report["cases"]) else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:5080")
    args = parser.parse_args()
    try:
        raise SystemExit(asyncio.run(run(args.api_url)))
    except Exception as exc:
        print(f"Live smoke failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
