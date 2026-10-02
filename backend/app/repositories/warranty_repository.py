from typing import Any, Optional
import asyncpg
from app.models.schemas import WarrantyDto


def map_warranty_row(row: Any) -> WarrantyDto:
    return WarrantyDto(
        warrantyId=row["warranty_id"],
        carId=row["car_id"],
        brandName=row["brand_name"],
        durationMonths=row["duration_months"],
        distanceLimitKm=row["distance_limit_km"],
        conditions=row["conditions"],
        sourceId=row["source_id"],
    )


class WarrantyRepository:
    @staticmethod
    async def get_by_car_id(
        conn: asyncpg.Connection,
        car_id: str,
    ) -> Optional[WarrantyDto]:
        sql = """
            SELECT warranty_id, car_id, brand_name, duration_months, distance_limit_km, conditions, source_id
            FROM warranties
            WHERE car_id = $1;
        """
        row = await conn.fetchrow(sql, car_id)
        return map_warranty_row(row) if row else None

    @staticmethod
    async def get_by_brand(
        conn: asyncpg.Connection,
        brand_name: str,
    ) -> Optional[WarrantyDto]:
        sql = """
            SELECT warranty_id, car_id, brand_name, duration_months, distance_limit_km, conditions, source_id
            FROM warranties
            WHERE brand_name ILIKE $1 AND car_id IS NULL;
        """
        row = await conn.fetchrow(sql, brand_name)
        return map_warranty_row(row) if row else None

    @staticmethod
    async def list_all(conn: asyncpg.Connection) -> list[WarrantyDto]:
        sql = """
            SELECT warranty_id, car_id, brand_name, duration_months, distance_limit_km, conditions, source_id
            FROM warranties
            ORDER BY brand_name NULLS LAST, car_id NULLS LAST;
        """
        rows = await conn.fetch(sql)
        return [map_warranty_row(r) for r in rows]
