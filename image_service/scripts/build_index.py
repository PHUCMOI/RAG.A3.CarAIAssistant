"""Build FAISS 512-dimensional vector index for car images.

Công việc B & C (Thành viên 3):
1. Đọc images_manifest.csv từ dataset/ hoặc data/.
2. Trích xuất embedding 512 chiều bằng CLIP (openai/clip-vit-base-patch32) hoặc Standalone Feature Extractor.
3. Chạy theo batch (mặc định 32 ảnh/lần) với torch.no_grad().
4. L2-normalize vector đảm bảo inner product = cosine similarity.
5. Cache incremental: bỏ qua các ảnh đã có embedding khi chạy lại.
6. Xây dựng FAISS IndexFlatIP và lưu ra:
   - image_service/indexes/image.index
   - image_service/indexes/image_embeddings.npy
   - image_service/indexes/image_meta.json
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
from PIL import Image

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from image_service.app.core.feature_extractor import BaseFeatureExtractor, get_feature_extractor
from image_service.app.core.vector_index import (
    CarImageVectorIndex,
    DEFAULT_EMBEDDINGS_PATH,
    DEFAULT_INDEX_PATH,
    DEFAULT_INDEXES_DIR,
    DEFAULT_META_PATH,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("build_image_index")

DEFAULT_MANIFEST_PATHS = [
    PROJECT_ROOT / "dataset" / "images_manifest.csv",
    PROJECT_ROOT / "data" / "images_manifest.csv",
    SERVICE_DIR / "data" / "images_manifest.csv",
]


def find_manifest() -> Path:
    for p in DEFAULT_MANIFEST_PATHS:
        if p.exists():
            return p
    raise FileNotFoundError("Không tìm thấy images_manifest.csv trong dataset/ hoặc data/")


def resolve_image_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute() and path.exists():
        return path
    candidate_1 = PROJECT_ROOT / path
    if candidate_1.exists():
        return candidate_1
    candidate_2 = PROJECT_ROOT / "dataset" / path
    if candidate_2.exists():
        return candidate_2
    candidate_3 = SERVICE_DIR / path
    if candidate_3.exists():
        return candidate_3
    return candidate_1


def load_manifest(manifest_path: Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with open(manifest_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            image_path_raw = (r.get("image_path") or r.get("path") or "").strip()
            car_id = (r.get("car_id") or "").strip()
            view_type = (r.get("view_type") or r.get("view") or "exterior").strip()
            split = (r.get("split") or "").strip()

            if not image_path_raw or not car_id:
                continue

            rows.append({
                "image_id": r.get("image_id", "").strip() or f"{car_id}_{len(rows)}",
                "car_id": car_id,
                "view_type": view_type,
                "split": split,
                "raw_path": image_path_raw,
            })
    return rows


def build_index(
    manifest_path: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    batch_size: int = 32,
    test_ratio: float = 0.2,
    force_rebuild: bool = False,
    use_clip: Optional[bool] = None,
) -> Tuple[int, int]:
    start_time = time.time()
    manifest_file = manifest_path or find_manifest()
    indexes_dir = output_dir or DEFAULT_INDEXES_DIR
    indexes_dir.mkdir(parents=True, exist_ok=True)

    index_file = indexes_dir / "image.index"
    embeddings_file = indexes_dir / "image_embeddings.npy"
    meta_file = indexes_dir / "image_meta.json"
    test_manifest_file = indexes_dir / "test_images_manifest.csv"

    logger.info("Đang đọc manifest: %s", manifest_file)
    all_rows = load_manifest(manifest_file)
    logger.info("Tổng số ảnh khai báo trong manifest: %d", len(all_rows))

    # Tách tập Index và tập Test
    index_rows: List[Dict[str, str]] = []
    test_rows: List[Dict[str, str]] = []

    cars_dict: Dict[str, List[Dict[str, str]]] = {}
    for r in all_rows:
        cars_dict.setdefault(r["car_id"], []).append(r)

    has_split_column = any(r.get("split") for r in all_rows)

    if has_split_column:
        for r in all_rows:
            if r.get("split", "").lower() == "test":
                test_rows.append(r)
            else:
                index_rows.append(r)
    else:
        for car_id, items in cars_dict.items():
            valid_items = [item for item in items if resolve_image_path(item["raw_path"]).exists()]
            if not valid_items:
                continue
            if len(valid_items) == 1:
                index_rows.append(valid_items[0])
            else:
                num_test = max(1, int(math.ceil(len(valid_items) * test_ratio)))
                if num_test >= len(valid_items):
                    num_test = len(valid_items) - 1
                for it in valid_items[:-num_test]:
                    it["split"] = "index"
                    index_rows.append(it)
                for it in valid_items[-num_test:]:
                    it["split"] = "test"
                    test_rows.append(it)

    with open(test_manifest_file, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["image_id", "car_id", "view_type", "split", "raw_path"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(test_rows)
    logger.info("Đã lưu %d ảnh kiểm thử độc lập ra %s", len(test_rows), test_manifest_file)

    logger.info("Tập ảnh đưa vào index: %d ảnh", len(index_rows))

    cached_meta: List[Dict[str, Any]] = []
    cached_embeddings: Optional[np.ndarray] = None
    existing_paths: Set[str] = set()

    if not force_rebuild and embeddings_file.exists() and meta_file.exists() and index_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                cached_meta = json.load(f)
            cached_embeddings = np.load(embeddings_file)
            if len(cached_meta) == cached_embeddings.shape[0]:
                for item in cached_meta:
                    existing_paths.add(item["image_path"])
                logger.info("Đã nạp cache gồm %d embeddings", len(cached_meta))
        except Exception as e:
            logger.warning("Không thể đọc cache: %s. Chạy rebuild toàn bộ.", e)
            cached_meta = []
            cached_embeddings = None
            existing_paths.clear()

    to_process: List[Dict[str, str]] = []
    for r in index_rows:
        if r["raw_path"] not in existing_paths:
            to_process.append(r)

    logger.info("Số ảnh mới cần sinh embedding: %d (đã có trong cache: %d)", len(to_process), len(existing_paths))

    extractor: BaseFeatureExtractor = get_feature_extractor(use_clip=use_clip)
    logger.info("Model trích xuất đặc trưng: %s", extractor.model_name)

    new_embeddings_list: List[np.ndarray] = []
    new_meta_list: List[Dict[str, Any]] = []
    error_count = 0

    for i in range(0, len(to_process), batch_size):
        chunk = to_process[i: i + batch_size]
        images_batch: List[Image.Image] = []
        valid_chunk_items: List[Dict[str, str]] = []

        for item in chunk:
            img_path = resolve_image_path(item["raw_path"])
            if not img_path.exists():
                logger.warning("Ảnh không tồn tại: %s", item["raw_path"])
                error_count += 1
                continue
            try:
                img = Image.open(img_path).convert("RGB")
                images_batch.append(img)
                valid_chunk_items.append(item)
            except Exception as e:
                logger.error("Lỗi đọc ảnh %s: %s", img_path, e)
                error_count += 1

        if not images_batch:
            continue

        try:
            vecs = extractor.extract_batch(images_batch)
            for j, item in enumerate(valid_chunk_items):
                new_embeddings_list.append(vecs[j])
                new_meta_list.append({
                    "image_id": item["image_id"],
                    "car_id": item["car_id"],
                    "view_type": item["view_type"],
                    "image_path": item["raw_path"],
                })
        except Exception as e:
            logger.error("Lỗi trích xuất batch %d-%d: %s", i, i + len(chunk), e)
            error_count += len(images_batch)

    if new_embeddings_list:
        new_embs = np.vstack(new_embeddings_list)
        if cached_embeddings is not None and len(cached_embeddings) > 0:
            final_embeddings = np.vstack([cached_embeddings, new_embs])
            final_meta = cached_meta + new_meta_list
        else:
            final_embeddings = new_embs
            final_meta = new_meta_list
    elif cached_embeddings is not None:
        final_embeddings = cached_embeddings
        final_meta = cached_meta
    else:
        raise RuntimeError("Không có embedding nào được sinh thành công!")

    # FAISS IndexFlatIP
    vec_index = CarImageVectorIndex(dimension=final_embeddings.shape[1], index_file=index_file)
    vec_index.build(final_embeddings, final_meta)
    vec_index.save(index_file=index_file, embeddings_file=embeddings_file, meta_file=meta_file)

    model_info_file = indexes_dir / "model_info.json"
    with open(model_info_file, "w", encoding="utf-8") as f:
        json.dump({
            "model_name": extractor.model_name,
            "dimension": final_embeddings.shape[1],
            "total_vectors": len(final_meta),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }, f, indent=2)

    elapsed = time.time() - start_time
    logger.info("=== HOÀN TẤT BUILD VECTOR INDEX ===")
    logger.info("Tổng số vector trong index: %d", len(final_meta))
    logger.info("Lỗi/bỏ qua: %d", error_count)
    logger.info("Thời gian thực thi: %.2f giây", elapsed)
    logger.info("Đã lưu FAISS index: %s", index_file)
    logger.info("Đã lưu Embeddings: %s", embeddings_file)
    logger.info("Đã lưu Meta mapping: %s", meta_file)

    return len(final_meta), error_count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sinh CLIP/Standalone embedding và xây dựng FAISS vector index")
    parser.add_argument("--manifest", type=str, default=None, help="Đường dẫn file images_manifest.csv")
    parser.add_argument("--output-dir", type=str, default=None, help="Thư mục lưu indexes/")
    parser.add_argument("--batch-size", type=int, default=32, help="Kích thước batch sinh embedding (default: 32)")
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Tỉ lệ ảnh tách làm tập kiểm thử (default: 0.2)")
    parser.add_argument("--force-rebuild", action="store_true", help="Bỏ qua cache, rebuild toàn bộ")
    parser.add_argument("--use-clip", action="store_true", help="Ưu tiên dùng OpenAI CLIP nếu có thư viện")
    args = parser.parse_args()

    manifest_p = Path(args.manifest) if args.manifest else None
    out_p = Path(args.output_dir) if args.output_dir else None

    build_index(
        manifest_path=manifest_p,
        output_dir=out_p,
        batch_size=args.batch_size,
        test_ratio=args.test_ratio,
        force_rebuild=args.force_rebuild,
        use_clip=args.use_clip if args.use_clip else None,
    )
