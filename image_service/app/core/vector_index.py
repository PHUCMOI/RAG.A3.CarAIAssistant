"""FAISS Vector Index Management."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from image_service.app.config import get_settings

logger = logging.getLogger("image_service.vector_index")

DEFAULT_INDEXES_DIR = get_settings().indexes_dir
DEFAULT_INDEX_PATH = DEFAULT_INDEXES_DIR / "image.index"
DEFAULT_EMBEDDINGS_PATH = DEFAULT_INDEXES_DIR / "image_embeddings.npy"
DEFAULT_META_PATH = DEFAULT_INDEXES_DIR / "image_meta.json"

try:
    import faiss
    HAS_FAISS = True
except ImportError:
    HAS_FAISS = False
    logger.warning("faiss-cpu chưa cài đặt, sử dụng NumPy Inner Product fallback.")


class CarImageVectorIndex:
    """Quản lý lưu trữ và tìm kiếm vector index 512 chiều."""

    def __init__(self, dimension: int = 512, index_file: Optional[Path] = None):
        self.dimension = dimension
        self.index_file = index_file
        self.embeddings: Optional[np.ndarray] = None
        self.metadata: List[Dict[str, Any]] = []
        self.faiss_index = None
        if HAS_FAISS:
            self.faiss_index = faiss.IndexFlatIP(self.dimension)

    def size(self) -> int:
        if self.embeddings is not None:
            return len(self.embeddings)
        return len(self.metadata)

    @property
    def total_vectors(self) -> int:
        return self.size()

    def build(self, embeddings: np.ndarray, metadata: List[Dict[str, Any]]) -> None:
        self.embeddings = None
        self.metadata = []
        if HAS_FAISS:
            self.faiss_index = faiss.IndexFlatIP(self.dimension)
        self.add(embeddings, metadata)

    def add(self, new_embeddings: np.ndarray, new_metadata: List[Dict[str, Any]]) -> None:
        if len(new_embeddings) != len(new_metadata):
            raise ValueError("Số lượng embeddings không khớp metadata")
        if len(new_embeddings) == 0:
            return

        norm = np.linalg.norm(new_embeddings, axis=-1, keepdims=True)
        norm[norm == 0] = 1e-8
        new_embeddings = (new_embeddings / norm).astype(np.float32)

        if self.embeddings is None:
            self.embeddings = new_embeddings
        else:
            self.embeddings = np.vstack([self.embeddings, new_embeddings])

        self.metadata.extend(new_metadata)

        if HAS_FAISS:
            if self.faiss_index is None:
                self.faiss_index = faiss.IndexFlatIP(self.dimension)
            self.faiss_index.add(new_embeddings)

    def search(self, query_vector: np.ndarray, top_k: int = 30) -> List[Tuple[Dict[str, Any], float]]:
        if self.size() == 0:
            return []

        query = np.array(query_vector, dtype=np.float32).reshape(1, -1)
        norm = np.linalg.norm(query)
        if norm > 1e-8:
            query = query / norm

        top_k = min(top_k, self.size())

        if HAS_FAISS and self.faiss_index is not None and self.faiss_index.ntotal > 0:
            distances, indices = self.faiss_index.search(query, top_k)
            results = []
            for idx, score in zip(indices[0], distances[0]):
                if 0 <= idx < len(self.metadata):
                    results.append((self.metadata[idx], float(score)))
            return results
        else:
            scores = np.dot(self.embeddings, query.T).flatten()
            top_indices = np.argsort(scores)[::-1][:top_k]
            results = []
            for idx in top_indices:
                results.append((self.metadata[idx], float(scores[idx])))
            return results

    def save(
        self,
        index_path: Optional[Path] = None,
        embeddings_path: Optional[Path] = None,
        meta_path: Optional[Path] = None,
        index_file: Optional[Path] = None,
        embeddings_file: Optional[Path] = None,
        meta_file: Optional[Path] = None,
    ) -> None:
        idx_p = Path(index_path or index_file or DEFAULT_INDEX_PATH)
        emb_p = Path(embeddings_path or embeddings_file or DEFAULT_EMBEDDINGS_PATH)
        meta_p = Path(meta_path or meta_file or DEFAULT_META_PATH)

        idx_p.parent.mkdir(parents=True, exist_ok=True)
        with open(meta_p, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)

        if self.embeddings is not None:
            np.save(emb_p, self.embeddings)

        if HAS_FAISS and self.faiss_index is not None:
            faiss.write_index(self.faiss_index, str(idx_p))
        else:
            idx_p.write_bytes(b"NUMPY_FLAT_IP_INDEX")

        logger.info("Đã lưu index %d ảnh vào %s", self.size(), idx_p)

    def load(self, index_path: Path, embeddings_path: Path, meta_path: Path) -> bool:
        if not meta_path.exists():
            return False

        with open(meta_path, "r", encoding="utf-8") as f:
            self.metadata = json.load(f)

        loaded_faiss = False
        if HAS_FAISS and index_path.exists():
            try:
                self.faiss_index = faiss.read_index(str(index_path))
                loaded_faiss = True
            except Exception as e:
                logger.warning("Không thể đọc FAISS index: %s", e)

        if embeddings_path.exists():
            self.embeddings = np.load(embeddings_path)
            if not loaded_faiss and HAS_FAISS:
                self.faiss_index = faiss.IndexFlatIP(self.dimension)
                self.faiss_index.add(self.embeddings)

        return True


_global_index: Optional[CarImageVectorIndex] = None


def get_vector_index() -> CarImageVectorIndex:
    global _global_index
    if _global_index is None:
        settings = get_settings()
        idx = CarImageVectorIndex(dimension=settings.embedding_dim)
        idx_file = settings.indexes_dir / "image.index"
        emb_file = settings.indexes_dir / "image_embeddings.npy"
        meta_file = settings.indexes_dir / "image_meta.json"
        if meta_file.exists():
            idx.load(idx_file, emb_file, meta_file)
        _global_index = idx
    return _global_index


get_image_index = get_vector_index
