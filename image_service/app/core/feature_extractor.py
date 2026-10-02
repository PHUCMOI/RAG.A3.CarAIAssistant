"""Feature extraction engine for image vector embeddings."""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import List
import numpy as np
from PIL import Image, ImageFilter

from image_service.app.config import get_settings

logger = logging.getLogger("image_service.feature_extractor")


class BaseFeatureExtractor(ABC):
    model_name: str = "base"

    @abstractmethod
    def extract(self, image: Image.Image) -> np.ndarray:
        pass

    def extract_batch(self, images: List[Image.Image]) -> np.ndarray:
        vectors = [self.extract(img) for img in images]
        return np.vstack(vectors).astype(np.float32)


class StandaloneFeatureExtractor(BaseFeatureExtractor):
    """Trích xuất vector 512 chiều thuần NumPy + PIL (không phụ thuộc GPU hay weights lớn)."""

    def __init__(self, dim: int = 512):
        self.dim = dim
        self.model_name = "standalone-numpy-pil-512d"

    def extract(self, image: Image.Image) -> np.ndarray:
        img = image.convert("RGB")
        img_resized = img.resize((128, 128), Image.Resampling.BILINEAR)
        rgb_arr = np.array(img_resized, dtype=np.float32) / 255.0

        hsv_img = img_resized.convert("HSV")
        hsv_arr = np.array(hsv_img, dtype=np.float32) / 255.0

        features: List[float] = []

        # 1. Global color histograms (96 dims)
        for c in range(3):
            h_rgb, _ = np.histogram(rgb_arr[:, :, c], bins=16, range=(0.0, 1.0))
            features.extend(h_rgb.astype(np.float32))
        for c in range(3):
            h_hsv, _ = np.histogram(hsv_arr[:, :, c], bins=16, range=(0.0, 1.0))
            features.extend(h_hsv.astype(np.float32))

        # 2. Spatial grids 4x4 for RGB (96 dims)
        cell_h, cell_w = 32, 32
        for r in range(4):
            for c in range(4):
                block = rgb_arr[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w, :]
                features.extend(np.mean(block, axis=(0, 1)))
                features.extend(np.std(block, axis=(0, 1)))

        # 3. Spatial grids 4x4 for HSV (96 dims)
        for r in range(4):
            for c in range(4):
                block_hsv = hsv_arr[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w, :]
                features.extend(np.mean(block_hsv, axis=(0, 1)))
                features.extend(np.std(block_hsv, axis=(0, 1)))

        # 4. Edge orientations (128 dims)
        gray = img_resized.convert("L")
        gray_arr = np.array(gray, dtype=np.float32) / 255.0
        gx = np.zeros_like(gray_arr)
        gy = np.zeros_like(gray_arr)
        gx[:, 1:-1] = (gray_arr[:, 2:] - gray_arr[:, :-2]) * 0.5
        gy[1:-1, :] = (gray_arr[2:, :] - gray_arr[:-2, :]) * 0.5

        magnitude = np.sqrt(gx**2 + gy**2)
        angle = (np.arctan2(gy, gx) + np.pi) % np.pi

        for r in range(4):
            for c in range(4):
                sub_mag = magnitude[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w]
                sub_ang = angle[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w]
                h_edge, _ = np.histogram(sub_ang, bins=8, range=(0.0, np.pi), weights=sub_mag)
                features.extend(h_edge.astype(np.float32))

        # 5. Texture stats (96 dims)
        edge_detail = gray.filter(ImageFilter.FIND_EDGES)
        edge_arr = np.array(edge_detail, dtype=np.float32) / 255.0
        for r in range(4):
            for c in range(4):
                sub_edge = edge_arr[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w]
                features.append(float(np.mean(sub_edge)))
                features.append(float(np.std(sub_edge)))
                features.append(float(np.max(sub_edge)))
                features.append(float(np.percentile(sub_edge, 75)))
                features.append(float(np.percentile(sub_edge, 25)))
                features.append(float(np.median(sub_edge)))

        vec = np.array(features, dtype=np.float32)
        if len(vec) > self.dim:
            vec = vec[:self.dim]
        elif len(vec) < self.dim:
            pad = np.zeros(self.dim - len(vec), dtype=np.float32)
            vec = np.concatenate([vec, pad])

        norm = np.linalg.norm(vec)
        if norm > 1e-8:
            vec = vec / norm
        else:
            vec = np.zeros_like(vec)
            vec[0] = 1.0

        return vec.astype(np.float32)


