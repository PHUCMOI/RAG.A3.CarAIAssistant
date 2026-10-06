from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, TYPE_CHECKING
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

if TYPE_CHECKING:
    from app.models.schemas import CarDto

Intent = Literal["find_car", "ask_specification", "ask_price", "ask_warranty",
                 "compare_cars", "find_dealer", "other"]


class RagModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True,
                              serialize_by_alias=True, extra="forbid")


class RagFilters(RagModel):
    brand: str | None = None
    body_type: str | None = None
    fuel_type: str | None = None
    transmission: str | None = None
    seats: int | None = Field(None, ge=1, le=100)
    min_price: int | None = Field(None, ge=0)
    max_price: int | None = Field(None, ge=0)
    min_price_inclusive: bool = True
    max_price_inclusive: bool = True
    city: str | None = None


class QueryAnalysis(RagModel):
    question: str
    intent: Intent = "other"
    filters: RagFilters = Field(default_factory=RagFilters)
    car_ids: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class Evidence(RagModel):
    context_id: str
    car_id: str | None = None
    section: str
    content: str
    score: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_ids: list[str] = Field(default_factory=list)


class Citation(RagModel):
    context_id: str
    source_id: str | None = None
    title: str
    url: str | None = None
    source_detail_path: str | None = None


class Draft(RagModel):
    answer: str = Field(min_length=1, max_length=12000)
    fact_ids: list[str] = Field(min_length=1)
    context_ids: list[str] = Field(min_length=1)


@dataclass
class Document:
    document_id: str
    car_id: str | None
    section: str
    content: str
    source_id: str | None
    metadata: dict[str, Any]
    content_hash: str
    template_version: str = "vi-v1"

    def evidence(self, score: float = 0.0) -> Evidence:
        return Evidence(context_id=self.document_id, car_id=self.car_id,
                        section=self.section, content=self.content, score=score,
                        metadata=self.metadata, source_ids=self.metadata.get("sourceIds", []))


@dataclass
class RetrievalResult:
    analysis: QueryAnalysis
    filters: RagFilters
    cars: list[CarDto] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    retrieval: str = "postgresql-structured-search"
    sources: dict[str, Any] = field(default_factory=dict)


@dataclass
class ContextPackage:
    retrieval: RetrievalResult
    facts: dict[str, dict[str, Any]]
    citations: list[Citation]
    prompt: str
    statements: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class RagResult:
    answer: str
    retrieval_result: RetrievalResult
    citations: list[Citation] = field(default_factory=list)
    grounded: bool = False
    status: str = "no_data"
    generation_mode: str = "template"


class EmbeddingProvider(Protocol):
    model: str
    version: str
    async def embed(self, texts: list[str], *, query: bool = False) -> list[list[float]]: ...


class GenerationProvider(Protocol):
    async def generate(self, package: ContextPackage, repair: str | None = None) -> Draft: ...
