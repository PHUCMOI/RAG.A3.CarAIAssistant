from app.core.config import get_settings
from app.infrastructure.ai.bedrock import BedrockProvider


def title_provider():
    """Conversation naming always uses Bedrock, independently of RAG configuration."""
    settings = get_settings()
    return BedrockProvider(
        settings.aws_region, settings.bedrock_model_id, 8,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_session_token=settings.aws_session_token,
        aws_profile=settings.aws_profile,
    )
