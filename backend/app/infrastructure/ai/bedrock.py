import asyncio
import json
import logging
import re
import time
from contextlib import closing

from app.infrastructure.ai.structured import StructuredProvider

logger = logging.getLogger(__name__)


class BedrockProvider(StructuredProvider):
    def __init__(self, region, model, timeout=30.0, *, client=None,
                 aws_access_key_id=None, aws_secret_access_key=None,
                 aws_session_token=None, aws_profile=None):
        self.region, self.model, self.timeout = region, model, timeout
        self.client, self.aws_profile = client, aws_profile
        # Settings can contain SecretStr values from the ignored .env file.
        def unwrap(value):
            return value.get_secret_value() if hasattr(value, "get_secret_value") else value
        self.credentials = {key: unwrap(value) for key, value in {
            "aws_access_key_id": aws_access_key_id,
            "aws_secret_access_key": aws_secret_access_key,
            "aws_session_token": aws_session_token,
        }.items() if value}

    def _converse(self, request, timeout):
        # Resolve credentials and perform blocking SDK work outside the event loop.
        # Delay client creation so missing AWS credentials still allow RAG fallback.
        if self.client is not None:
            return self.client.converse(**request)
        import boto3
        from botocore.config import Config
        session = boto3.Session(profile_name=self.aws_profile or None)
        with closing(session.client("bedrock-runtime", region_name=self.region, **self.credentials,
                            config=Config(connect_timeout=min(5.0, timeout), read_timeout=timeout,
                                          retries={"total_max_attempts": 1}))) as client:
            return client.converse(**request)

    async def _chat(self, messages, schema, timeout=None, *, num_predict=256):
        system = [{"text": message["content"]} for message in messages if message["role"] == "system"]
        system.append({"text": "Return only a JSON object matching this schema, without markdown: "
                      + json.dumps(schema, ensure_ascii=False, separators=(",", ":"))})
        turns = []
        for message in messages:
            if message["role"] == "system":
                continue
            block = {"text": message["content"]}
            if turns and turns[-1]["role"] == message["role"]:
                turns[-1]["content"].append(block)
            else:
                turns.append({"role": message["role"], "content": [block]})
        request = {"modelId": self.model, "system": system, "messages": turns,
                   "inferenceConfig": {"temperature": 0, "maxTokens": num_predict}}
        started = time.perf_counter()
        deadline = timeout or self.timeout
        try:
            result = await asyncio.wait_for(asyncio.to_thread(self._converse, request, deadline), deadline)
        except Exception as exc:
            logger.warning("Bedrock request unavailable (%s)", type(exc).__name__)
            raise RuntimeError("Bedrock request unavailable") from exc
        if result.get("stopReason") != "end_turn":
            raise ValueError("Bedrock response did not complete")
        try:
            content = result["output"]["message"]["content"]
            text = "".join(block["text"] for block in content if "text" in block)
            # Claude can wrap JSON in a markdown fence even when instructed not to.
            # Accept only an entire fenced response; do not extract JSON from prose.
            fenced = re.fullmatch(r"\s*```(?:json)?\s*\n(.*?)\n```\s*", text, flags=re.DOTALL)
            if fenced:
                text = fenced.group(1)
            parsed = json.loads(text)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Invalid Bedrock JSON response") from exc
        usage = result.get("usage", {})
        logger.info("Bedrock model=%s request_id=%s elapsed=%.2fs input_tokens=%s output_tokens=%s",
                    self.model, result.get("ResponseMetadata", {}).get("RequestId"),
                    time.perf_counter() - started, usage.get("inputTokens"), usage.get("outputTokens"))
        return parsed
