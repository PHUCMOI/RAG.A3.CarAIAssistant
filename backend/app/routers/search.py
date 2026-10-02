import asyncpg
from fastapi import APIRouter, Depends
from app.core.database import get_db_connection
from app.models.schemas import TextSearchRequest, TextSearchResponse
from app.repositories.car_repository import CarRepository

router = APIRouter(prefix="/search", tags=["Search"])


@router.post("/text", response_model=TextSearchResponse)
async def text_search(
    request: TextSearchRequest,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    top_k = max(1, min(request.top_k or 5, 20))
    cars = await CarRepository.search(
        conn=conn,
        query=request.query,
        brand=request.brand,
        body_type=request.body_type,
        seats=request.seats,
        max_price=request.max_price,
        limit=top_k,
    )
    return TextSearchResponse(
        query=request.query,
        results=cars,
        retrieval="postgresql-structured-search",
    )
