from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.core.database import check_db_health
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def get_health():
    is_ready = await check_db_health()
    if is_ready:
        return HealthResponse(status="ok", database="ready")

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "type": "https://tools.ietf.org/html/rfc7231#section-6.6.4",
            "title": "Service Unavailable",
            "status": 503,
            "detail": "PostgreSQL is not ready",
        },
    )
