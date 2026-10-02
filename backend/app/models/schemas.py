from datetime import date, datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    """Base model with camelCase serialization and population by field name."""
    model_config = ConfigDict(
        populate_by_name=True,
        serialize_by_alias=True,
    )


class CarDto(CamelModel):
    car_id: str = Field(..., alias="carId")
    genmodel_id: str = Field(..., alias="genmodelId")
    brand: str = Field(..., alias="brand")
    display_name: str = Field(..., alias="displayName")
    description: str = Field(..., alias="description")
    aliases: list[str] = Field(default_factory=list, alias="aliases")
    market_status_vn: str = Field(..., alias="marketStatusVn")
    body_type: Optional[str] = Field(None, alias="bodyType")
    fuel_type: Optional[str] = Field(None, alias="fuelType")
    transmission: Optional[str] = Field(None, alias="transmission")
    seats: Optional[int] = Field(None, alias="seats")
    engine: Optional[str] = Field(None, alias="engine")
    engine_power_hp: Optional[int] = Field(None, alias="enginePowerHp")
    length_mm: Optional[int] = Field(None, alias="lengthMm")
    width_mm: Optional[int] = Field(None, alias="widthMm")
    height_mm: Optional[int] = Field(None, alias="heightMm")
    wheelbase_mm: Optional[int] = Field(None, alias="wheelbaseMm")
    price_vnd_from: Optional[int] = Field(None, alias="priceVndFrom")
    price_as_of: Optional[str] = Field(None, alias="priceAsOf")
    price_source_id: Optional[str] = Field(None, alias="priceSourceId")
    warranty_months: Optional[int] = Field(None, alias="warrantyMonths")
    warranty_distance_km: Optional[int] = Field(None, alias="warrantyDistanceKm")
    presence_source_id: str = Field(..., alias="presenceSourceId")
    missing_fields: list[str] = Field(default_factory=list, alias="missingFields")
    image_count: int = Field(0, alias="imageCount")


class CarListResponse(CamelModel):
    count: int
    items: list[CarDto]


class CarComparisonResponse(CamelModel):
    items: list[CarDto]
    missing_ids: list[str] = Field(default_factory=list, alias="missingIds")


class DealerDto(CamelModel):
    dealer_id: int = Field(..., alias="dealerId")
    name: str = Field(..., alias="name")
    address: str = Field(..., alias="address")
    city: str = Field(..., alias="city")
    phone: Optional[str] = Field(None, alias="phone")
    website: Optional[str] = Field(None, alias="website")
    supported_brands: list[str] = Field(default_factory=list, alias="supportedBrands")
    source_id: Optional[str] = Field(None, alias="sourceId")
    checked_at: str = Field(..., alias="checkedAt")


class DealerListResponse(CamelModel):
    count: int
    items: list[DealerDto]


class TextSearchRequest(CamelModel):
    query: str
    brand: Optional[str] = None
    body_type: Optional[str] = Field(None, alias="bodyType")
    seats: Optional[int] = None
    max_price: Optional[int] = Field(None, alias="maxPrice")
    top_k: Optional[int] = Field(5, alias="topK")


class TextSearchResponse(CamelModel):
    query: str
    results: list[CarDto]
    retrieval: str = "postgresql-structured-search"


class ChatRequest(CamelModel):
    question: str = Field(min_length=1, max_length=4000)
    image_name: Optional[str] = Field(None, alias="imageName")


class ChatContext(CamelModel):
    car_id: str = Field(..., alias="carId")
    display_name: str = Field(..., alias="displayName")
    description: str = Field(..., alias="description")
    presence_source_id: str = Field(..., alias="presenceSourceId")


class ChatResponse(CamelModel):
    answer: str
    contexts: list[ChatContext]
    grounded: bool = True


class HealthResponse(CamelModel):
    status: str = "ok"
    database: str = "ready"


class SourceDto(CamelModel):
    source_id: str = Field(..., alias="sourceId")
    title: str = Field(..., alias="title")
    url: str = Field(..., alias="url")
    source_type: str = Field(..., alias="sourceType")
    supports: Optional[str] = Field(None, alias="supports")
    checked_at: str = Field(..., alias="checkedAt")


class SourceReference(CamelModel):
    record_id: str = Field(alias="recordId")
    label: str
    car_id: Optional[str] = Field(None, alias="carId")


class SourceReferences(CamelModel):
    cars: list[SourceReference] = Field(default_factory=list)
    prices: list[SourceReference] = Field(default_factory=list)
    warranties: list[SourceReference] = Field(default_factory=list)
    dealers: list[SourceReference] = Field(default_factory=list)
    documents: list[SourceReference] = Field(default_factory=list)


class SourceDetailResponse(SourceDto):
    references: SourceReferences


class SourceListResponse(CamelModel):
    count: int
    items: list[SourceDto]


class WarrantyDto(CamelModel):
    warranty_id: int = Field(..., alias="warrantyId")
    car_id: Optional[str] = Field(None, alias="carId")
    brand_name: Optional[str] = Field(None, alias="brandName")
    duration_months: Optional[int] = Field(None, alias="durationMonths")
    distance_limit_km: Optional[int] = Field(None, alias="distanceLimitKm")
    conditions: Optional[str] = Field(None, alias="conditions")
    source_id: Optional[str] = Field(None, alias="sourceId")


class WarrantyListResponse(CamelModel):
    count: int
    items: list[WarrantyDto]
