"""Health check endpoint."""

import time
from fastapi import APIRouter
from image_service.app.config import get_settings
from image_service.app.core.vector_index import get_vector_index
from image_service.app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def get_health():
    settings = get_settings()
    index = get_vector_index()
    return HealthResponse(
        status="healthy",
        service=settings.service_name,
        version=settings.version,
        index_loaded=index.size() > 0,
        total_indexed_images=index.size(),
        dimension=index.dimension,
        timestamp=time.time(),
    )
