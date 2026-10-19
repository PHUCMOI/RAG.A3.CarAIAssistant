"""Measure all four image-retrieval ablations on a frozen index/test split.

Run from the repository root:
    python -m image_service.scripts.run_ablation_study --repeats 3

Each run rebuilds independent Standalone/CLIP indexes and writes its own evidence
directory. Historical reports and the serving index are never overwritten.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
from importlib.metadata import PackageNotFoundError, version
import json
import logging
from pathlib import Path
import platform
import subprocess
import sys
import time
from types import SimpleNamespace

import numpy as np
from PIL import Image, ImageOps

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SERVICE_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from image_service.app.core.feature_extractor import CLIPFeatureExtractor, StandaloneFeatureExtractor
from image_service.app.core.vector_index import CarImageVectorIndex, HAS_FAISS
from image_service.scripts.build_index import resolve_image_path

logger = logging.getLogger("ablation_study")
TEST_MANIFEST_PATH = SERVICE_DIR / "indexes" / "test_images_manifest.csv"
INDEX_META_PATH = SERVICE_DIR / "indexes" / "image_meta.json"
CLIP_MODEL = "openai/clip-vit-base-patch32"
CONFIGURATIONS = (
    ("A_baseline_standalone_no_agg", "standalone", False),
    ("B_standalone_with_agg", "standalone", True),
    ("C_clip_no_agg", "clip", False),
    ("D_clip_with_agg_proposed", "clip", True),
)


def open_image(path):
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def load_split(index_meta_path, test_manifest_path):
    """Freeze the serving index's image list, not its previously computed vectors."""
    index_samples = json.loads(index_meta_path.read_text(encoding="utf-8"))
    with test_manifest_path.open(encoding="utf-8-sig", newline="") as handle:
        test_samples = [dict(row, raw_path=row.get("raw_path") or row.get("image_path"))
                        for row in csv.DictReader(handle)]
    if not index_samples or not test_samples:
        raise ValueError("Index and test splits must not be empty")
    for samples, path_key in ((index_samples, "image_path"), (test_samples, "raw_path")):
        for row in samples:
            if not row.get("car_id") or not row.get(path_key):
                raise ValueError("Every image must have car_id and a path")
            path = resolve_image_path(row[path_key])
            if not path.is_file():
                raise FileNotFoundError(path)
            row["image_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            open_image(path).close()
    index_hashes = {r["image_sha256"] for r in index_samples}
    test_hashes = [r["image_sha256"] for r in test_samples]
    if index_hashes.intersection(test_hashes):
        raise ValueError("Index/test content hash overlap detected")
    if len(set(test_hashes)) != len(test_hashes):
        raise ValueError("Duplicate test image content detected")
    if {r["car_id"] for r in test_samples} - {r["car_id"] for r in index_samples}:
        raise ValueError("A test car has no indexed image")
    return index_samples, test_samples


def build_experiment_index(extractor, samples, output_dir, batch_size):
    """Build from exactly the same images for each extractor; no incremental cache."""
    output_dir.mkdir()
    vectors = []
    for start in range(0, len(samples), batch_size):
        images = [open_image(resolve_image_path(r["image_path"]))
                  for r in samples[start:start + batch_size]]
        try:
            batch = np.asarray(extractor.extract_batch(images), dtype=np.float32)
            if (batch.ndim != 2 or len(batch) != len(images)
                    or not np.isfinite(batch).all() or np.any(np.linalg.norm(batch, axis=1) == 0)):
                raise ValueError("Extractor returned invalid or incomplete index vectors")
            vectors.append(batch)
        finally:
            for img in images:
                img.close()
    embeddings = np.vstack(vectors)
    index = CarImageVectorIndex(dimension=embeddings.shape[1])
    index.build(embeddings, samples)
    index.save(index_path=output_dir / "image.index",
               embeddings_path=output_dir / "image_embeddings.npy",
               meta_path=output_dir / "image_meta.json")
    info = dict(model_name=extractor.model_name, dimension=embeddings.shape[1],
                total_vectors=index.size(), device=getattr(extractor, "device", "cpu"),
                model_revision=getattr(getattr(getattr(extractor, "model", None), "config", None),
                                       "_commit_hash", None))
    (output_dir / "model_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return index


def evaluate_configuration(retriever, test_samples, use_aggregation=True,
                           top_k=5, candidate_pool=30, repeats=1):
    if not test_samples:
        raise ValueError("Test split must not be empty")
    if top_k != 5 or candidate_pool < top_k or repeats < 1:
        raise ValueError("Expected top_k=5, candidate_pool>=5 and repeats>=1")
    rows = []
    for repeat in range(1, repeats + 1):
        for sample in test_samples:
            path = resolve_image_path(sample["raw_path"])
            if not path.is_file():
                raise FileNotFoundError(path)
            started = time.perf_counter()
            with open_image(path) as img:
                vector = retriever.feature_extractor.extract(img)
            candidates = retriever.index.search(vector, top_k=candidate_pool)
            if use_aggregation:
                scores = {}
                for meta, score in candidates:
                    cid = meta["car_id"]
                    scores[cid] = max(scores.get(cid, float("-inf")), score)
                ranked = sorted(scores, key=scores.get, reverse=True)[:top_k]
            else:
                ranked = [meta["car_id"] for meta, _ in candidates[:top_k]]
            # Includes image loading, EXIF/RGB conversion, embedding, search AND ranking.
            latency_ms = (time.perf_counter() - started) * 1000
            rank = ranked.index(sample["car_id"]) + 1 if sample["car_id"] in ranked else None
            rows.append(dict(
                image_id=sample.get("image_id", ""), raw_path=sample["raw_path"],
                image_sha256=sample.get("image_sha256", ""), ground_truth_car_id=sample["car_id"],
                repeat=repeat, ranked_car_ids=ranked, rank=rank,
                hit_at_1=int(rank == 1), hit_at_3=int(rank is not None and rank <= 3),
                hit_at_5=int(rank is not None and rank <= 5),
                reciprocal_rank=1 / rank if rank else 0, latency_ms=latency_ms,
            ))
    count = len(rows)
    return dict(
        total_test_samples=len(test_samples), total_queries=count,
        recall_at_1=round(sum(r["hit_at_1"] for r in rows) / count * 100, 2),
        recall_at_3=round(sum(r["hit_at_3"] for r in rows) / count * 100, 2),
        recall_at_5=round(sum(r["hit_at_5"] for r in rows) / count * 100, 2),
        mrr=round(sum(r["reciprocal_rank"] for r in rows) / count, 4),
        avg_latency_ms=round(float(np.mean([r["latency_ms"] for r in rows])), 2),
        p95_latency_ms=round(float(np.percentile([r["latency_ms"] for r in rows], 95)), 2),
        per_query=rows,
    )


def write_reports(output_dir, results, rows, metadata):
    with (output_dir / "per_query_results.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(dict(row, ranked_car_ids=json.dumps(row["ranked_car_ids"])) for row in rows)
    lines = [
        "# Ablation A/B/C/D — Image Retrieval", "",
        f"- Thời gian UTC: {metadata['started_at']}",
        f"- Cùng {metadata['index_images']} ảnh index và {metadata['test_images']} ảnh test cho cả bốn cấu hình.",
        f"- Repeats: {metadata['repeats']}; candidate pool: {metadata['candidate_pool']}; top-k: 5.",
        f"- Search backend: {metadata['search_backend']}; kiểm tra SHA256: không trùng nội dung index/test.",
        "- Mỗi extractor warm-up một query trước khi đo; không tính model loading/index build.",
        "- Latency gồm đọc ảnh, EXIF/RGB, embedding, search và gom nhóm/xếp hạng; không phải latency chat HTTP.",
        "", "| Config | Extractor thực tế | Gom theo xe | R@1 (%) | R@3 (%) | R@5 (%) | MRR@5 | Mean ms | P95 ms |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for key, result in results.items():
        lines.append(f"| {key[0]} | {result['feature_extractor']} | {result['aggregation']} | "
                     f"{result['recall_at_1']:.2f} | {result['recall_at_3']:.2f} | "
                     f"{result['recall_at_5']:.2f} | {result['mrr']:.4f} | "
                     f"{result['avg_latency_ms']:.2f} | {result['p95_latency_ms']:.2f} |")
    lines += ["", "## Chênh lệch đo được", ""]
    keys = list(results)
    for before, after, label in ((0, 1, "Gom nhóm trên Standalone (A → B)"),
                                 (2, 3, "Gom nhóm trên CLIP (C → D)"),
                                 (0, 2, "Thay extractor, không gom nhóm (A → C)"),
                                 (1, 3, "Thay extractor, có gom nhóm (B → D)"),
                                 (0, 3, "Tổng thể (A → D)")):
        a, b = results[keys[before]], results[keys[after]]
        lines.append(f"- {label}: ΔR@5 = {b['recall_at_5'] - a['recall_at_5']:+.2f} điểm phần trăm; "
                     f"ΔMRR@5 = {b['mrr'] - a['mrr']:+.4f}.")
    lines += ["", "## Phạm vi bằng chứng", "",
              "Các số liệu được tính từ per_query_results.csv; không dùng hằng số baseline.",
              "Repeats đo lại cùng ảnh, không làm tăng số mẫu độc lập. Chênh lệch có thể bằng 0 hoặc âm.",
              "Đây là đánh giá retrieval trên split đã chọn; chưa chứng minh ý nghĩa thống kê,",
              "khả năng tổng quát hóa, chất lượng câu trả lời RAG hoặc thời gian phản hồi toàn hệ thống.",
              "Kiểm tra hash chỉ loại trùng nội dung byte, không loại ảnh gần giống hoặc cùng chiếc xe.", ""]
    (output_dir / "ablation_study_results.md").write_text("\n".join(lines), encoding="utf-8")
    (output_dir / "run_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    # Publish the success summary only after every configuration and detail export succeeds.
    (output_dir / "ablation_study_results.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")


def run_full_ablation_study(index_meta_path=INDEX_META_PATH, test_manifest_path=TEST_MANIFEST_PATH,
                            output_dir=None, batch_size=16, repeats=1, candidate_pool=30):
    if batch_size < 1 or repeats < 1 or candidate_pool < 5:
        raise ValueError("Expected batch_size>=1, repeats>=1 and candidate_pool>=5")
    index_meta_path, test_manifest_path = Path(index_meta_path), Path(test_manifest_path)
    index_samples, test_samples = load_split(index_meta_path, test_manifest_path)
    now = datetime.now(timezone.utc)
    output_dir = Path(output_dir) if output_dir else (
        SERVICE_DIR / "indexes" / "ablation_real" / now.strftime("%Y%m%dT%H%M%S%fZ"))
    output_dir.mkdir(parents=True, exist_ok=False)
    metadata = dict(started_at=now.isoformat(), index_images=len(index_samples),
                    test_images=len(test_samples), exact_hash_overlap=0, repeats=repeats,
                    candidate_pool=candidate_pool, top_k=5, batch_size=batch_size,
                    search_backend="faiss" if HAS_FAISS else "numpy", python=platform.python_version(),
                    index_meta_sha256=hashlib.sha256(index_meta_path.read_bytes()).hexdigest(),
                    test_manifest_sha256=hashlib.sha256(test_manifest_path.read_bytes()).hexdigest(),
                    runner_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), packages={})
    try:
        metadata["git_commit"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        metadata["git_commit"] = None
    for package in ("numpy", "Pillow", "torch", "transformers", "faiss-cpu"):
        try:
            metadata["packages"][package] = version(package)
        except PackageNotFoundError:
            metadata["packages"][package] = None
    (output_dir / "split.json").write_text(
        json.dumps(dict(index=index_samples, test=test_samples), indent=2, ensure_ascii=False), encoding="utf-8")
    results, details = {}, []
    for family, factory in (("standalone", StandaloneFeatureExtractor), ("clip", CLIPFeatureExtractor)):
        logger.info("Building %s index from %d frozen images", family, len(index_samples))
        # Direct construction is intentional: CLIP load errors must abort, never fallback.
        extractor = factory(**({"model_name": CLIP_MODEL} if family == "clip" else {}))
        index = build_experiment_index(extractor, index_samples, output_dir / family, batch_size)
        retriever = SimpleNamespace(index=index, feature_extractor=extractor)
        with open_image(resolve_image_path(test_samples[0]["raw_path"])) as img:
            index.search(extractor.extract(img), top_k=candidate_pool)
        for key, config_family, aggregate in CONFIGURATIONS:
            if config_family != family:
                continue
            logger.info("Measuring %s (%d images x %d repeats)", key, len(test_samples), repeats)
            measured = evaluate_configuration(retriever, test_samples, use_aggregation=aggregate,
                                               candidate_pool=candidate_pool, repeats=repeats)
            query_rows = measured.pop("per_query")
            details.extend(dict(configuration=key, **row) for row in query_rows)
            results[key] = dict(feature_extractor=extractor.model_name, aggregation=aggregate, **measured)
        del retriever, index, extractor
    metadata["completed_at"] = datetime.now(timezone.utc).isoformat()
    write_reports(output_dir, results, details, metadata)
    for key, metrics in results.items():
        print(f"{key}: R@5={metrics['recall_at_5']:.2f}%, MRR@5={metrics['mrr']:.4f}, "
              f"mean={metrics['avg_latency_ms']:.2f} ms")
    print(f"Evidence directory: {output_dir.resolve()}")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index-meta", type=Path, default=INDEX_META_PATH,
                        help="Frozen index image list; existing vectors are NOT reused")
    parser.add_argument("--test-manifest", type=Path, default=TEST_MANIFEST_PATH)
    parser.add_argument("--output-dir", type=Path, help="A NEW directory; default: timestamped ablation_real run")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--candidate-pool", type=int, default=30)
    parser.add_argument("--repeats", type=int, default=1)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    run_full_ablation_study(index_meta_path=args.index_meta, test_manifest_path=args.test_manifest,
                            output_dir=args.output_dir, batch_size=args.batch_size,
                            candidate_pool=args.candidate_pool, repeats=args.repeats)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
