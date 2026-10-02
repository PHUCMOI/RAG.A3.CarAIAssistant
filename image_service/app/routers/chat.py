"""Multimodal Chat Router."""

from __future__ import annotations

import base64
import logging
import time
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from image_service.app.core.image_retriever import (
    ImageRetriever,
    ImageTooLargeError,
    InvalidImageError,
)
from image_service.app.core.rag_adapter import answer_rag
from image_service.app.models.schemas import ChatResponse, ContextChunk, IdentifiedCar
from image_service.app.routers.image_search import get_retriever

logger = logging.getLogger("image_service.chat")
router = APIRouter(tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    message: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    retriever: ImageRetriever = Depends(get_retriever),
):
    start_time = time.perf_counter()

    img_bytes: Optional[bytes] = None
    user_message: Optional[str] = message

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            user_message = body.get("message")
            b64_str = body.get("image_base64")
            if b64_str:
                if "," in b64_str:
                    b64_str = b64_str.split(",", 1)[1]
                img_bytes = base64.b64decode(b64_str)
            elif body.get("image_url"):
                url_p = Path(body["image_url"])
                if url_p.exists():
                    img_bytes = url_p.read_bytes()
        except Exception as e:
            logger.warning("Không thể parse JSON: %s", e)

    if file is not None:
        try:
            img_bytes = await file.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi đọc file: {e}")

    if not user_message and not img_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cần ít nhất câu hỏi 'message' hoặc tập tin ảnh 'file'.",
        )

    identified_cars: list[IdentifiedCar] = []
    candidate_car_ids: list[str] = []
    uncertain_flag = False
    image_err_msg: Optional[str] = None

    # 1. Image recognition if photo present
    if img_bytes:
        try:
            search_res = retriever.search(img_bytes, top_k=5)
            uncertain_flag = search_res.get("uncertain", False)
            for item in search_res.get("results", []):
                identified_cars.append(
                    IdentifiedCar(
                        car_id=item["car_id"],
                        brand=item.get("brand"),
                        model=item.get("model"),
                        similarity=item["similarity"],
                    )
                )
                candidate_car_ids.append(item["car_id"])
        except (InvalidImageError, ImageTooLargeError) as e:
            image_err_msg = str(e)
            uncertain_flag = True
        except Exception as e:
            image_err_msg = "Lỗi xử lý hình ảnh."
            uncertain_flag = True

    # 2. Text inquiry & RAG coordination
    text_query = user_message or "Xe trong ảnh là xe gì?"
    contexts_res: list[ContextChunk] = []

    try:
        rag_out = answer_rag(
            question=text_query,
            car_ids=candidate_car_ids if candidate_car_ids else None,
            top_k=5,
        )
        answer_text = rag_out.get("answer", "")
        intent_detected = rag_out.get("intent", "general_car_inquiry")
        for c in rag_out.get("contexts", []):
            contexts_res.append(ContextChunk(**c))
    except Exception as e:
        logger.error("Lỗi RAG: %s", e)
        if identified_cars:
            top_c = identified_cars[0]
            answer_text = f"Đã nhận diện mẫu xe gần nhất là {top_c.brand} {top_c.model} (độ tương đồng {top_c.similarity*100:.1f}%)."
        else:
            answer_text = "Hệ thống đang bận. Vui lòng thử lại sau."
        uncertain_flag = True
        intent_detected = "error_fallback"

    if image_err_msg:
        answer_text = f"[Cảnh báo: {image_err_msg}] {answer_text}"

    if img_bytes and uncertain_flag and identified_cars:
        answer_text = (
            "Hệ thống không hoàn toàn chắc chắn về mẫu xe này (độ tương đồng thấp hoặc góc chụp khó). "
            + answer_text
        )

    latency = round((time.perf_counter() - start_time) * 1000, 2)
    return ChatResponse(
        answer=answer_text,
        intent=intent_detected,
        identified_cars=identified_cars,
        contexts=contexts_res,
        uncertain=uncertain_flag,
        latency_ms=latency,
    )
