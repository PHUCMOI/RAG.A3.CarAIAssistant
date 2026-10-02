from typing import Optional
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.database import get_db_connection
from app.models.schemas import CarDto, CarListResponse
from app.repositories.car_repository import CarRepository

router = APIRouter(prefix="/cars", tags=["Cars"])


@router.get("", response_model=CarListResponse)
async def list_cars(
    query: Optional[str] = None,
    brand: Optional[str] = None,
    body_type: Optional[str] = Query(None, alias="bodyType"),
    seats: Optional[int] = None,
    max_price: Optional[int] = Query(None, alias="maxPrice"),
    limit: Optional[int] = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    clamped_limit = max(1, min(limit or 20, 100))
    cars = await CarRepository.search(
        conn=conn,
        query=query,
        brand=brand,
        body_type=body_type,
        seats=seats,
        max_price=max_price,
        limit=clamped_limit,
    )
    return CarListResponse(count=len(cars), items=cars)


@router.get("/{car_id}", response_model=CarDto)
async def get_car_by_id(
    car_id: str,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    car = await CarRepository.get_by_id(conn=conn, car_id=car_id)
    if not car:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Car with ID '{car_id}' was not found.",
        )
    return car
