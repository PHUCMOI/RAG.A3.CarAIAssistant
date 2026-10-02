"""Core Image Retriever: Preprocessing, Vector Search, and Car Aggregation."""

from __future__ import annotations

import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import numpy as np
from PIL import Image, ImageOps

from image_service.app.config import get_settings
from image_service.app.core.feature_extractor import BaseFeatureExtractor, get_feature_extractor
from image_service.app.core.vector_index import CarImageVectorIndex, get_vector_index

logger = logging.getLogger("image_service.retriever")


class ImageRetrievalError(Exception):
    pass


class InvalidImageError(ImageRetrievalError):
    pass


class ImageTooLargeError(ImageRetrievalError):
    pass


class ImageRetriever:
    """Bộ máy nhận diện và truy hồi mẫu xe từ hình ảnh."""

    def __init__(
        self,
        index: Optional[CarImageVectorIndex] = None,
        feature_extractor: Optional[BaseFeatureExtractor] = None,
        use_clip: Optional[bool] = None,
    ):
        self.settings = get_settings()
        self.index = index or get_vector_index()
        self.feature_extractor = feature_extractor or get_feature_extractor(use_clip=use_clip)
        self.cars_metadata: Dict[str, Dict[str, Any]] = self._load_cars()

    def _load_cars(self) -> Dict[str, Dict[str, Any]]:
        for target in [self.settings.data_dir / "cars.json", self.settings.dataset_dir / "cars.json"]:
            if target.exists():
                try:
                    with open(target, "r", encoding="utf-8") as f:
                        cars = json.load(f)
                        return {c["car_id"]: c for c in cars}
                except Exception as e:
                    logger.warning("Không thể đọc %s: %s", target, e)
        return {}

    def validate_and_open_image(
        self,
        image_input: Union[str, Path, bytes, Image.Image],
    ) -> Image.Image:
        max_bytes = self.settings.max_image_size_mb * 1024 * 1024

        if isinstance(image_input, Image.Image):
            return ImageOps.exif_transpose(image_input.convert("RGB"))

        if isinstance(image_input, (bytes, bytearray)):
            if len(image_input) == 0:
                raise InvalidImageError("Tập tin ảnh tải lên bị rỗng (0 bytes).")
            if len(image_input) > max_bytes:
                raise ImageTooLargeError(
                    f"Kích thước tập tin ({len(image_input) / (1024*1024):.1f}MB) vượt quá giới hạn {self.settings.max_image_size_mb}MB."
                )
            try:
                stream = io.BytesIO(image_input)
                with Image.open(stream) as img:
                    img.verify()
                stream.seek(0)
                img = Image.open(stream)
                img.load()
                return ImageOps.exif_transpose(img.convert("RGB"))
            except Exception as e:
                raise InvalidImageError(f"Tập tin không phải định dạng ảnh hợp lệ hoặc bị hỏng: {e}")

        if isinstance(image_input, (str, Path)):
            p = Path(image_input)
            if not p.exists() and (self.settings.project_root / p).exists():
                p = self.settings.project_root / p
            if not p.exists():
                raise InvalidImageError(f"Không tìm thấy tập tin ảnh: {image_input}")

            size_bytes = p.stat().st_size
            if size_bytes == 0:
                raise InvalidImageError("Tập tin ảnh tải lên bị rỗng (0 bytes).")
            if size_bytes > max_bytes:
                raise ImageTooLargeError(f"Kích thước tập tin vượt quá {self.settings.max_image_size_mb}MB.")

            try:
                with Image.open(p) as img:
                    img.verify()
                with Image.open(p) as img:
                    img.load()
                    return ImageOps.exif_transpose(img.convert("RGB"))
            except Exception as e:
                raise InvalidImageError(f"Không thể giải mã ảnh: {e}")

        raise InvalidImageError(f"Định dạng đầu vào không được hỗ trợ: {type(image_input)}")

    def encode_query_image(self, image_input: Union[str, Path, bytes, Image.Image]) -> np.ndarray:
        pil_img = self.validate_and_open_image(image_input)
        return self.feature_extractor.extract(pil_img)

    def search(
        self,
        image_input: Union[str, Path, bytes, Image.Image],
        top_k: int = 5,
        candidate_car_ids: Optional[List[str]] = None,
        candidate_pool: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Tìm kiếm top-k xe phù hợp nhất từ ảnh."""
        pool_size = candidate_pool or self.settings.default_candidate_pool
        query_vector = self.encode_query_image(image_input)

        if self.index.size() == 0:
            return {
                "results": [],
                "confidence": "low",
                "uncertain": True,
                "margin": 0.0,
            }

        raw_matches = self.index.search(query_vector, top_k=pool_size)

        # Gom nhóm theo car_id
        car_groups: Dict[str, Dict[str, Any]] = {}
        for meta, score in raw_matches:
            c_id = meta.get("car_id")
            if not c_id:
                continue
            if candidate_car_ids and c_id not in candidate_car_ids:
                continue

            img_path = meta.get("image_path", "")
            if c_id not in car_groups:
                car_groups[c_id] = {
                    "scores": [score],
                    "best_score": score,
                    "best_image": img_path,
                }
            else:
                car_groups[c_id]["scores"].append(score)
                if score > car_groups[c_id]["best_score"]:
                    car_groups[c_id]["best_score"] = score
                    car_groups[c_id]["best_image"] = img_path

        # Tổng hợp điểm và metadata từng xe
        ranked_cars: List[Dict[str, Any]] = []
        for c_id, grp in car_groups.items():
            car_info = self.cars_metadata.get(c_id, {})
            brand = car_info.get("brand") or car_info.get("brand_name")
            model = car_info.get("model") or car_info.get("source_model_name")
            display_name = car_info.get("display_name") or f"{brand} {model}".strip() or c_id

            ranked_cars.append({
                "car_id": c_id,
                "brand": brand,
                "model": model,
                "display_name": display_name,
                "similarity": round(float(grp["best_score"]), 4),
                "best_image": grp["best_image"],
            })

        ranked_cars.sort(key=lambda x: x["similarity"], reverse=True)
        final_top = ranked_cars[:top_k]

        confidence: str = "medium"
        uncertain: bool = False
        margin: float = 0.0

        if not final_top:
            confidence = "low"
            uncertain = True
        else:
            top_1_sim = final_top[0]["similarity"]
            top_2_sim = final_top[1]["similarity"] if len(final_top) > 1 else 0.0
            margin = round(top_1_sim - top_2_sim, 4)

            if top_1_sim < self.settings.threshold_medium:
                confidence = "low"
                uncertain = True
            elif top_1_sim >= self.settings.threshold_high and margin >= self.settings.margin_threshold:
                confidence = "high"
                uncertain = False
            else:
                confidence = "medium"
                uncertain = (top_1_sim < 0.55)

        return {
            "results": final_top,
            "confidence": confidence,
            "uncertain": uncertain,
            "margin": margin,
        }
