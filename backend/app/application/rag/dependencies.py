from functools import lru_cache
from fastapi import Depends, Request
from app.core.config import get_settings
from app.core.database import get_db_connection
from app.repositories.rag_repository import RagRepository
from app.application.rag.text_retriever import TextRetriever
from app.application.rag.rag import RagService
from app.infrastructure.ai.embedding import E5EmbeddingProvider
from app.infrastructure.ai.bedrock import BedrockProvider


@lru_cache
def providers():
    settings = get_settings()
    if not settings.rag_enabled:
        return None, None
    generator = BedrockProvider(settings.aws_region, settings.bedrock_model_id, settings.bedrock_timeout,
                                aws_access_key_id=settings.aws_access_key_id,
                                aws_secret_access_key=settings.aws_secret_access_key,
                                aws_session_token=settings.aws_session_token,
                                aws_profile=settings.aws_profile)
    return (E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir), generator)


def get_rag_service(conn=Depends(get_db_connection)):
    embedding, generator = providers()
    repository = RagRepository(conn)
    return RagService(repository, TextRetriever(repository, embedding), generator, get_settings().generation_timeout)


class LazyRagService:
    """Acquire only during retrieval; image orchestration never holds a DB slot."""
    def __init__(self, request):
        self.request = request

    async def catalogue_context(self, car_ids):
        """Guest history supplies hints; canonical names come from catalogue rows."""
        connection_provider = self.request.app.dependency_overrides.get(get_db_connection, get_db_connection)
        from contextlib import asynccontextmanager
        async with asynccontextmanager(connection_provider)() as connection:
            cars = await RagRepository(connection).catalogue()
        known = {c.car_id: c.display_name for c in cars}
        return [{'carId': cid, 'displayName': known[cid]} for cid in dict.fromkeys(car_ids) if cid in known]

    async def answer(self, *args, **kwargs):
        connection_provider = self.request.app.dependency_overrides.get(get_db_connection, get_db_connection)
        from contextlib import asynccontextmanager
        async with asynccontextmanager(connection_provider)() as connection:
            service = get_rag_service(connection)
            return await service.answer(*args, **kwargs)


def get_lazy_rag_service(request: Request):
    return LazyRagService(request)
