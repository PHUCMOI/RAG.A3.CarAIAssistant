"""Kiểm tra và xác thực dữ liệu ảnh xe (Thành viên 3)."""

from __future__ import annotations

import argparse
import csv
import json
import logging
from collections import defaultdict
from pathlib import Path
import sys
from typing import Any, Dict, List
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("validate_images")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[1]
SERVICE_ROOT = SCRIPT_DIR.parent

DEFAULT_MANIFESTS = [
    PROJECT_ROOT / "dataset" / "images_manifest.csv",
    PROJECT_ROOT / "data" / "images_manifest.csv",
    SERVICE_ROOT / "dataset" / "images_manifest.csv",
]
DEFAULT_INDEXES_DIR = SERVICE_ROOT / "indexes" if (SERVICE_ROOT / "indexes").exists() else PROJECT_ROOT / "indexes"
DEFAULT_CARS_JSON = SERVICE_ROOT / "data" / "cars.json" if (SERVICE_ROOT / "data" / "cars.json").exists() else PROJECT_ROOT / "data" / "cars.json"


def find_manifest() -> Path:
    for p in DEFAULT_MANIFESTS:
        if p.exists():
            return p
    raise FileNotFoundError("Không tìm thấy images_manifest.csv")


def resolve_image_path(raw_path: str) -> Path:
    p = Path(raw_path)
    if p.is_absolute() and p.exists():
        return p
    for root in [PROJECT_ROOT, SERVICE_ROOT]:
        if (root / p).exists():
            return root / p
        if (root / "dataset" / p).exists():
            return root / "dataset" / p
    return PROJECT_ROOT / p


def validate_image_file(image_path: Path, min_dimension: int = 50, min_bytes: int = 100) -> tuple[bool, str, tuple[int, int], str]:
    if not image_path.exists():
        return False, f"File không tồn tại: {image_path}", (0, 0), ""
    try:
        size_bytes = image_path.stat().st_size
        if size_bytes < min_bytes:
            return False, f"Kích thước file quá nhỏ ({size_bytes} bytes)", (0, 0), ""
        with Image.open(image_path) as img:
            img.verify()
        with Image.open(image_path) as img:
            img.load()
            w, h = img.size
            if w < min_dimension or h < min_dimension:
                return False, f"Độ phân giải quá nhỏ: {w}x{h}", (w, h), img.mode
            img.convert("RGB")
            return True, "", (w, h), img.mode
    except Exception as e:
        return False, f"Lỗi đọc ảnh: {type(e).__name__} - {str(e)}", (0, 0), ""


def run_validation(manifest_path: Path | None = None, indexes_dir: Path | None = None) -> Dict[str, Any]:
    manifest = manifest_path or find_manifest()
    out_dir = indexes_dir or DEFAULT_INDEXES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(manifest, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    errors: List[Dict[str, str]] = []
    valid_count = 0
    car_image_counts: Dict[str, int] = defaultdict(int)

    for row in rows:
        image_id = row.get("image_id", "").strip()
        car_id = row.get("car_id", "").strip()
        raw_path = row.get("image_path", "").strip()
        resolved_path = resolve_image_path(raw_path)

        is_valid, err_msg, _, _ = validate_image_file(resolved_path)
        if is_valid:
            valid_count += 1
            car_image_counts[car_id] += 1
        else:
            errors.append({
                "image_id": image_id,
                "car_id": car_id,
                "image_path": raw_path,
                "error_type": "Corrupted_Or_Missing",
                "error_detail": err_msg,
            })

    # Log errors
    errors_csv = out_dir / "image_errors.csv"
    with open(errors_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["image_id", "car_id", "image_path", "error_type", "error_detail"])
        writer.writeheader()
        writer.writerows(errors)

    # Stats
    stats_rows = []
    for c_id in sorted(car_image_counts.keys()):
        cnt = car_image_counts[c_id]
        status = "OK" if cnt >= 5 else "SHORTAGE (< 5)"
        stats_rows.append({"car_id": c_id, "image_count": cnt, "status": status})

    stats_csv = out_dir / "car_image_stats.csv"
    with open(stats_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["car_id", "image_count", "status"])
        writer.writeheader()
        writer.writerows(stats_rows)

    logger.info("Validation hoàn tất: %d/%d ảnh hợp lệ. Log: %s", valid_count, len(rows), errors_csv)
    return {"total": len(rows), "valid": valid_count, "errors": len(errors)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_INDEXES_DIR)
    args = parser.parse_args()
    run_validation(args.manifest, args.output_dir)
