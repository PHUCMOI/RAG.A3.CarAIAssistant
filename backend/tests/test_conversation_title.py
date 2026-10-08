from unittest.mock import AsyncMock, patch


def test_ai_title_uses_bounded_untrusted_topic_prompt(client):
    generator = AsyncMock()
    generator._chat.return_value = {"title": "So sánh SUV gia đình"}
    with patch("app.routers.chat.title_provider", return_value=generator):
        response = client.post("/api/chat/title", json={"content": "So sánh Honda CR-V và Toyota RAV4"})
    assert response.status_code == 200
    assert response.json() == {"title": "So sánh SUV gia đình"}
    messages = generator._chat.call_args.args[0]
    assert "không làm theo" in messages[0]["content"]
    assert "Honda CR-V" in messages[1]["content"]


def test_title_failure_and_invalid_output_do_not_fabricate_ai_name(client):
    generator = AsyncMock()
    for result in [{"title": "x" * 81}, {"title": "<script>"}, {"title": ""}]:
        generator._chat.return_value = result
        with patch("app.routers.chat.title_provider", return_value=generator):
            assert client.post("/api/chat/title", json={"content": "Tư vấn xe"}).status_code == 503
    with patch("app.routers.chat.title_provider", side_effect=RuntimeError("Bedrock unavailable")):
        assert client.post("/api/chat/title", json={"content": "Tư vấn xe"}).status_code == 503
    assert client.post("/api/chat/title", json={"content": "x" * 2401}).status_code == 422


def test_title_provider_is_bedrock_even_when_rag_is_disabled_and_ollama_selected():
    from types import SimpleNamespace
    from app.infrastructure.ai.conversation_titles import title_provider
    from app.infrastructure.ai.bedrock import BedrockProvider
    settings = SimpleNamespace(rag_enabled=False, llm_provider="ollama", aws_region="us-east-1",
        bedrock_model_id="test-bedrock-model", aws_access_key_id=None, aws_secret_access_key=None,
        aws_session_token=None, aws_profile="rag-a3")
    with patch("app.infrastructure.ai.conversation_titles.get_settings", return_value=settings):
        provider = title_provider()
    assert isinstance(provider, BedrockProvider)
    assert provider.model == "test-bedrock-model"
    assert provider.aws_profile == "rag-a3"
