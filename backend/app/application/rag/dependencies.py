from functools import lru_cache
from fastapi import Depends
from app.core.config import get_settings
from app.core.database import get_db_connection
from app.repositories.rag_repository import RagRepository
from app.application.rag.text_retriever import TextRetriever
from app.application.rag.rag import RagService
from app.infrastructure.ai.embedding import E5EmbeddingProvider
from app.infrastructure.ai.ollama import OllamaProvider


@lru_cache
def providers():
    settings = get_settings()
    if not settings.rag_enabled:
        return None, None
    return (E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir),
            OllamaProvider(settings.ollama_url, settings.ollama_model, settings.ollama_timeout))


def get_rag_service(conn=Depends(get_db_connection)):
    embedding, generator = providers()
    repository = RagRepository(conn)
    return RagService(repository, TextRetriever(repository, embedding), generator, get_settings().ollama_timeout)
