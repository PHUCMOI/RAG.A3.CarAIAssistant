"""Car catalog details router."""

from fastapi import APIRouter, HTTPException, status
from image_service.app.core.rag_adapter import get_cars_dict
from image_service.app.models.schemas import CarDetailResponse
from image_service.app.routers.text_search import get_car_images

router = APIRouter(tags=["Cars"])


@router.get("/cars/{car_id}", response_model=CarDetailResponse)
async def get_car(car_id: str):
    cars_db = get_cars_dict()
    car = cars_db.get(car_id)
    if not car:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mẫu xe có mã '{car_id}' không tồn tại trong cơ sở dữ liệu 50 xe.",
        )

    images = get_car_images(car_id)
    return CarDetailResponse(
        car_id=car["car_id"],
        genmodel_id=car.get("genmodel_id"),
        brand=car.get("brand") or car.get("brand_name") or "",
        display_name=car.get("display_name") or "",
        description=car.get("description"),
        body_type=car.get("body_type"),
        fuel_type=car.get("fuel_type"),
        transmission=car.get("transmission"),
        seats=car.get("seats"),
        engine=car.get("engine"),
        engine_power_hp=car.get("engine_power_hp"),
        length_mm=car.get("length_mm"),
        width_mm=car.get("width_mm"),
        height_mm=car.get("height_mm"),
        wheelbase_mm=car.get("wheelbase_mm"),
        price_vnd_from=car.get("price_vnd_from"),
        price_as_of=car.get("price_as_of"),
        warranty_months=car.get("warranty_months"),
        warranty_distance_km=car.get("warranty_distance_km"),
        market_status_vn=car.get("market_status_vn"),
        missing_fields=car.get("missing_fields", []),
        images=images,
    )
