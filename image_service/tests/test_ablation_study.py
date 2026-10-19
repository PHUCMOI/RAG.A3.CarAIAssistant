"""Ablation must measure every configuration against the same held-out images."""

import csv
import json
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from image_service.app.core.vector_index import CarImageVectorIndex
from image_service.scripts import run_ablation_study as study


def image(path, color):
    Image.new("RGB", (24, 24), color).save(path)
    return str(path)


class ColorExtractor:
    model_name = "test-color"
    device = "cpu"

    def __init__(self, **kwargs):
        pass

    def extract(self, img):
        return np.asarray(img, dtype=np.float32).mean(axis=(0, 1))

    def extract_batch(self, images):
        return np.stack([self.extract(img) for img in images])


def test_aggregation_recovers_car_hidden_by_duplicate_image_results(tmp_path):
    index = CarImageVectorIndex(dimension=3)
    index.build(
        np.array([[1, x, 0] for x in (.01, .02, .03, .04, .05, .06)], dtype=np.float32),
        [{"car_id": "other"}] * 5 + [{"car_id": "target"}],
    )
    retriever = SimpleNamespace(index=index, feature_extractor=ColorExtractor())
    samples = [{"image_id": "q", "car_id": "target", "raw_path": image(tmp_path / "q.png", "red")}]
    plain = study.evaluate_configuration(retriever, samples, use_aggregation=False)
    grouped = study.evaluate_configuration(retriever, samples, use_aggregation=True)
    assert plain["recall_at_5"] == 0
    assert grouped["recall_at_5"] == 100
    assert grouped["mrr"] == .5
    assert grouped["per_query"][0]["ranked_car_ids"] == ["other", "target"]


def test_missing_image_is_an_error_instead_of_a_silent_skip(tmp_path):
    samples = [{"car_id": "target", "raw_path": str(tmp_path / "missing.png")}]
    with pytest.raises(FileNotFoundError):
        study.evaluate_configuration(SimpleNamespace(), samples)


def test_empty_test_set_is_rejected():
    with pytest.raises(ValueError, match="empty"):
        study.evaluate_configuration(SimpleNamespace(), [])


def test_latency_includes_iteration_and_grouping_of_candidates(tmp_path, monkeypatch):
    clock = [0.0]

    class Candidates:
        def __iter__(self):
            clock[0] += .020
            yield {"car_id": "red"}, 1.0

    monkeypatch.setattr(study.time, "perf_counter", lambda: clock[0])
    retriever = SimpleNamespace(
        feature_extractor=ColorExtractor(),
        index=SimpleNamespace(search=lambda *args, **kwargs: Candidates()),
    )
    samples = [{"car_id": "red", "raw_path": image(tmp_path / "q.png", "red")}]
    result = study.evaluate_configuration(retriever, samples, use_aggregation=True)
    assert result["avg_latency_ms"] == 20


@pytest.fixture
def split(tmp_path):
    metadata = [
        {"image_id": "red", "car_id": "red", "image_path": image(tmp_path / "red.png", (255, 0, 0))},
        {"image_id": "blue", "car_id": "blue", "image_path": image(tmp_path / "blue.png", (0, 0, 255))},
    ]
    index_meta = tmp_path / "image_meta.json"
    index_meta.write_text(json.dumps(metadata), encoding="utf-8")
    test_manifest = tmp_path / "test.csv"
    with test_manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image_id", "car_id", "raw_path"])
        writer.writeheader()
        writer.writerows([
            {"image_id": "qr", "car_id": "red", "raw_path": image(tmp_path / "qr.png", (250, 1, 0))},
            {"image_id": "qb", "car_id": "blue", "raw_path": image(tmp_path / "qb.png", (0, 1, 250))},
        ])
    return index_meta, test_manifest


def test_full_run_measures_all_four_configs_and_saves_recomputable_evidence(tmp_path, monkeypatch, split):
    monkeypatch.setattr(study, "CLIPFeatureExtractor", ColorExtractor, raising=False)
    output = tmp_path / "run"
    results = study.run_full_ablation_study(
        index_meta_path=split[0], test_manifest_path=split[1], output_dir=output,
        batch_size=1, repeats=2,
    )
    assert len(results) == 4
    for config in results.values():
        assert config["recall_at_1"] == 100  # Derived from the images, never historical constants.
        assert config["total_test_samples"] == 2
        assert config["total_queries"] == 4
    details = list(csv.DictReader((output / "per_query_results.csv").open(encoding="utf-8-sig")))
    assert len(details) == 16
    assert {r["configuration"] for r in details} == set(results)
    for key, metrics in results.items():
        rows = [r for r in details if r["configuration"] == key]
        assert metrics["mrr"] == sum(float(r["reciprocal_rank"]) for r in rows) / len(rows)
        assert all(json.loads(r["ranked_car_ids"]) for r in rows)
    standalone = json.loads((output / "standalone" / "image_meta.json").read_text(encoding="utf-8"))
    clip = json.loads((output / "clip" / "image_meta.json").read_text(encoding="utf-8"))
    assert standalone == clip
    assert standalone[0]["image_sha256"]
    manifest = json.loads((output / "run_metadata.json").read_text(encoding="utf-8"))
    assert manifest["exact_hash_overlap"] == 0
    assert manifest["index_images"] == manifest["test_images"] == 2
    assert (output / "ablation_study_results.md").is_file()


def test_clip_load_failure_aborts_without_fallback_or_success_report(tmp_path, monkeypatch, split):
    def unavailable(**kwargs):
        raise RuntimeError("CLIP weights unavailable")
    monkeypatch.setattr(study, "CLIPFeatureExtractor", unavailable, raising=False)
    with pytest.raises(RuntimeError, match="CLIP weights unavailable"):
        study.run_full_ablation_study(
            index_meta_path=split[0], test_manifest_path=split[1], output_dir=tmp_path / "run",
        )
    assert not (tmp_path / "run" / "ablation_study_results.json").exists()


def test_overlap_is_rejected_by_content_even_with_another_filename(tmp_path, split):
    rows = list(csv.DictReader(split[1].open(encoding="utf-8")))
    source = tmp_path / "red.png"
    renamed = tmp_path / "renamed.png"
    renamed.write_bytes(source.read_bytes())
    rows[0]["raw_path"] = str(renamed)
    with split[1].open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(ValueError, match="overlap"):
        study.run_full_ablation_study(
            index_meta_path=split[0], test_manifest_path=split[1], output_dir=tmp_path / "run",
        )


def test_existing_output_directory_is_not_overwritten(tmp_path, split):
    with pytest.raises(FileExistsError):
        study.run_full_ablation_study(
            index_meta_path=split[0], test_manifest_path=split[1], output_dir=tmp_path,
        )
