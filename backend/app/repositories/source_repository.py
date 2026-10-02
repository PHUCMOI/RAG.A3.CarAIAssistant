from typing import Any, Optional
import asyncpg
from app.models.schemas import SourceDto


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
