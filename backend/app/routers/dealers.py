from typing import Optional
import asyncpg
from fastapi import APIRouter, Depends
from app.core.database import get_db_connection
from app.models.schemas import DealerListResponse
from app.repositories.dealer_repository import DealerRepository

router = APIRouter(prefix="/dealers", tags=["Dealers"])


@router.get("", response_model=DealerListResponse)
async def list_dealers(
    brand: Optional[str] = None,
    city: Optional[str] = None,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    dealers = await DealerRepository.search(conn=conn, brand=brand, city=city)
    return DealerListResponse(count=len(dealers), items=dealers)
