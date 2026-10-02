from typing import Any, Optional
import asyncpg
from app.models.schemas import SourceDto, SourceReferences, SourceReference


def map_source_row(row: Any) -> SourceDto:
    checked_at = row["checked_at"]
    checked_at_str = checked_at.isoformat() if checked_at is not None else ""

    return SourceDto(
        sourceId=row["source_id"],
        title=row["title"],
        url=row["url"],
        sourceType=row["source_type"],
        supports=row["supports"],
        checkedAt=checked_at_str,
    )


class SourceRepository:
    @staticmethod
    async def get_references(conn: asyncpg.Connection, source_id: str) -> SourceReferences:
        rows = await conn.fetch("""
            SELECT 'cars' AS category, car_id AS record_id, display_name AS label, car_id
            FROM cars WHERE presence_source_id = $1
            UNION ALL
            SELECT 'prices', car_id, display_name, car_id
            FROM cars WHERE price_source_id = $1
            UNION ALL
            SELECT 'warranties', w.warranty_id::text,
                   COALESCE(c.display_name, w.brand_name, 'Warranty'), w.car_id
            FROM warranties w LEFT JOIN cars c ON c.car_id = w.car_id
            WHERE w.source_id = $1
            UNION ALL
            SELECT 'dealers', dealer_id::text, name, NULL::text
            FROM dealers WHERE source_id = $1
            UNION ALL
            SELECT 'documents', d.document_id, COALESCE(c.display_name || ' — ', '') || d.section, d.car_id
            FROM documents d LEFT JOIN cars c ON c.car_id = d.car_id
            WHERE d.source_id = $1
            ORDER BY category, label, record_id;
        """, source_id)
        references = SourceReferences()
        for row in rows:
            getattr(references, row["category"]).append(SourceReference(
                recordId=row["record_id"], label=row["label"], carId=row["car_id"],
            ))
        return references

    @staticmethod
    async def get_by_id(
        conn: asyncpg.Connection,
        source_id: str,
    ) -> Optional[SourceDto]:
        sql = """
            SELECT source_id, title, url, source_type, supports, checked_at
            FROM sources
            WHERE source_id = $1;
        """
        row = await conn.fetchrow(sql, source_id)
        return map_source_row(row) if row else None

    @staticmethod
    async def list_all(conn: asyncpg.Connection) -> list[SourceDto]:
        sql = """
            SELECT source_id, title, url, source_type, supports, checked_at
            FROM sources
            ORDER BY source_id;
        """
        rows = await conn.fetch(sql)
        return [map_source_row(r) for r in rows]
