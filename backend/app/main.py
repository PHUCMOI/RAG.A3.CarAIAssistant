from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from app.core.config import get_settings
from app.core.database import close_db_pool, init_db_pool
from app.routers import cars, chat, dealers, health, search, sources, warranties

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("autowise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("AutoWise API starting up...")
    await init_db_pool()
    try:
        yield
    finally:
        logger.info("AutoWise API shutting down...")
        await close_db_pool()


app = FastAPI(
    title="AutoWise Car RAG API",
    description="Backend API for AutoWise Vietnam Car Discovery & RAG Assistant",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

settings = get_settings()

# Setup CORS
origins = [
    settings.frontend_origin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/swagger", include_in_schema=False)
async def swagger_redirect():
    """Redirect /swagger to /docs for ASP.NET / C# Swagger parity."""
    return RedirectResponse(url="/docs")


@app.get("/", include_in_schema=False)
async def root():
    return {
        "message": "AutoWise Car RAG API is running",
        "docs": "/docs",
        "swagger": "/swagger",
        "health": "/api/health",
    }


# Include all API routers under /api
app.include_router(health.router, prefix="/api")
app.include_router(cars.router, prefix="/api")
app.include_router(dealers.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(warranties.router, prefix="/api")
