from typing import Any, Optional
import asyncpg
from app.models.schemas import DealerDto
from app.repositories.car_repository import parse_json_list


def map_dealer_row(row: Any) -> DealerDto:
    checked_at = row["checked_at"]
    checked_at_str = checked_at.isoformat() if checked_at is not None else ""

    return DealerDto(
        dealerId=row["dealer_id"],
        name=row["name"],
        address=row["address"],
        city=row["city"],
        phone=row["phone"],
        website=row["website"],
        supportedBrands=parse_json_list(row["supported_brands"]),
        sourceId=row["source_id"],
        checkedAt=checked_at_str,
    )


class DealerRepository:
    @staticmethod
    async def search(
        conn: asyncpg.Connection,
        brand: Optional[str] = None,
        city: Optional[str] = None,
    ) -> list[DealerDto]:
        conditions = []
        params = []

        clean_brand = brand.strip() if brand and brand.strip() else None
        if clean_brand:
            params.append(clean_brand)
            idx = len(params)
            conditions.append(f"supported_brands @> jsonb_build_array(${idx}::text)")

        clean_city = city.strip() if city and city.strip() else None
        if clean_city:
            params.append(clean_city)
            idx = len(params)
            conditions.append(f"city ILIKE ${idx}")

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sql = f"""
            SELECT dealer_id, name, address, city, phone, website,
                   supported_brands::text, source_id, checked_at
            FROM dealers
            {where_clause}
            ORDER BY city, name;
        """
        rows = await conn.fetch(sql, *params)
        return [map_dealer_row(r) for r in rows]
