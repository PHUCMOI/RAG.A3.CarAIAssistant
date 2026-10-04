from fastapi import APIRouter, Depends
from app.models.schemas import ChatRequest, ChatResponse, ChatContext
from app.application.rag.dependencies import get_rag_service

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, service=Depends(get_rag_service)):
    result = await service.answer(request.question, image_name=request.image_name,
        explicit_filters=request.filters, car_ids=request.car_ids, top_k=request.top_k)
    r = result.retrieval_result
    return ChatResponse(answer=result.answer, grounded=result.grounded,
        contexts=[ChatContext(carId=c.car_id, displayName=c.display_name, description=c.description,
                              presenceSourceId=c.presence_source_id) for c in r.cars],
        intent=r.analysis.intent, filters=r.filters, evidence=r.evidence, citations=result.citations,
        status=result.status, generationMode=result.generation_mode, retrieval=r.retrieval)
