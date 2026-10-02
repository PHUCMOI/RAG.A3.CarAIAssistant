"""Evaluate Image Retrieval metrics for AutoWise (Thành viên 3 & TV4).

Công việc H:
1. Đọc tập ảnh test tách biệt từ image_service/indexes/test_images_manifest.csv.
2. Với mỗi ảnh test (ground truth car_id):
   - Truy vấn qua ImageRetriever.search(img_path, top_k=5).
   - Kiểm tra car_id đúng có nằm trong top-1, top-3, top-5 hay không.
3. Tính các chỉ số:
   - Image Recall@1
   - Image Recall@3
   - Image Recall@5
   - Mean Reciprocal Rank (MRR)
   - Average Latency (ms)
4. Phân tích các cặp xe hay bị nhầm lẫn (confusion pairs) để làm "trường hợp lỗi tiêu biểu" cho báo cáo.
5. Hiệu chỉnh và khuyến nghị ngưỡng confidence (high/medium/low).
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from image_service.app.core.image_retriever import ImageRetriever
from image_service.app.core.vector_index import get_image_index

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("evaluate_images")

TEST_MANIFEST_PATH = SERVICE_DIR / "indexes" / "test_images_manifest.csv"
EVAL_RESULTS_CSV = SERVICE_DIR / "indexes" / "image_evaluation_results.csv"
CONFUSION_REPORT_JSON = SERVICE_DIR / "indexes" / "image_confusion_analysis.json"


def resolve_image_path(raw_path: str) -> Path:
    p = Path(raw_path)
    if p.is_absolute() and p.exists():
        return p
    c1 = PROJECT_ROOT / p
    if c1.exists():
        return c1
    c2 = PROJECT_ROOT / "dataset" / p
    if c2.exists():
        return c2
    c3 = SERVICE_DIR / p
    if c3.exists():
        return c3
    return c1


def evaluate(
    test_manifest_path: Path = TEST_MANIFEST_PATH,
    top_k: int = 5,
    save_results: bool = True,
    use_clip: Optional[bool] = None,
) -> Dict[str, Any]:
    if not test_manifest_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file manifest ảnh test tại: {test_manifest_path}")

    # Khởi tạo retriever
    retriever = ImageRetriever(use_clip=use_clip)
    index = get_image_index()
    logger.info("Đã nạp index với %d vector", index.total_vectors)

    test_samples: List[Dict[str, str]] = []
    with open(test_manifest_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            test_samples.append({
                "image_id": r.get("image_id", ""),
                "car_id": r.get("car_id", ""),
                "view_type": r.get("view_type", ""),
                "raw_path": r.get("raw_path") or r.get("image_path", ""),
            })

    total_samples = len(test_samples)
    logger.info("Bắt đầu đánh giá trên %d ảnh test...", total_samples)

    hits_at_1 = 0
    hits_at_3 = 0
    hits_at_5 = 0
    reciprocal_ranks = []
    latencies = []

    confusion_pairs = Counter()
    per_query_results = []

    for idx, sample in enumerate(test_samples, 1):
        gt_car_id = sample["car_id"]
        img_path = resolve_image_path(sample["raw_path"])

        if not img_path.exists():
            logger.warning("[%d/%d] Ảnh test không tồn tại: %s", idx, total_samples, img_path)
            continue

        try:
            start_t = time.perf_counter()
            response = retriever.search(image_input=img_path, top_k=top_k)
            latency = (time.perf_counter() - start_t) * 1000.0
            latencies.append(latency)

            results = response["results"]
            retrieved_car_ids = [r["car_id"] for r in results]

            rank = -1
            if gt_car_id in retrieved_car_ids:
                rank = retrieved_car_ids.index(gt_car_id) + 1

            if rank == 1:
                hits_at_1 += 1
            if 1 <= rank <= 3:
                hits_at_3 += 1
            if 1 <= rank <= 5:
                hits_at_5 += 1

            rr = 1.0 / rank if rank > 0 else 0.0
            reciprocal_ranks.append(rr)

            top1_id = retrieved_car_ids[0] if retrieved_car_ids else "NONE"
            top1_sim = results[0]["similarity"] if results else 0.0

            if top1_id != gt_car_id and top1_id != "NONE":
                confusion_pairs[(gt_car_id, top1_id)] += 1

            per_query_results.append({
                "image_id": sample["image_id"],
                "ground_truth_car_id": gt_car_id,
                "predicted_top1_car_id": top1_id,
                "top1_similarity": top1_sim,
                "confidence": response["confidence"],
                "margin": response["margin"],
                "uncertain": response["uncertain"],
                "is_hit_at_1": rank == 1,
                "is_hit_at_3": 1 <= rank <= 3,
                "is_hit_at_5": 1 <= rank <= 5,
                "rank": rank if rank > 0 else "Not found in top 5",
                "latency_ms": round(latency, 2),
            })

        except Exception as e:
            logger.error("Lỗi đánh giá ảnh %s: %s", img_path, e)

    valid_count = len(per_query_results)
    if valid_count == 0:
        logger.error("Không có ảnh nào được đánh giá thành công!")
        return {}

    recall_at_1 = hits_at_1 / valid_count
    recall_at_3 = hits_at_3 / valid_count
    recall_at_5 = hits_at_5 / valid_count
    mrr = sum(reciprocal_ranks) / valid_count
    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

    print("\n" + "=" * 55)
    print("        KẾT QUẢ ĐÁNH GIÁ IMAGE RETRIEVAL")
    print("=" * 55)
    print(f"Tổng số ảnh kiểm thử:        {valid_count} ảnh")
    print(f"Image Recall@1:              {recall_at_1:.2%} ({hits_at_1}/{valid_count})")
    print(f"Image Recall@3:              {recall_at_3:.2%} ({hits_at_3}/{valid_count})")
    print(f"Image Recall@5:              {recall_at_5:.2%} ({hits_at_5}/{valid_count})")
    print(f"MRR (Mean Reciprocal Rank):  {mrr:.4f}")
    print(f"Độ trễ trung bình (Latency): {avg_latency:.2f} ms")
    print("=" * 55)

    print("\n[3 Trường hợp lỗi tiêu biểu / Confusion Pairs (gửi cho TV4)]:")
    top_confusions = confusion_pairs.most_common(5)
    if not top_confusions:
        print("  Không phát hiện lỗi nhầm lẫn nào (Recall@1 = 100%).")
    else:
        for idx, ((true_id, pred_id), count) in enumerate(top_confusions[:3], 1):
            print(f"  {idx}. Xe thực tế: {true_id}  -->  Dự đoán nhầm thành: {pred_id} (Số lần: {count})")

    summary = {
        "valid_count": valid_count,
        "recall_at_1": round(recall_at_1, 4),
        "recall_at_3": round(recall_at_3, 4),
        "recall_at_5": round(recall_at_5, 4),
        "mrr": round(mrr, 4),
        "avg_latency_ms": round(avg_latency, 2),
        "top_confusion_pairs": [
            {"ground_truth": t, "predicted": p, "count": c}
            for (t, p), c in top_confusions
        ],
    }

    if save_results:
        with open(EVAL_RESULTS_CSV, "w", encoding="utf-8", newline="") as f:
            if per_query_results:
                writer = csv.DictWriter(f, fieldnames=list(per_query_results[0].keys()))
                writer.writeheader()
                writer.writerows(per_query_results)
        logger.info("Đã lưu chi tiết đánh giá ra %s", EVAL_RESULTS_CSV)

        with open(CONFUSION_REPORT_JSON, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        logger.info("Đã lưu báo cáo nhầm lẫn ra %s", CONFUSION_REPORT_JSON)

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Đánh giá Recall@1, 3, 5 cho Image Retrieval")
    parser.add_argument("--test-manifest", type=str, default=str(TEST_MANIFEST_PATH))
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--use-clip", action="store_true", help="Sử dụng mô hình CLIP thay cho Standalone")
    parser.add_argument("--no-save", action="store_true")
    args = parser.parse_args()

    evaluate(
        test_manifest_path=Path(args.test_manifest),
        top_k=args.top_k,
        save_results=not args.no_save,
        use_clip=args.use_clip if args.use_clip else None,
    )
