from functools import lru_cache
from fastapi import Depends
from app.core.config import get_settings
from app.core.database import get_db_connection
from app.repositories.rag_repository import RagRepository
from app.application.rag.text_retriever import TextRetriever
from app.application.rag.rag import RagService
from app.infrastructure.ai.embedding import E5EmbeddingProvider
from app.infrastructure.ai.ollama import OllamaProvider
from app.infrastructure.ai.bedrock import BedrockProvider


@lru_cache
def providers():
    settings = get_settings()
    if not settings.rag_enabled:
        return None, None
    if settings.llm_provider == "bedrock":
        generator = BedrockProvider(settings.aws_region, settings.bedrock_model_id, settings.bedrock_timeout,
                                    aws_access_key_id=settings.aws_access_key_id,
                                    aws_secret_access_key=settings.aws_secret_access_key,
                                    aws_session_token=settings.aws_session_token,
                                    aws_profile=settings.aws_profile)
    else:
        generator = OllamaProvider(settings.ollama_url, settings.ollama_model, settings.ollama_timeout)
    return (E5EmbeddingProvider(settings.embedding_model, settings.embedding_revision, settings.embedding_cache_dir), generator)


def get_rag_service(conn=Depends(get_db_connection)):
    embedding, generator = providers()
    repository = RagRepository(conn)
    return RagService(repository, TextRetriever(repository, embedding), generator, get_settings().generation_timeout)
