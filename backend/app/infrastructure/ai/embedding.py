import asyncio
import math
import threading


def validate_vector(vector):
    if len(vector) != 768 or any(not math.isfinite(float(v)) for v in vector):
        raise ValueError("Text embedding must have 768 finite dimensions")
    norm = math.hypot(*(float(v) for v in vector))
    if norm == 0 or not math.isfinite(norm):
        raise ValueError("Text embedding must have a finite nonzero norm")
    return [float(v) / norm for v in vector]


class E5EmbeddingProvider:
    def __init__(self, model="intfloat/multilingual-e5-base", revision="main", cache_folder=None):
        self.model, self.revision, self.cache_folder = model, revision, cache_folder
        self.version = f"{revision}:e5-prefix-l2-vi-v1"
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model, revision=self.revision, cache_folder=self.cache_folder, device="cpu")
            commit = self._model[0].auto_model.config._commit_hash
            if not commit:
                raise ValueError("Cannot resolve embedding model revision")
            self.version = f"{commit}:e5-prefix-l2-vi-v1"
        return self._model

    def _encode(self, texts, query):
        with self._lock:
            model = self._load()
            vectors = model.encode([("query: " if query else "passage: ") + t for t in texts],
                                   batch_size=16, normalize_embeddings=True)
            if len(vectors) != len(texts):
                raise ValueError("Embedding count mismatch")
            return [validate_vector(v) for v in vectors]

    async def embed(self, texts, *, query=False):
        return await asyncio.to_thread(self._encode, texts, query) if texts else []

    async def tokenizer(self):
        def load():
            with self._lock:
                return self._load().tokenizer
        return await asyncio.to_thread(load)

    async def resolve_version(self):
        # Lightweight identity resolution: validation need not load the 1 GB model.
        def resolve():
            if self._model is None:
                from huggingface_hub import HfApi
                commit = HfApi().model_info(self.model, revision=self.revision, timeout=15).sha
                if not commit:
                    raise ValueError("Cannot resolve embedding model revision")
                self.version = f"{commit}:e5-prefix-l2-vi-v1"
            return self.version
        return await asyncio.to_thread(resolve)
