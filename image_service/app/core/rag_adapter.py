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


def detect_intent(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ["bảo hành", "bao hanh", "warranty", "bảo dưỡng"]):
        return "ask_warranty"
    if any(k in t for k in ["giá", "gia", "bao nhiêu tiền", "chi phí", "price"]):
        return "ask_price"
    if any(k in t for k in ["chỗ", "cho", "ghế", "seats"]):
        return "ask_seats"
    if any(k in t for k in ["động cơ", "công suất", "mã lực", "tiêu hao", "nhiên liệu", "xăng", "dầu", "spec", "thông số"]):
        return "ask_specification"
    if any(k in t for k in ["so sánh", "compare", "khác nhau"]):
        return "compare_cars"
    if any(k in t for k in ["xe gì", "mẫu gì", "identify", "nhận diện"]):
        return "identify_car"
    return "general_car_inquiry"


def answer_rag(
    question: str,
    car_ids: Optional[List[str]] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """Điều phối câu hỏi RAG: Thử gọi TV2 thật nếu có, fallback mock nếu chưa."""
    start_time = time.perf_counter()
    cars_db = get_cars_dict()

    try:
        from src import rag as tv2_rag
        if hasattr(tv2_rag, "answer"):
            res = tv2_rag.answer(question=question, car_ids=car_ids, top_k=top_k)
            if isinstance(res, dict) and "answer" in res:
                return res
    except Exception:
        pass

    intent = detect_intent(question)
    contexts: List[Dict[str, Any]] = []
    target_cars: List[Dict[str, Any]] = []

    if car_ids:
        for cid in car_ids:
            if cid in cars_db:
                target_cars.append(cars_db[cid])

    if not target_cars:
        for cid, c in cars_db.items():
            name = c.get("display_name", "").lower()
            if name and name in question.lower():
                target_cars.append(c)
                if len(target_cars) >= top_k:
                    break

    if not target_cars and cars_db:
        target_cars = list(cars_db.values())[:1]

    answer_parts = []
    for car in target_cars:
        cid = car.get("car_id", "")
        name = car.get("display_name", "Xe ô tô")
        brand = car.get("brand", "")
        price = car.get("price_vnd_from")
        price_str = format_currency_vnd(price)
        seats = car.get("seats", "N/A")
        body_type = car.get("body_type", "")
        fuel = car.get("fuel_type", "")
        engine = car.get("engine", "")
        hp = car.get("engine_power_hp", "")
        warranty_m = car.get("warranty_months", 36)
        warranty_km = car.get("warranty_distance_km", 100000)
        source = car.get("presence_source_id", "autowise_catalog")

        spec_text = (
            f"Mẫu xe {name} ({brand}), kiểu dáng {body_type}, {seats} chỗ ngồi. "
            f"Động cơ {engine} ({hp} HP), nhiên liệu {fuel}. "
            f"Giá tham khảo từ {price_str}. Bảo hành: {warranty_m} tháng hoặc {warranty_km:,} km."
        )
        contexts.append({
            "context_id": f"{cid}_specs_warranty",
            "car_id": cid,
            "text": spec_text,
            "source_name": source,
            "score": 0.95,
        })

        if intent == "ask_warranty":
            answer_parts.append(
                f"Mẫu xe **{name}** có chính sách bảo hành chính hãng là **{warranty_m} tháng** (hoặc **{warranty_km:,} km**, tuỳ điều kiện nào đến trước)."
            )
        elif intent == "ask_price":
            answer_parts.append(
                f"Giá bán tham khảo của **{name}** tại Việt Nam khởi điểm từ **{price_str}**."
            )
        elif intent == "ask_seats":
            answer_parts.append(
                f"Mẫu xe **{name}** được thiết kế với cấu hình **{seats} chỗ ngồi** ({body_type})."
            )
        elif intent == "ask_specification":
            answer_parts.append(
                f"Thông số kỹ thuật của **{name}**: Động cơ {engine} ({hp} HP), nhiên liệu {fuel}, {seats} chỗ ngồi."
            )
        else:
            answer_parts.append(
                f"**{name}** là dòng xe {body_type} {seats} chỗ của {brand}, giá tham khảo từ {price_str}, bảo hành {warranty_m} tháng."
            )

    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    return {
        "answer": " ".join(answer_parts) if answer_parts else "Chưa có thông tin phù hợp.",
        "intent": intent,
        "contexts": contexts,
        "latency_ms": latency_ms,
    }


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
