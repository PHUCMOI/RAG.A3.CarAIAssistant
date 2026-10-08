"""Adapter for RAG & Text Retrieval integration with Member 2."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from image_service.app.config import get_settings

logger = logging.getLogger("image_service.rag_adapter")


def get_cars_dict() -> Dict[str, Dict[str, Any]]:
    settings = get_settings()
    for target in [settings.data_dir / "cars.json", settings.dataset_dir / "cars.json"]:
        if target.exists():
            try:
                with open(target, "r", encoding="utf-8") as f:
                    cars = json.load(f)
                    return {c["car_id"]: c for c in cars}
            except Exception as e:
                logger.warning("Lỗi đọc cars catalog: %s", e)
    return {}


def format_currency_vnd(amount: Optional[float]) -> str:
    if amount is None or amount <= 0:
        return "Liên hệ đại lý"
    return f"{int(amount):,} VND".replace(",", ".")


async def answer_rag(
    question: str,
    car_ids: Optional[List[str]] = None,
    top_k: int = 5,
    *, transport=None, image_match=None,
) -> Dict[str, Any]:
    """Retrieve verified answers from the common RAG API; never fabricate a local fallback."""
    import httpx
    settings = get_settings()
    payload = {"question": question, "topK": top_k}
    if car_ids:
        payload["carIds"] = car_ids
    if image_match is not None:
        payload["imageMatch"] = image_match
    async with httpx.AsyncClient(timeout=settings.rag_timeout_seconds, transport=transport) as client:
        response = await client.post(settings.rag_api_url.rstrip("/") + "/api/chat", json=payload)
        response.raise_for_status()
        result = response.json()
    if not isinstance(result.get("answer"), str) or not result["answer"].strip():
        raise ValueError("RAG returned no answer")
    contexts = [{"context_id": c["carId"], "car_id": c["carId"],
                 "text": c.get("description") or c.get("displayName") or c["carId"],
                 "source_name": c.get("presenceSourceId")}
                for c in result.get("contexts", [])]
    return {"answer": result["answer"], "intent": result.get("intent", "other"), "contexts": contexts, "catalog_contexts": result.get("contexts", []), "generation_mode": result.get("generationMode")}


async def compose_image_answer(question, data):
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.rag_timeout_seconds) as client:
        response = await client.post(settings.rag_api_url.rstrip("/") + "/api/chat/compose",
                                     json={"question": question, "verifiedData": data})
        response.raise_for_status()
        return response.json()["answer"]


def search_text_cars(
    query: str,
    car_ids: Optional[List[str]] = None,
    top_k: int = 5,
    brand: Optional[str] = None,
    body_type: Optional[str] = None,
    max_price: Optional[float] = None,
    seats: Optional[int] = None,
) -> List[Dict[str, Any]]:
    cars_db = get_cars_dict()
    results = []
    q = query.lower()

    for cid, car in cars_db.items():
        if car_ids and cid not in car_ids:
            continue
        if brand and car.get("brand", "").lower() != brand.lower():
            continue
        if body_type and car.get("body_type", "").lower() != body_type.lower():
            continue
        if seats and car.get("seats") != seats:
            continue
        if max_price and car.get("price_vnd_from") and car.get("price_vnd_from") > max_price:
            continue

        score = 0.5
        display_name = car.get("display_name", "").lower()
        if display_name in q or q in display_name:
            score += 0.4

        results.append({
            "car_id": cid,
            "display_name": car.get("display_name", ""),
            "brand": car.get("brand", ""),
            "price_vnd_from": car.get("price_vnd_from"),
            "body_type": car.get("body_type"),
            "engine": car.get("engine"),
            "seats": car.get("seats"),
            "fuel_type": car.get("fuel_type"),
            "transmission": car.get("transmission"),
            "description": car.get("description"),
            "relevance_score": round(score, 2),
            "image_paths": [],
        })

    results.sort(key=lambda x: x["relevance_score"], reverse=True)
    return results[:top_k]
