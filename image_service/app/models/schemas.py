"""Data models and API schemas for Image Service."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class CarImageMatch(BaseModel):
    """Một mẫu xe khớp từ tìm kiếm ảnh."""
    car_id: str = Field(..., description="Mã định danh duy nhất của xe, ví dụ car_57_7")
    brand: Optional[str] = Field(None, description="Hãng sản xuất (Mazda, Toyota...)")
    model: Optional[str] = Field(None, description="Tên dòng xe (CX-5, RAV4...)")
    display_name: Optional[str] = Field(None, description="Tên đầy đủ hiển thị")
    similarity: float = Field(..., description="Cosine similarity score (0.0 -> 1.0)")
    best_image: str = Field(..., description="Đường dẫn ảnh tương đồng nhất")


class ImageSearchResponse(BaseModel):
    """Kết quả trả về của endpoint POST /search/image."""
    results: List[CarImageMatch] = Field(..., description="Top-k xe duy nhất phù hợp nhất")
    confidence: Literal["high", "medium", "low"] = Field(
        "medium", description="Mức độ tin cậy của kết quả"
    )
    uncertain: bool = Field(
        False, description="Cờ cảnh báo nếu độ tự tin thấp hoặc góc chụp khó"
    )
    margin: float = Field(
        0.0, description="Khoảng cách chênh lệch similarity giữa top-1 và top-2"
    )
    latency_ms: Optional[float] = Field(None, description="Thời gian xử lý tính bằng mili-giây")


class TextSearchRequest(BaseModel):
    """Dữ liệu yêu cầu tìm kiếm bằng văn bản POST /search/text."""
    query: str = Field(..., description="Nội dung tìm kiếm từ người dùng")
    top_k: int = Field(5, description="Số lượng kết quả", ge=1, le=50)
    brand: Optional[str] = Field(None, description="Lọc theo hãng")
    body_type: Optional[str] = Field(None, description="Lọc theo loại thân xe (SUV, Sedan...)")
    max_price: Optional[float] = Field(None, description="Giá trần tham khảo (VND)")
    seats: Optional[int] = Field(None, description="Số lượng chỗ ngồi")


class TextSearchResultItem(BaseModel):
    """Chi tiết một xe trong kết quả tìm kiếm văn bản."""
    car_id: str
    display_name: str
    brand: str
    price_vnd_from: Optional[float] = None
    body_type: Optional[str] = None
    engine: Optional[str] = None
    seats: Optional[int] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    description: Optional[str] = None
    image_paths: List[str] = Field(default_factory=list)
    relevance_score: Optional[float] = None


class TextSearchResponse(BaseModel):
    results: List[TextSearchResultItem]
    total_found: int
    query: str
    latency_ms: Optional[float] = None


class IdentifiedCar(BaseModel):
    car_id: str
    brand: Optional[str] = None
    model: Optional[str] = None
    similarity: float


class ContextChunk(BaseModel):
    context_id: str
    car_id: Optional[str] = None
    text: str
    source_name: Optional[str] = None
    score: Optional[float] = None


class ChatRequest(BaseModel):
    """Yêu cầu chat (JSON body)."""
    message: Optional[str] = Field(None, description="Tin nhắn câu hỏi")
    image_base64: Optional[str] = Field(None, description="Ảnh mã hóa base64")
    image_url: Optional[str] = Field(None, description="URL hoặc đường dẫn ảnh")
    history: Optional[List[Dict[str, str]]] = Field(None, description="Lịch sử chat")


class ChatResponse(BaseModel):
    """Kết quả trả về của endpoint POST /chat."""
    answer: str = Field(..., description="Câu trả lời từ RAG assistant")
    intent: str = Field("unknown", description="Ý định câu hỏi được phát hiện")
    identified_cars: List[IdentifiedCar] = Field(
        default_factory=list, description="Danh sách các xe nhận diện được từ ảnh"
    )
    contexts: List[ContextChunk] = Field(
        default_factory=list, description="Các đoạn ngữ cảnh trích dẫn"
    )
    uncertain: bool = Field(False, description="Cờ cảnh báo độ tự tin thấp")
    latency_ms: float = Field(..., description="Tổng thời gian phản hồi endpoint (ms)")


class CarDetailResponse(BaseModel):
    """Thông tin chi tiết một mẫu xe theo GET /cars/{car_id}."""
    car_id: str
    genmodel_id: Optional[str] = None
    brand: str
    display_name: str
    description: Optional[str] = None
    body_type: Optional[str] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None
    seats: Optional[int] = None
    engine: Optional[str] = None
    engine_power_hp: Optional[int] = None
    length_mm: Optional[int] = None
    width_mm: Optional[int] = None
    height_mm: Optional[int] = None
    wheelbase_mm: Optional[int] = None
    price_vnd_from: Optional[float] = None
    price_as_of: Optional[str] = None
    warranty_months: Optional[int] = None
    warranty_distance_km: Optional[int] = None
    market_status_vn: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Kết quả trả về của GET /health."""
    status: str
    service: str
    version: str
    index_loaded: bool
    total_indexed_images: int
    dimension: int
    timestamp: float