class CLIPFeatureExtractor(BaseFeatureExtractor):
    """Trích xuất CLIP embedding (openai/clip-vit-base-patch32)."""

    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        self.model_name = model_name
        self.device = "cpu"
        self.model = None
        self.processor = None
        self._load_model()

    def _load_model(self):
        import torch
        if torch.cuda.is_available():
            self.device = "cuda"
        from transformers import CLIPModel, CLIPProcessor

        try:
            self.model = CLIPModel.from_pretrained(self.model_name, local_files_only=True).to(self.device)
            self.processor = CLIPProcessor.from_pretrained(self.model_name, local_files_only=True)
            self.model.eval()
            logger.info("Đã tải CLIP model từ local cache.")
            return
        except Exception:
            logger.info("CLIP model chưa có trong local cache, đang thử tải từ Hugging Face (%s)...", self.model_name)

        try:
            self.model = CLIPModel.from_pretrained(self.model_name).to(self.device)
            self.processor = CLIPProcessor.from_pretrained(self.model_name)
            self.model.eval()
            logger.info("Đã tải thành công CLIP model từ Hugging Face.")
        except Exception as e:
            raise RuntimeError(f"Không thể tải CLIP weights ({self.model_name}): {e}")

    def extract(self, image: Image.Image) -> np.ndarray:
        import torch
        img_rgb = image.convert("RGB")
        with torch.no_grad():
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            output = self.model.get_image_features(**inputs)
            feats = output.pooler_output if hasattr(output, "pooler_output") and output.pooler_output is not None else output
            feats = feats / feats.norm(dim=-1, keepdim=True)
            return feats.cpu().numpy().squeeze(0).astype(np.float32)

    def extract_batch(self, images: List[Image.Image]) -> np.ndarray:
        import torch
        imgs_rgb = [img.convert("RGB") for img in images]
        with torch.no_grad():
            inputs = self.processor(images=imgs_rgb, return_tensors="pt", padding=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            output = self.model.get_image_features(**inputs)
            feats = output.pooler_output if hasattr(output, "pooler_output") and output.pooler_output is not None else output
            feats = feats / feats.norm(dim=-1, keepdim=True)
            return feats.cpu().numpy().astype(np.float32)


def get_feature_extractor(use_clip: Optional[bool] = None) -> BaseFeatureExtractor:
    settings = get_settings()

    # 1. Nếu có chỉ định rõ ràng từ tham số gọi hàm (True / False)
    if use_clip is not None:
        if use_clip:
            try:
                return CLIPFeatureExtractor(model_name=settings.clip_model_name)
            except Exception as e:
                logger.warning("Không thể khởi tạo CLIP: %s", e)
        return StandaloneFeatureExtractor(dim=settings.embedding_dim)

    # 2. Nếu biến môi trường bật CLIP
    if os.environ.get("IMAGE_SERVICE_USE_CLIP", "0") == "1" or os.environ.get("AUTOWISE_USE_CLIP", "0") == "1":
        try:
            return CLIPFeatureExtractor(model_name=settings.clip_model_name)
        except Exception as e:
            logger.warning("Không thể khởi tạo CLIP từ ENV: %s", e)

    # 3. Tự động kiểm tra model_info.json trong indexes_dir để tự khớp với vector index
    model_info_path = settings.indexes_dir / "model_info.json"
    if model_info_path.exists():
        try:
            import json
            with open(model_info_path, "r", encoding="utf-8") as f:
                info = json.load(f)
            model_name = info.get("model_name", "")
            if "clip" in model_name.lower():
                return CLIPFeatureExtractor(model_name=model_name or settings.clip_model_name)
        except Exception as e:
            logger.debug("Không đọc được model_info.json: %s", e)

    return StandaloneFeatureExtractor(dim=settings.embedding_dim)
