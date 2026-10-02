import logging
from typing import AsyncGenerator, Optional
import asyncpg
from app.core.config import get_settings

logger = logging.getLogger("autowise.database")

_pool: Optional[asyncpg.Pool] = None


async def init_db_pool() -> Optional[asyncpg.Pool]:
    """Initialize asyncpg connection pool."""
    global _pool
    settings = get_settings()
    dsn = settings.get_postgres_dsn()

    try:
        _pool = await asyncpg.create_pool(
            dsn=dsn,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
            timeout=5.0,
            command_timeout=30.0,
        )
        logger.info("Connected to PostgreSQL database pool successfully.")
        return _pool
    except Exception as e:
        logger.warning("Could not initialize database pool on startup: %s", e)
        _pool = None
        return None


async def close_db_pool() -> None:
    """Close asyncpg connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed.")


async def get_db_pool() -> asyncpg.Pool:
    """Get active database pool, attempting reconnect if not yet initialized."""
    global _pool
    if _pool is None:
        pool = await init_db_pool()
        if pool is None:
            raise RuntimeError("Database pool is not available. Please verify PostgreSQL connection.")
        return pool
    return _pool


async def check_db_health() -> bool:
    """Verify that PostgreSQL is reachable and answering queries."""
    global _pool
    settings = get_settings()
    dsn = settings.get_postgres_dsn()

    # Try existing pool first
    if _pool is not None:
        try:
            async with _pool.acquire() as conn:
                val = await conn.fetchval("SELECT 1")
                return val == 1
        except Exception:
            pass

    # If pool is None or failed, try direct connection attempt
    try:
        conn = await asyncpg.connect(dsn=dsn, timeout=3.0)
        try:
            val = await conn.fetchval("SELECT 1")
            return val == 1
        finally:
            await conn.close()
    except Exception:
        return False


async def get_db_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency yielding an acquired database connection from the pool."""
    pool = await get_db_pool()
    async with pool.acquire() as connection:
        yield connection
