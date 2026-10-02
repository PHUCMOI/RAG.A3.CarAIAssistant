"""Image search router."""

import time
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from image_service.app.core.image_retriever import (
    ImageRetrievalError,
    ImageRetriever,
    ImageTooLargeError,
    InvalidImageError,
)
from image_service.app.models.schemas import ImageSearchResponse

router = APIRouter(tags=["Image Search"])

_retriever: ImageRetriever | None = None


def get_retriever() -> ImageRetriever:
    global _retriever
    if _retriever is None:
        _retriever = ImageRetriever()
    return _retriever


@router.post("/search/image", response_model=ImageSearchResponse)
async def search_image(
    file: UploadFile = File(..., description="File ảnh xe (JPG, PNG, WebP)"),
    top_k: int = Form(5, description="Số lượng xe trả về"),
    retriever: ImageRetriever = Depends(get_retriever),
):
    start_time = time.perf_counter()
    try:
        content = await file.read()
        if len(content) == 0:
            raise InvalidImageError("Tập tin ảnh tải lên bị rỗng (0 bytes).")

        result = retriever.search(content, top_k=top_k)
        result["latency_ms"] = round((time.perf_counter() - start_time) * 1000, 2)
        return result

    except (InvalidImageError, ImageTooLargeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi ảnh: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi xử lý tìm kiếm ảnh: {str(e)}",
        )
