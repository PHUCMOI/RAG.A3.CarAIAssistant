import asyncio
import json
import threading
from unittest.mock import Mock, patch

import pytest

from app.application.rag.contracts import ContextPackage, QueryAnalysis, RagFilters, RetrievalResult
from app.core.config import Settings


MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def package():
    return ContextPackage(
        RetrievalResult(QueryAnalysis(question="Giá xe A", intent="ask_price"), RagFilters()),
        {"a:price": {"contextId": "a"}}, [], "{}", {"Xe A: 100 VND.": ["a:price"]},
    )


def response(content='{"statementIds":[0]}', stop="end_turn"):
    return {"output": {"message": {"content": [{"text": content}]}}, "stopReason": stop,
            "usage": {"inputTokens": 10, "outputTokens": 5},
            "ResponseMetadata": {"RequestId": "test-request"}}


def test_bedrock_converse_preserves_verified_facts_and_runs_off_event_loop():
    from app.infrastructure.ai.bedrock import BedrockProvider
    caller_thread = threading.get_ident()
    seen_threads = []
    client = Mock()
    def converse(**kwargs):
        seen_threads.append(threading.get_ident())
        return response()
    client.converse.side_effect = converse
    provider = BedrockProvider("us-east-1", MODEL, client=client)
    draft = asyncio.run(provider.generate(package()))
    assert draft.answer == "Xe A: 100 VND."
    assert draft.fact_ids == ["a:price"] and draft.context_ids == ["a"]
    request = client.converse.call_args.kwargs
    assert request["modelId"] == MODEL
    assert request["inferenceConfig"] == {"temperature": 0, "maxTokens": 256}
    assert "statementIds" in request["system"][-1]["text"]
    assert request["messages"][0]["role"] == "user"
    prompt = json.loads(request["messages"][0]["content"][0]["text"])
    assert prompt["allowedStatements"] == [{"id": 0, "text": "Xe A: 100 VND."}]
    assert seen_threads and seen_threads[0] != caller_thread


@pytest.mark.parametrize("text,stop", [
    ('{"statementIds":[999]}', "end_turn"), ('{"statementIds":[0,0]}', "end_turn"),
    ('{"statementIds":[true]}', "end_turn"), ('{"statementIds":[]}', "end_turn"),
    ("not json", "end_turn"), ('{"statementIds":[0]}', "max_tokens"),
    ('{"statementIds":[0]}', "guardrail_intervened"),
])
def test_bedrock_rejects_invalid_or_incomplete_output(text, stop):
    from app.infrastructure.ai.bedrock import BedrockProvider
    client = Mock()
    client.converse.return_value = response(text, stop)
    with pytest.raises(ValueError):
        asyncio.run(BedrockProvider("us-east-1", MODEL, client=client).generate(package()))


def test_bedrock_classification_and_repair():
    from app.infrastructure.ai.bedrock import BedrockProvider
    client = Mock()
    client.converse.return_value = response('{"intent":"ask_price"}')
    provider = BedrockProvider("us-east-1", MODEL, client=client)
    assert asyncio.run(provider.classify("Giá xe A")) == "ask_price"
    assert client.converse.call_args.kwargs["inferenceConfig"]["maxTokens"] == 32
    client.converse.return_value = response()
    asyncio.run(provider.generate(package(), repair="Unknown statement ID"))
    # Converse requires alternating roles; repair becomes part of the user turn.
    messages = client.converse.call_args.kwargs["messages"]
    assert len(messages) == 1 and "Unknown statement ID" in messages[0]["content"][-1]["text"]


def test_bedrock_accepts_claude_json_fences_but_rejects_extra_prose():
    from app.infrastructure.ai.bedrock import BedrockProvider
    client = Mock()
    provider = BedrockProvider("us-east-1", MODEL, client=client)
    client.converse.return_value = response('```json\n{"statementIds":[0]}\n```')
    assert asyncio.run(provider.generate(package())).fact_ids == ["a:price"]
    client.converse.return_value = response('Here is the result: ```json\n{"statementIds":[0]}\n```')
    with pytest.raises(ValueError):
        asyncio.run(provider.generate(package()))


def test_bedrock_sdk_errors_are_sanitized_and_classification_can_fall_back():
    from app.infrastructure.ai.bedrock import BedrockProvider
    client = Mock()
    client.converse.side_effect = RuntimeError("sensitive upstream details")
    provider = BedrockProvider("us-east-1", MODEL, client=client)
    with pytest.raises(ValueError, match="Classification unavailable"):
        asyncio.run(provider.classify("Giá xe A"))
    with pytest.raises(RuntimeError, match="Bedrock request unavailable") as exc:
        asyncio.run(provider.generate(package()))
    assert "sensitive upstream details" not in str(exc.value)


def test_bedrock_reads_dotenv_credentials_without_exposing_them(tmp_path):
    from app.infrastructure.ai.bedrock import BedrockProvider
    env = tmp_path / ".env"
    env.write_text("LLM_PROVIDER=bedrock\nAWS_ACCESS_KEY_ID=test-id\nAWS_SECRET_ACCESS_KEY=test-secret\n"
                   "AWS_SESSION_TOKEN=test-token\n", encoding="utf-8")
    settings = Settings(_env_file=env)
    assert settings.llm_provider == "bedrock" and settings.bedrock_model_id == MODEL
    assert "test-secret" not in repr(settings) and "test-token" not in repr(settings)
    with patch("boto3.Session") as session:
        session.return_value.client.return_value = Mock(spec=["converse", "close"])
        session.return_value.client.return_value.converse.return_value = response()
        provider = BedrockProvider(settings.aws_region, settings.bedrock_model_id,
                                   aws_access_key_id=settings.aws_access_key_id,
                                   aws_secret_access_key=settings.aws_secret_access_key,
                                   aws_session_token=settings.aws_session_token)
        asyncio.run(provider.generate(package()))
        kwargs = session.return_value.client.call_args.kwargs
        assert kwargs["region_name"] == "us-east-1"
        assert kwargs["aws_secret_access_key"] == "test-secret"
        assert kwargs["aws_session_token"] == "test-token"
        assert kwargs["config"].retries["total_max_attempts"] == 1
        session.return_value.client.return_value.close.assert_called_once()


@pytest.mark.parametrize("name", ["ollama", "bedrock"])
def test_provider_selection_keeps_embeddings_and_uses_provider_timeout(name):
    from app.application.rag import dependencies
    from app.infrastructure.ai.bedrock import BedrockProvider
    from app.infrastructure.ai.ollama import OllamaProvider
    settings = Settings(_env_file=None, llm_provider=name, bedrock_timeout=25, ollama_timeout=75)
    dependencies.providers.cache_clear()
    try:
        with patch.object(dependencies, "get_settings", return_value=settings), \
             patch.object(dependencies, "E5EmbeddingProvider") as embedding:
            _, generator = dependencies.providers()
            assert isinstance(generator, BedrockProvider if name == "bedrock" else OllamaProvider)
            embedding.assert_called_once()
            assert dependencies.get_rag_service(Mock()).timeout == (25 if name == "bedrock" else 75)
    finally:
        dependencies.providers.cache_clear()


def test_disabling_rag_does_not_initialize_aws_or_embeddings():
    from app.application.rag import dependencies
    dependencies.providers.cache_clear()
    try:
        with patch.object(dependencies, "get_settings", return_value=Settings(_env_file=None, rag_enabled=False)), \
             patch.object(dependencies, "E5EmbeddingProvider") as embedding:
            assert dependencies.providers() == (None, None)
            embedding.assert_not_called()
    finally:
        dependencies.providers.cache_clear()
