"""Configuration management for Image Retrieval & Multimodal Service."""

from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings

SERVICE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    service_name: str = "AutoWise Image Retrieval & Assistant Service"
    version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = int(os.environ.get("PORT", "8000"))

    # Data & Indexes paths (supports container volumes and local paths)
    project_root: Path = PROJECT_ROOT
    service_root: Path = SERVICE_ROOT
    indexes_dir: Path = Path(os.environ.get("INDEXES_DIR", str(SERVICE_ROOT / "indexes" if (SERVICE_ROOT / "indexes").exists() else PROJECT_ROOT / "indexes")))
    data_dir: Path = Path(os.environ.get("DATA_DIR", str(SERVICE_ROOT / "data" if (SERVICE_ROOT / "data").exists() else PROJECT_ROOT / "data")))
    dataset_dir: Path = Path(os.environ.get("DATASET_DIR", str(SERVICE_ROOT / "dataset" if (SERVICE_ROOT / "dataset").exists() else PROJECT_ROOT / "dataset")))

    # Retrieval hyperparameters
    embedding_dim: int = 512
    max_image_size_mb: int = 10
    threshold_high: float = 0.70
    threshold_medium: float = 0.50
    margin_threshold: float = 0.03
    default_top_k: int = 5
    default_candidate_pool: int = 30
    clip_model_name: str = "openai/clip-vit-base-patch32"

    # CORS
    cors_origins: list[str] = [
        "*",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    model_config = {
        "env_prefix": "IMAGE_SERVICE_",
        "case_sensitive": False,
        "extra": "ignore",
    }


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
