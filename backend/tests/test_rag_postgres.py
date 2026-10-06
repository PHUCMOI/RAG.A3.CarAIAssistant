"""Real PostgreSQL/pgvector checks. Point TEST_DATABASE_URL at the isolated test service."""
import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4
import asyncpg
import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Set TEST_DATABASE_URL for real PostgreSQL/pgvector tests")


def test_migration_filters_vectors_and_incremental_index():
    from app.application.rag.contracts import RagFilters
    from app.application.rag.documents import build_documents
    from app.application.rag.indexing import IndexStore, sync_documents
    from app.repositories.rag_repository import RagRepository

    async def run():
        conn = await asyncpg.connect(os.environ["TEST_DATABASE_URL"])
        schema = "rag_test_" + uuid4().hex
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(f'CREATE SCHEMA "{schema}"')
            await conn.execute(f'SET search_path TO "{schema}", public')
            await conn.execute((ROOT / "database/001_schema.sql").read_text(encoding="utf-8-sig"))
            migration = (ROOT / "database/007_text_rag.sql").read_text(encoding="utf-8-sig")
            await conn.execute(migration)
            await conn.execute(migration)
            for file in ("seed.sql", "002_add_descriptions.sql", "003_enrich_missing_data.sql", "004_seed_dealers.sql"):
                await conn.execute((ROOT / "database" / file).read_text(encoding="utf-8-sig"))
            repo = RagRepository(conn)
            cars, warranties, dealers, sources = await repo.snapshot()
            assert len(cars) == 50 and len(dealers) == 22
            filtered = await repo.candidates(RagFilters(body_type="SUV", seats=5, max_price=800000000, max_price_inclusive=False))
            assert filtered and all(c.seats == 5 and c.price_vnd_from < 800000000 for c in filtered)
            assert await repo.candidates(RagFilters(), ["does-not-exist"]) == []
            docs = build_documents(cars, warranties, dealers)
            store = IndexStore(conn)
            assert (await sync_documents(store, docs))["changed"] == len(docs)
            assert (await sync_documents(store, docs))["changed"] == 0
            ids = [d.document_id for d in docs if d.section == "price"][:2]
            vectors = [[1.0] + [0.0] * 767, [0.0, 1.0] + [0.0] * 766]
            for doc_id, vector in zip(ids, vectors):
                row = await conn.fetchrow("SELECT document_id,content_hash FROM documents WHERE document_id=$1", doc_id)
                await store.write_embedding(row, vector, "fixture", "sha:fixture")
            result = await repo.vector(vectors[0], ids, "fixture", "sha:fixture")
            assert result[0].context_id == ids[0] and result[0].score > result[1].score
            assert await repo.lexical("giá", ids)
            changed_car = next(c for c in cars if f"car:{c.car_id}:price:v1" == ids[0])
            await conn.execute("UPDATE cars SET price_vnd_from=price_vnd_from+1000 WHERE car_id=$1", changed_car.car_id)
            cars, warranties, dealers, _ = await repo.snapshot()
            assert (await sync_documents(store, build_documents(cars, warranties, dealers)))["changed"] == 1
            assert await conn.fetchval("SELECT text_embedding IS NULL FROM documents WHERE document_id=$1", ids[0])
            assert not await conn.fetchval("SELECT text_embedding IS NULL FROM documents WHERE document_id=$1", ids[1])
        finally:
            await conn.execute('SET search_path TO public')
            await conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
            await conn.close()
    asyncio.run(run())
