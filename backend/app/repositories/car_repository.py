import json
from typing import Any, Optional
import asyncpg
from app.models.schemas import CarDto


def parse_json_list(val: Any) -> list[str]:
    """Parse JSON array field into a list of strings."""
    if val is None:
        return []
    if isinstance(val, (list, tuple)):
        return [str(x) for x in val]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(x) for x in parsed]
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def map_car_row(row: Any) -> CarDto:
    """Map database row to CarDto."""
    price_as_of = row["price_as_of"]
    price_as_of_str = price_as_of.isoformat() if price_as_of is not None else None

    return CarDto(
        carId=row["car_id"],
        genmodelId=row["genmodel_id"],
        brand=row["brand_name"],
        displayName=row["display_name"],
        description=row["description"],
        aliases=parse_json_list(row["aliases"]),
        marketStatusVn=row["market_status_vn"],
        bodyType=row["body_type"],
        fuelType=row["fuel_type"],
        transmission=row["transmission"],
        seats=row["seats"],
        engine=row["engine"],
        enginePowerHp=row.get("engine_power_hp"),
        lengthMm=row.get("length_mm"),
        widthMm=row.get("width_mm"),
        heightMm=row.get("height_mm"),
        wheelbaseMm=row.get("wheelbase_mm"),
        priceVndFrom=row["price_vnd_from"],
        priceAsOf=price_as_of_str,
        priceSourceId=row["price_source_id"],
        warrantyMonths=row["warranty_months"],
        warrantyDistanceKm=row["warranty_distance_km"],
        presenceSourceId=row["presence_source_id"],
        missingFields=parse_json_list(row["missing_fields"]),
        imageCount=row["image_count"],
    )


class CarRepository:
    @staticmethod
    async def search(
        conn: asyncpg.Connection,
        query: Optional[str] = None,
        brand: Optional[str] = None,
        body_type: Optional[str] = None,
        seats: Optional[int] = None,
        max_price: Optional[int] = None,
        limit: int = 20,
    ) -> list[CarDto]:
        limit = max(1, min(limit, 100))
        conditions = []
        params = []

        clean_query = query.strip() if query and query.strip() else None
        if clean_query:
            params.append(f"%{clean_query}%")
            idx = len(params)
            conditions.append(
                f"(display_name ILIKE ${idx} OR source_model_name ILIKE ${idx} OR aliases::text ILIKE ${idx})"
            )

        clean_brand = brand.strip() if brand and brand.strip() else None
        if clean_brand:
            params.append(clean_brand)
            conditions.append(f"brand_name ILIKE ${len(params)}")

        clean_body_type = body_type.strip() if body_type and body_type.strip() else None
        if clean_body_type:
            params.append(clean_body_type)
            conditions.append(f"body_type ILIKE ${len(params)}")

        if seats is not None:
            params.append(seats)
            conditions.append(f"seats = ${len(params)}")

        if max_price is not None:
            params.append(max_price)
            conditions.append(f"price_vnd_from <= ${len(params)}")

        params.append(limit)
        limit_idx = len(params)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sql = f"""
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   engine_power_hp, length_mm, width_mm, height_mm, wheelbase_mm,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars
            {where_clause}
            ORDER BY price_vnd_from NULLS LAST, display_name
            LIMIT ${limit_idx};
        """
        rows = await conn.fetch(sql, *params)
        return [map_car_row(r) for r in rows]

    @staticmethod
    async def find_mentioned(
        conn: asyncpg.Connection,
        question: str,
        limit: int = 5,
    ) -> list[CarDto]:
        limit = max(1, min(limit, 20))
        clean_question = question.strip()
        sql = """
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   engine_power_hp, length_mm, width_mm, height_mm, wheelbase_mm,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars
            WHERE lower($1) LIKE '%' || lower(display_name) || '%'
               OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(aliases) AS alias(value)
                    WHERE length(alias.value) >= 3
                      AND lower($1) LIKE '%' || lower(alias.value) || '%'
               )
            ORDER BY length(display_name) DESC, display_name
            LIMIT $2;
        """
        rows = await conn.fetch(sql, clean_question, limit)
        return [map_car_row(r) for r in rows]

    @staticmethod
    async def get_by_id(
        conn: asyncpg.Connection,
        car_id: str,
    ) -> Optional[CarDto]:
        sql = """
            SELECT car_id, genmodel_id, brand_name, display_name, description, aliases::text,
                   market_status_vn, body_type, fuel_type, transmission, seats, engine,
                   engine_power_hp, length_mm, width_mm, height_mm, wheelbase_mm,
                   price_vnd_from, price_as_of, price_source_id, warranty_months, warranty_distance_km,
                   presence_source_id, missing_fields::text, image_count
            FROM cars
            WHERE car_id = $1;
        """
        row = await conn.fetchrow(sql, car_id)
        return map_car_row(row) if row else None
