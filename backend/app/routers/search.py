from fastapi import APIRouter, Depends
from app.models.schemas import TextSearchRequest, TextSearchResponse
from app.application.rag.contracts import RagFilters
from app.application.rag.dependencies import get_rag_service
from app.application.rag.intent import analyze

router = APIRouter(prefix="/search", tags=["Search"])


@router.post("/text", response_model=TextSearchResponse)
async def text_search(request: TextSearchRequest, service=Depends(get_rag_service)):
    catalogue = await service.repository.catalogue()
    analysis = await analyze(request.query, catalogue,
                             service.generator if hasattr(service.generator, "classify") else None)
    explicit = RagFilters(**request.model_dump(by_alias=False, exclude_unset=True, exclude_none=True,
                          exclude={"query", "top_k"}))
    result = await service.retriever.retrieve(analysis, explicit, top_k=request.top_k)
    return TextSearchResponse(query=request.query, results=result.cars, retrieval=result.retrieval,
                              intent=analysis.intent, filters=result.filters, evidence=result.evidence)
