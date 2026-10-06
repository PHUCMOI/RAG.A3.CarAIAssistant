"""Shared command implementation for the four text indexing entrypoints."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.core.config import get_settings
from app.repositories.rag_repository import RagRepository
from app.application.rag.documents import build_documents, make_document
from app.application.rag.indexing import IndexStore, split_documents, sync_documents, embed_pending
from app.infrastructure.ai.embedding import E5EmbeddingProvider, validate_vector
import asyncpg
import httpx


async def validate_index(conn, expected_cars=50, require_embeddings=True, expected_model=None, expected_version=None):
    cars, warranties, dealers, sources = await RagRepository(conn).snapshot()
    canonical = {d.document_id: d for d in build_documents(cars, warranties, dealers)}
    rows = await conn.fetch("SELECT *, text_embedding::text AS vector_text FROM documents WHERE template_version='vi-v1'")
    errors, versions, parents, car_ids, parts = [], set(), set(), set(), {}
    if len(cars) != expected_cars:
        errors.append(f"Expected {expected_cars} cars, found {len(cars)}")
    for row in rows:
        metadata = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]
        recomputed = make_document(row["document_id"], row["car_id"], row["section"],
                                  [row["content"]], metadata.get("facts", {}), metadata, row["source_id"])
        if recomputed.content_hash != row["content_hash"]:
            errors.append(f"Corrupt content hash: {row['document_id']}")
        parent = metadata.get("parentContextId", row["document_id"])
        if "parentContextId" in metadata:
            parts.setdefault(parent, []).append((metadata.get("partNumber"), metadata.get("partCount")))
        parents.add(parent)
        if row["car_id"]:
            car_ids.add(row["car_id"])
        if parent not in canonical:
            errors.append(f"Orphan document: {row['document_id']}")
        elif metadata.get("parentContentHash", row["content_hash"]) != canonical[parent].content_hash:
            errors.append(f"Stale document: {row['document_id']}")
        if any(sid not in sources for sid in metadata.get("sourceIds", [])):
            errors.append(f"Missing source: {row['document_id']}")
        if row["vector_text"]:
            try:
                validate_vector(json.loads(row["vector_text"]))
                versions.add((row["embedding_model"], row["embedding_version"]))
                if require_embeddings and (row["embedding_model"], row["embedding_version"]) != (expected_model, expected_version):
                    errors.append(f"Embedding differs from configured model/revision: {row['document_id']}")
            except ValueError:
                errors.append(f"Invalid vector: {row['document_id']}")
        elif require_embeddings:
            errors.append(f"Pending embedding: {row['document_id']}")
    if set(canonical) - parents:
        errors.append(f"Missing documents: {sorted(set(canonical) - parents)}")
    row_ids = {row["document_id"] for row in rows}
    for parent, group in parts.items():
        counts = {count for _, count in group}
        if (len(counts) != 1 or not all(isinstance(n, int) and isinstance(c, int) and c > 0 for n, c in group)
            or {n for n, _ in group} != set(range(1, group[0][1] + 1)) or parent in row_ids):
            errors.append(f"Incomplete chunks or duplicate parent: {parent}")
    if len(car_ids) != len(cars):
        errors.append("Document car coverage incomplete")
    if require_embeddings and (len(versions) != 1 or any(not m or not v or v.startswith("main:") for m, v in versions)):
        errors.append("Embedding model/version must be one resolved revision")
    if require_embeddings and (not expected_model or not expected_version):
        errors.append("Missing configured resolved embedding identity")
    return {"valid": not errors, "ready": require_embeddings and not errors, "cars": len(cars),
            "documents": len(rows), "errors": errors, "embeddingVersions": sorted(versions),
            "expectedEmbeddingModel": expected_model, "expectedEmbeddingVersion": expected_version}


async def run(args):
    settings = get_settings()
    conn = await asyncpg.connect(settings.get_postgres_dsn(), timeout=5)
    report = {"mode": args.mode}
    try:
        # Advisory session lock prevents two CLI writers from pruning or re-embedding each other's work.
        if args.mode != "validate" and not await conn.fetchval("SELECT pg_try_advisory_lock(7342002)"):
            raise ValueError("Another text indexing process is running")
        store = IndexStore(conn)
        provider = E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir)
        if args.mode in {"build", "ingest"}:
            cars, warranties, dealers, sources = await RagRepository(conn).snapshot()
            if len(cars) != args.expected_cars:
                raise ValueError(f"Seed verification failed: expected {args.expected_cars} cars, found {len(cars)}")
            documents = build_documents(cars, warranties, dealers)
            if any(sid not in sources for d in documents for sid in d.metadata["sourceIds"]):
                raise ValueError("Cannot index documents with missing source references")
            if not args.without_embeddings:
                documents = split_documents(documents, await provider.tokenizer())
            async with conn.transaction():
                report.update(await sync_documents(store, documents))
            output = ROOT / "data" / "documents.jsonl"
            output.parent.mkdir(parents=True, exist_ok=True)
            # Write after the DB commit so a failed ingestion does not replace the export.
            temp = output.with_suffix(".jsonl.tmp")
            temp.write_text("".join(json.dumps(d.__dict__, ensure_ascii=False) + "\n" for d in documents), encoding="utf-8")
            temp.replace(output)
        if args.mode in {"build", "embed"} and not args.without_embeddings:
            report.update(await embed_pending(store, provider, args.force))
        require_embeddings = not args.without_embeddings and args.mode != "ingest"
        if require_embeddings:
            await provider.resolve_version()
        report["validation"] = await validate_index(conn, args.expected_cars, require_embeddings,
            provider.model if require_embeddings else None, provider.version if require_embeddings else None)
        report["generationProvider"] = {"model": settings.ollama_model, "digest": None, "status": "unavailable"}
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(settings.ollama_url.rstrip("/") + "/api/tags")
                response.raise_for_status()
                model = next((m for m in response.json()["models"] if m.get("name") == settings.ollama_model), None)
                report["generationProvider"].update(digest=model.get("digest") if model else None,
                    status="installed" if model else "not_installed")
        except (httpx.HTTPError, ValueError, KeyError):
            pass  # Text index readiness is independent of the generation server.
        (ROOT / "data").mkdir(exist_ok=True)
        (ROOT / "data" / "text_index_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["validation"]["valid"] else 1
    finally:
        await conn.close()


def main(mode):
    parser = argparse.ArgumentParser(description="Vietnamese PostgreSQL text RAG indexing")
    parser.add_argument("--without-embeddings", action="store_true", help="Structured/lexical preparation only; not a vector-ready index")
    parser.add_argument("--force", action="store_true", help="Re-embed all managed documents")
    parser.add_argument("--expected-cars", type=int, default=50)
    args = parser.parse_args()
    args.mode = mode
    try:
        return asyncio.run(run(args))
    except Exception as exc:
        print(f"Text indexing failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
