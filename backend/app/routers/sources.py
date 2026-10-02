import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import get_db_connection
from app.models.schemas import SourceDetailResponse, SourceListResponse
from app.repositories.source_repository import SourceRepository

router = APIRouter(prefix="/sources", tags=["Sources"])


@router.get("", response_model=SourceListResponse)
async def list_sources(
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    sources = await SourceRepository.list_all(conn=conn)
    return SourceListResponse(count=len(sources), items=sources)


@router.get("/{source_id}", response_model=SourceDetailResponse)
async def get_source(
    source_id: str,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    source = await SourceRepository.get_by_id(conn=conn, source_id=source_id)
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source with ID '{source_id}' was not found.",
        )
    references = await SourceRepository.get_references(conn, source_id)
    return SourceDetailResponse(**source.model_dump(), references=references)
