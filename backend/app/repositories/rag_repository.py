"""Parameterized SQL for text RAG. Business filtering precedes document retrieval."""
import json
from app.models.schemas import SourceDto
from app.repositories.car_repository import CarRepository, map_car_row
from app.repositories.dealer_repository import DealerRepository
from app.repositories.source_repository import SourceRepository
from app.repositories.warranty_repository import WarrantyRepository
from app.application.rag.contracts import Evidence


class RagRepository:
    def __init__(self, conn):
        self.conn = conn

    async def catalogue(self):
        return await CarRepository.search(self.conn, limit=100)

    async def snapshot(self):
        # A short, consistent read. No model/tokenizer inference inside this transaction.
        async with self.conn.transaction(isolation="repeatable_read", readonly=True):
            cars = await self.catalogue()
            warranties = await WarrantyRepository.list_all(self.conn)
            dealers = await DealerRepository.search(self.conn)
            sources = {s.source_id: s for s in await SourceRepository.list_all(self.conn)}
        return cars, warranties, dealers, sources

    async def candidates(self, filters, car_ids=None):
        clauses, args = [], []
        for field, column in (("brand", "brand_name"), ("body_type", "body_type"),
            ("fuel_type", "fuel_type"), ("transmission", "transmission"), ("seats", "seats")):
            value = getattr(filters, field)
            if value is not None:
                args.append(value)
                clauses.append(f"{column} = ${len(args)}" if field == "seats" else f"lower({column}) = lower(${len(args)}::text)")
        for bound in ("min", "max"):
            value = getattr(filters, f"{bound}_price")
            if value is not None:
                args.append(value)
                op = ">" if bound == "min" else "<"
                op += "=" if getattr(filters, f"{bound}_price_inclusive") else ""
                clauses.append(f"price_vnd_from {op} ${len(args)} AND price_source_id IS NOT NULL")
        if car_ids is not None:
            args.append(car_ids)
            clauses.append(f"car_id = ANY(${len(args)}::text[])")
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        rows = await self.conn.fetch("SELECT * FROM cars" + where + " ORDER BY price_vnd_from NULLS LAST, display_name LIMIT 100", *args)
        return [map_car_row(row) for row in rows]

    async def lexical(self, query, document_ids):
        rows = await self.conn.fetch("""
            SELECT d.*, ts_rank_cd(search_vector, websearch_to_tsquery('simple', $1)) AS score
            FROM documents d WHERE split_part(document_id, ':part:', 1) = ANY($2::text[])
              AND search_vector @@ websearch_to_tsquery('simple', $1)
            ORDER BY score DESC, document_id LIMIT 30
        """, query, document_ids)
        return [map_evidence(row) for row in rows]

    async def index_compatible(self, model, version, document_ids):
        return bool(await self.conn.fetchval("""
            SELECT EXISTS(SELECT 1 FROM documents WHERE split_part(document_id, ':part:', 1) = ANY($3::text[])
              AND text_embedding IS NOT NULL AND embedding_model = $1 AND embedding_version = $2)
        """, model, version, document_ids))

    async def vector(self, vector, document_ids, model, version):
        rows = await self.conn.fetch("""
            SELECT d.*, 1 - (text_embedding <=> $1::vector) AS score FROM documents d
            WHERE split_part(document_id, ':part:', 1) = ANY($2::text[]) AND text_embedding IS NOT NULL
              AND embedding_model = $3 AND embedding_version = $4
            ORDER BY text_embedding <=> $1::vector, document_id LIMIT 30
        """, json.dumps(vector), document_ids, model, version)
        return [map_evidence(row) for row in rows]

    async def has_embeddings(self):
        return bool(await self.conn.fetchval("SELECT EXISTS(SELECT 1 FROM documents WHERE text_embedding IS NOT NULL)"))


def map_evidence(row):
    metadata = row["metadata"]
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    metadata = dict(metadata, contentHash=row["content_hash"])
    return Evidence(context_id=row["document_id"], car_id=row["car_id"], section=row["section"],
                    content=row["content"], score=float(row["score"]), metadata=metadata,
                    source_ids=metadata.get("sourceIds", []))
