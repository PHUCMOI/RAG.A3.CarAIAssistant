"""Incremental indexing; inference happens outside database transactions."""
import json
import re
from app.application.rag.documents import make_document, ENUMS
from app.infrastructure.ai.embedding import validate_vector


def split_documents(documents, tokenizer, max_tokens=350):
    output = []
    def fits(text):
        return len(tokenizer.encode("passage: " + text, add_special_tokens=True)) <= max_tokens
    for d in documents:
        if fits(d.content):
            output.append(d)
            continue
        lines = d.content.splitlines()
        subject = f"Đối tượng: {d.metadata.get('displayName') or d.metadata.get('brand') or d.metadata['entityId']}."
        segments = [part for line in lines for part in re.split(r"(?<=[.!?])\s+(?=[A-ZĐ])", line) if part]
        groups, group = [], []
        for segment in segments:
            if not fits(subject + "\n" + segment):
                raise ValueError(f"A complete claim exceeds token cap: {d.document_id}")
            if group and not fits(subject + "\n" + "\n".join(group + [segment])):
                groups.append(group)
                group = []
            group.append(segment)
        if group:
            groups.append(group)
        for n, group in enumerate(groups, 1):
            content = "\n".join(group)
            facts = {key: value for key, value in d.metadata.get("facts", {}).items()
                     if str(value["value"]) in content or str(ENUMS.get(value["value"], value["value"])) in content}
            metadata = {key: value for key, value in d.metadata.items() if key not in {"facts", "sourceIds"}}
            metadata["parentContextId"] = d.document_id
            metadata["parentContentHash"] = d.content_hash
            metadata["partNumber"], metadata["partCount"] = n, len(groups)
            output.append(make_document(f"{d.document_id}:part:{n}", d.car_id, d.section,
                                       [subject, *group], facts, metadata, d.source_id))
    return output


async def sync_documents(store, documents):
    hashes = await store.document_hashes()
    changed = 0
    for doc in documents:
        if hashes.get(doc.document_id) != doc.content_hash:
            await store.upsert_document(doc)
            changed += 1
    await store.remove_orphans([d.document_id for d in documents])
    return {"documents": len(documents), "changed": changed, "unchanged": len(documents) - changed}


class IndexStore:
    def __init__(self, conn):
        self.conn = conn

    async def document_hashes(self):
        return {r["document_id"]: r["content_hash"] for r in await self.conn.fetch("SELECT document_id, content_hash FROM documents WHERE template_version = 'vi-v1'")}

    async def upsert_document(self, d):
        await self.conn.execute("""
            INSERT INTO documents(document_id, car_id, section, content, source_id, metadata, content_hash, template_version)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
            ON CONFLICT(document_id) DO UPDATE SET car_id=EXCLUDED.car_id, section=EXCLUDED.section,
              content=EXCLUDED.content, source_id=EXCLUDED.source_id, metadata=EXCLUDED.metadata,
              content_hash=EXCLUDED.content_hash, template_version=EXCLUDED.template_version,
              text_embedding=NULL, embedding_model=NULL, embedding_version=NULL, embedded_at=NULL, updated_at=now()
            WHERE documents.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        """, d.document_id, d.car_id, d.section, d.content, d.source_id, json.dumps(d.metadata, ensure_ascii=False), d.content_hash, d.template_version)

    async def remove_orphans(self, ids):
        await self.conn.execute("DELETE FROM documents WHERE template_version = 'vi-v1' AND NOT(document_id = ANY($1::text[]))", ids)

    async def pending(self, model, version, force=False):
        return await self.conn.fetch("""
            SELECT document_id, content, content_hash FROM documents WHERE template_version='vi-v1'
            AND ($3 OR text_embedding IS NULL OR embedding_model IS DISTINCT FROM $1 OR embedding_version IS DISTINCT FROM $2)
            ORDER BY document_id
        """, model, version, force)

    async def write_embedding(self, row, vector, model, version):
        vector = validate_vector(vector)
        result = await self.conn.execute("""
            UPDATE documents SET text_embedding=$2::vector, embedding_model=$3, embedding_version=$4, embedded_at=now()
            WHERE document_id=$1 AND content_hash=$5
        """, row["document_id"], json.dumps(vector), model, version, row["content_hash"])
        if result != "UPDATE 1":
            raise ValueError("Document changed during embedding; rebuild before activating index")


async def embed_pending(store, provider, force=False):
    # Resolve the model revision before selecting pending work (never store the mutable 'main' alias).
    await provider.embed(["Kiểm tra phiên bản embedding."])
    pending = await store.pending(provider.model, provider.version, force)
    for start in range(0, len(pending), 16):
        rows = pending[start:start + 16]
        vectors = await provider.embed([row["content"] for row in rows])
        if len(rows) != len(vectors):
            raise ValueError("Embedding response count mismatch")
        for row, vector in zip(rows, vectors):
            await store.write_embedding(row, vector, provider.model, provider.version)
    return {"embedded": len(pending), "embeddingModel": provider.model, "embeddingVersion": provider.version}
