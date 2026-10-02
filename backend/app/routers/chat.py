import asyncpg
from fastapi import APIRouter, Depends
from app.core.database import get_db_connection
from app.models.schemas import ChatContext, ChatRequest, ChatResponse
from app.repositories.car_repository import CarRepository

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    cars = await CarRepository.find_mentioned(conn=conn, question=request.question, limit=5)
    if not cars:
        cars = await CarRepository.search(conn=conn, query=request.question, limit=5)

    if request.image_name is not None:
        answer = (
            "Ảnh đã được đính kèm thành công. Giao diện đã sẵn sàng; module nhận diện ảnh CLIP "
            "sẽ được nối ở bước tiếp theo. Dưới đây là context tìm được từ câu hỏi kèm theo."
        )
    elif not cars:
        answer = "Chưa tìm thấy dữ liệu phù hợp trong bộ 50 xe."
    else:
        answer = "Đây là các mẫu xe phù hợp nhất trong dữ liệu hiện có. Module LLM/RAG sẽ được nối ở bước tiếp theo."

    contexts = [
        ChatContext(
            carId=car.car_id,
            displayName=car.display_name,
            description=car.description,
            presenceSourceId=car.presence_source_id,
        )
        for car in cars
    ]

    return ChatResponse(
        answer=answer,
        contexts=contexts,
        grounded=True,
    )
