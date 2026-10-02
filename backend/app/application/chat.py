from typing import Protocol
from app.models.schemas import CarDto, ChatRequest, ChatResponse, ChatContext

class ChatCatalogue(Protocol):
    async def find_mentioned(self, question: str) -> list[CarDto]: ...
    async def search(self, question: str) -> list[CarDto]: ...

async def ask_assistant(request: ChatRequest, catalogue: ChatCatalogue) -> ChatResponse:
    cars = await catalogue.find_mentioned(request.question)
    if not cars:
        cars = await catalogue.search(request.question)

    if request.image_name is not None:
        answer = (
            "Giao diện đã nhận tên ảnh; API này chưa tải lên hoặc phân tích ảnh. Module ảnh "
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
        grounded=bool(cars),
    )
