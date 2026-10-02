"""Test suite for standalone image_service microservice."""

from __future__ import annotations

import io
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from image_service.app.core.feature_extractor import StandaloneFeatureExtractor
from image_service.app.core.image_retriever import (
    ImageRetriever,
    ImageTooLargeError,
    InvalidImageError,
)
from image_service.app.core.vector_index import get_vector_index
from image_service.app.main import app

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def retriever():
    idx = get_vector_index()
    return ImageRetriever(index=idx)


@pytest.fixture
def sample_valid_image_bytes():
    img = Image.new("RGB", (128, 128), color=(200, 50, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def sample_car_image_path():
    img_dir = ROOT / "dataset" / "images"
    jpg_files = list(img_dir.glob("*/*.jpg"))
    if jpg_files:
        return jpg_files[0]
    tmp = ROOT / "test_car.jpg"
    return tmp


def test_feature_extractor_vector_properties():
    extractor = StandaloneFeatureExtractor()
    img = Image.new("RGB", (128, 128), color=(50, 150, 200))
    vec = extractor.extract(img)
    assert isinstance(vec, np.ndarray)
    assert vec.shape == (512,)
    assert abs(np.linalg.norm(vec) - 1.0) < 1e-4


def test_retriever_initialization(retriever):
    assert retriever is not None
    assert retriever.index is not None
    assert retriever.index.size() > 0
    assert len(retriever.cars_metadata) >= 40


def test_retriever_search_valid_image(retriever, sample_car_image_path):
    result = retriever.search(sample_car_image_path, top_k=5)
    assert "results" in result
    assert "confidence" in result
    results = result["results"]
    assert len(results) <= 5
    assert len(results) > 0
    # Car-level aggregation
    car_ids = [r["car_id"] for r in results]
    assert len(car_ids) == len(set(car_ids))


def test_retriever_empty_image_error(retriever):
    with pytest.raises(InvalidImageError):
        retriever.search(b"")


def test_retriever_corrupted_image_error(retriever):
    with pytest.raises(InvalidImageError):
        retriever.search(b"NOT_A_VALID_IMAGE_BYTES")


def test_retriever_too_large_image_error(retriever):
    large_bytes = b"0" * (11 * 1024 * 1024)
    with pytest.raises(ImageTooLargeError):
        retriever.search(large_bytes)


def test_api_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["index_loaded"] is True
    assert data["total_indexed_images"] > 0
    assert data["dimension"] == 512


def test_api_search_image(client, sample_valid_image_bytes):
    res = client.post(
        "/search/image",
        files={"file": ("test.jpg", sample_valid_image_bytes, "image/jpeg")},
        data={"top_k": 3},
    )
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    assert len(data["results"]) <= 3
    assert "confidence" in data
    assert "latency_ms" in data


def test_api_search_image_empty(client):
    res = client.post(
        "/search/image",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400


def test_api_search_text(client):
    res = client.post(
        "/search/text",
        json={"query": "Toyota SUV", "top_k": 5},
    )
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    assert data["total_found"] > 0


def test_api_chat_text_only(client):
    res = client.post(
        "/chat",
        data={"message": "Mazda CX-5 bảo hành bao lâu?"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert "intent" in data
    assert "bảo hành" in data["answer"].lower() or "tháng" in data["answer"].lower()


def test_api_chat_with_image(client, sample_valid_image_bytes):
    res = client.post(
        "/chat",
        data={"message": "Xe trong ảnh giá bao nhiêu?"},
        files={"file": ("car.jpg", sample_valid_image_bytes, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert len(data["identified_cars"]) > 0


def test_api_get_car_success(client):
    res = client.get("/cars/car_92_44")
    assert res.status_code == 200
    data = res.json()
    assert data["car_id"] == "car_92_44"
    assert data["brand"] == "Toyota"
    assert len(data["images"]) > 0


def test_api_get_car_not_found(client):
    res = client.get("/cars/unknown_car_9999")
    assert res.status_code == 404
