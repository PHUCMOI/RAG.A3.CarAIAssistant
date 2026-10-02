"""Text search router."""

import csv
import time
from fastapi import APIRouter
from image_service.app.config import get_settings
from image_service.app.core.rag_adapter import search_text_cars
from image_service.app.models.schemas import TextSearchRequest, TextSearchResponse, TextSearchResultItem

router = APIRouter(tags=["Text Search"])


def get_car_images(car_id: str) -> list[str]:
    settings = get_settings()
    manifest = settings.dataset_dir / "images_manifest.csv"
    if not manifest.exists():
        manifest = settings.data_dir / "images_manifest.csv"
    if not manifest.exists():
        return []

    images = []
    try:
        with open(manifest, "r", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                if row.get("car_id") == car_id:
                    images.append(row.get("image_path", "").replace("\\", "/"))
    except Exception:
        pass
    return images


@router.post("/search/text", response_model=TextSearchResponse)
async def search_text(body: TextSearchRequest):
    start_time = time.perf_counter()
    items = search_text_cars(
        query=body.query,
        top_k=body.top_k,
        brand=body.brand,
        body_type=body.body_type,
        max_price=body.max_price,
        seats=body.seats,
    )
    for it in items:
        it["image_paths"] = get_car_images(it["car_id"])

    latency = round((time.perf_counter() - start_time) * 1000, 2)
    return TextSearchResponse(
        results=[TextSearchResultItem(**it) for it in items],
        total_found=len(items),
        query=body.query,
        latency_ms=latency,
    )
