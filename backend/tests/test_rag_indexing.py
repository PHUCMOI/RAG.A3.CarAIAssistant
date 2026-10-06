import asyncio
from tests.rag_fixtures import car


def test_document_chunking_preserves_fact_metadata_and_token_cap():
    from app.application.rag.documents import build_documents
    from app.application.rag.indexing import split_documents
    class Tokenizer:
        def encode(self, value, **kwargs):
            return value.split()
    docs = build_documents([car()], [], [])
    chunks = split_documents(docs, Tokenizer(), max_tokens=35)
    assert all(len(("passage: " + d.content).split()) <= 35 for d in chunks)
    spec_chunks = [d for d in chunks if d.section == "specifications"]
    # Qualifier-only chunks may have no facts; numeric claims must retain their evidence.
    assert {k for d in spec_chunks for k in d.metadata["facts"]} >= {"seats", "fuel_type", "engine"}
    assert all("Honda CR-V" in d.content for d in spec_chunks)


def test_empty_or_unrepresentable_chunk_fails_instead_of_truncating_facts():
    import pytest
    from app.application.rag.indexing import split_documents
    from app.application.rag.documents import build_documents
    class Tokenizer:
        def encode(self, value, **kwargs):
            return list(value)
    with pytest.raises(ValueError):
        split_documents(build_documents([car()], [], []), Tokenizer(), max_tokens=5)


def test_idempotent_ingestion_invalidates_only_changed_embedding():
    from app.application.rag.indexing import sync_documents
    from app.application.rag.documents import build_documents
    class Store:
        def __init__(self):
            self.docs = {}
            self.writes = []
        async def document_hashes(self):
            return {key: doc.content_hash for key, doc in self.docs.items()}
        async def upsert_document(self, doc):
            self.docs[doc.document_id] = doc
            self.writes.append(doc.document_id)
        async def remove_orphans(self, ids):
            for key in list(self.docs):
                if key not in ids:
                    del self.docs[key]
    async def run():
        store = Store()
        a = build_documents([car()], [], [])
        assert (await sync_documents(store, a))["changed"] == len(a)
        assert (await sync_documents(store, a))["changed"] == 0
        store.writes.clear()
        assert (await sync_documents(store, build_documents([car(price_vnd_from=900000000)], [], [])))["changed"] == 1
        assert store.writes == ["car:car_34_3:price:v1"]
    asyncio.run(run())


def test_validation_rejects_wrong_configured_embedding_identity(monkeypatch):
    import sys
    from pathlib import Path
    import json
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    import text_index_cli as cli
    from app.application.rag.documents import build_documents
    from tests.test_rag_retrieval import MemoryRepository
    docs = build_documents([car()], [], [])
    class Conn:
        async def fetch(self, *args):
            return [dict(d.__dict__, vector_text=json.dumps([1.0] + [0.0] * 767),
                         embedding_model="wrong-model", embedding_version="old-sha:e5-prefix-l2-vi-v1") for d in docs]
    class Repo(MemoryRepository):
        async def snapshot(self):
            return self.cars, [], [], {sid: None for d in docs for sid in d.metadata["sourceIds"]}
    monkeypatch.setattr(cli, "RagRepository", lambda conn: Repo([car()]))
    r = asyncio.run(cli.validate_index(Conn(), expected_cars=1,
        expected_model="intfloat/multilingual-e5-base", expected_version="new-sha:e5-prefix-l2-vi-v1"))
    assert not r["ready"] and any("configured" in e for e in r["errors"])
    r = asyncio.run(cli.validate_index(Conn(), expected_cars=1, require_embeddings=False))
    assert r["valid"] and not r["ready"]


def test_validation_detects_missing_child_chunk(monkeypatch):
    import sys
    import json
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    import text_index_cli as cli
    from app.application.rag.documents import build_documents
    from app.application.rag.indexing import split_documents
    from tests.test_rag_retrieval import MemoryRepository
    class Tokenizer:
        def encode(self, text, **kwargs):
            return text.split()
    docs = split_documents(build_documents([car()], [], []), Tokenizer(), 35)
    removed = next(d for d in docs if ":part:2" in d.document_id)
    class Conn:
        async def fetch(self, *args):
            return [dict(d.__dict__, vector_text=None) for d in docs if d is not removed]
    class Repo(MemoryRepository):
        async def snapshot(self):
            return self.cars, [], [], {sid: None for d in docs for sid in d.metadata["sourceIds"]}
    monkeypatch.setattr(cli, "RagRepository", lambda conn: Repo([car()]))
    r = asyncio.run(cli.validate_index(Conn(), 1, require_embeddings=False))
    assert not r["valid"] and any("Incomplete chunks" in e for e in r["errors"])
