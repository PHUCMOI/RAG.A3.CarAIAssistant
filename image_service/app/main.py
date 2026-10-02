"""AutoWise Image Retrieval & Assistant Microservice (Member 3)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from image_service.app.config import get_settings
from image_service.app.core.vector_index import get_vector_index
from image_service.app.routers import cars, chat, health, image_search, text_search

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("image_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Khởi động %s (v%s)...", settings.service_name, settings.version)
    idx = get_vector_index()
    logger.info("Chỉ mục FAISS sẵn sàng với %d vector (dim=%d).", idx.size(), idx.dimension)
    yield
    logger.info("Tắt dịch vụ %s.", settings.service_name)


settings = get_settings()

app = FastAPI(
    title=settings.service_name,
    description="Dịch vụ microservice độc lập cho Image Retrieval, FAISS Vector Search và Multimodal Car Assistant.",
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/swagger", include_in_schema=False)
async def swagger_redirect():
    return RedirectResponse(url="/docs")


@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "search_image": "POST /search/image",
            "search_text": "POST /search/text",
            "chat": "POST /chat",
            "get_car": "GET /cars/{car_id}",
        },
    }


# Include Routers
app.include_router(health.router)
app.include_router(image_search.router)
app.include_router(text_search.router)
app.include_router(chat.router)
app.include_router(cars.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("image_service.app.main:app", host=settings.host, port=settings.port, reload=True)
