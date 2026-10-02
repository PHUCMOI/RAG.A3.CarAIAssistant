from typing import Optional
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import get_db_connection
from app.models.schemas import WarrantyDto, WarrantyListResponse
from app.repositories.warranty_repository import WarrantyRepository

router = APIRouter(prefix="/warranties", tags=["Warranties"])


@router.get("", response_model=WarrantyListResponse)
async def list_warranties(
    brand: Optional[str] = None,
    car_id: Optional[str] = None,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    if car_id:
        policy = await WarrantyRepository.get_by_car_id(conn=conn, car_id=car_id)
        if policy:
            return WarrantyListResponse(count=1, items=[policy])
        if brand:
            brand_policy = await WarrantyRepository.get_by_brand(conn=conn, brand_name=brand)
            return WarrantyListResponse(count=1 if brand_policy else 0, items=[brand_policy] if brand_policy else [])
        return WarrantyListResponse(count=0, items=[])

    if brand:
        brand_policy = await WarrantyRepository.get_by_brand(conn=conn, brand_name=brand)
        return WarrantyListResponse(count=1 if brand_policy else 0, items=[brand_policy] if brand_policy else [])

    warranties = await WarrantyRepository.list_all(conn=conn)
    return WarrantyListResponse(count=len(warranties), items=warranties)
