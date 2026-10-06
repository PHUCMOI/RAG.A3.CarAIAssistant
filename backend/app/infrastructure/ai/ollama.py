import json
import logging
import time
import httpx
from app.infrastructure.ai.structured import StructuredProvider

logger = logging.getLogger(__name__)


class OllamaProvider(StructuredProvider):
    def __init__(self, url, model, timeout=90.0, transport=None):
        self.url, self.model, self.timeout, self.transport = url.rstrip("/"), model, timeout, transport

    async def _chat(self, messages, schema, timeout=None, *, num_predict=256):
        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=timeout or self.timeout, transport=self.transport) as client:
            response = await client.post(self.url + "/api/chat", json={"model": self.model, "messages": messages,
                "stream": False, "format": schema, "keep_alive": "15m",
                "options": {"temperature": 0, "num_ctx": 8192, "num_predict": num_predict}})
            response.raise_for_status()
            result = response.json()
            logger.info("Ollama model=%s elapsed=%.2fs prompt_tokens=%s output_tokens=%s",
                        self.model, time.perf_counter() - started,
                        result.get("prompt_eval_count"), result.get("eval_count"))
            return json.loads(result["message"]["content"])
