"""One public turn endpoint; clients send raw input, never select the business route."""
import base64
import binascii
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.config import get_settings
from app.models.schemas import ChatRequest
from app.application.rag.dependencies import get_lazy_rag_service
from app.application.rag.intent import normalize
from app.infrastructure.ai.question_understanding import understand
from app.infrastructure.ai.natural_answers import compose_grounded
from app.routers.chat import chat

router = APIRouter(prefix='/chat', tags=['Chat'])


class RememberedCar(BaseModel):
    # Only IDs/names are accepted from guest history; descriptions are never treated as evidence.
    car_id: str = Field(alias='carId', min_length=1, max_length=100)
    display_name: str = Field(alias='displayName', min_length=1, max_length=200)


class GuestTurn(BaseModel):
    question: str = Field(default='', max_length=1000)
    imageBase64: str | None = Field(default=None, max_length=14_000_000)
    mimeType: str | None = None
    recentQuestions: list[str] = Field(default_factory=list, max_length=3)
    lastAnswer: str = Field(default='', max_length=1800)
    lastContexts: list[RememberedCar] = Field(default_factory=list, max_length=10)


@router.post('/turns')
async def guest_turn(request: GuestTurn, service=Depends(get_lazy_rag_service)):
    from app.core.chat_access import restricted_admin_question, refusal_result
    if restricted_admin_question(request.question):
        return dict(refusal_result(), requiresLogin=False)
    if not request.question.strip() and not request.imageBase64:
        raise HTTPException(422, 'Cần câu hỏi hoặc ảnh xe.')
    image = None
    if request.imageBase64 is not None:
        if request.mimeType not in {'image/jpeg', 'image/png', 'image/webp'}:
            raise HTTPException(422, 'Chọn ảnh JPEG, PNG hoặc WebP.')
        try:
            image = base64.b64decode(request.imageBase64, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, 'Ảnh không hợp lệ.')
        if not image or len(image) > 10_000_000:
            raise HTTPException(413, 'Ảnh phải nhỏ hơn 10 MB.')
    question = request.question.strip() or 'Nhận diện xe trong ảnh'
    if any(len(q) > 1000 for q in request.recentQuestions):
        raise HTTPException(413, 'Lịch sử câu hỏi quá lớn.')
    try:
        interpreted = await understand(question, {'hasImage': image is not None, 'lastRoute': 'catalogue',
            'recentQuestions': request.recentQuestions, 'lastAnswer': request.lastAnswer})
    except Exception as exc:
        raise HTTPException(503, 'Chưa hiểu được câu hỏi qua Bedrock. Vui lòng thử lại.') from exc
    if interpreted.route == 'orders':
        final = await compose_grounded(question, {'status': 'needs_clarification',
            'retrievedAnswer': 'Khách chưa đăng nhập. Cần đăng nhập để tra cứu/đối chiếu ảnh với đơn thuộc tài khoản; chưa có dữ liệu đơn hàng.'})
        return dict(final, contexts=[], requiresLogin=True)
    if interpreted.needs_clarification:
        return await chat(ChatRequest(question=question, clarification=interpreted.clarification), service)
    if image is not None:
        try:
            async with httpx.AsyncClient(timeout=240) as client:
                response = await client.post(get_settings().image_api_url.rstrip('/') + '/chat',
                    files={'file': ('car-image', image, request.mimeType)}, data={'message': interpreted.question})
                response.raise_for_status()
                result = response.json()
            return {**result, 'contexts': result.get('catalog_contexts', []),
                'retrievedContextIds': result.get('retrieved_context_ids', []),
                'generationMode': result.get('generation_mode'), 'requiresLogin': False}
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise HTTPException(503, 'Chưa xử lý được ảnh. Vui lòng thử lại.') from exc
    q = interpreted.question
    car_ids = None
    normalized = normalize(q)
    if request.lastContexts:
        if re.fullmatch(r'(dung|dung roi|vang|ok|chinh xac|yes)[.! ]*', normalized) and request.recentQuestions:
            q = request.recentQuestions[-1]
            car_ids = [c.car_id for c in request.lastContexts]
        elif re.search(r'xe (do|nay)|mau (do|nay)|trong anh|trong hinh', normalized):
            q += f' (Xe đang trao đổi: {request.lastContexts[0].display_name})'
            if not re.search(r'so sanh|compare', normalized):
                car_ids = [request.lastContexts[0].car_id]
    return await chat(ChatRequest(question=q, carIds=car_ids), service)
