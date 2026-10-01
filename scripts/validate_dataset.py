#!/usr/bin/env python3
"""Fail fast when generated MVP data violates its core contracts."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"


def main() -> None:
    cars = json.loads((PROCESSED / "cars.json").read_text(encoding="utf-8"))
    assert len(cars) == 50, f"Expected 50 cars, got {len(cars)}"
    assert len({car["car_id"] for car in cars}) == 50, "Duplicate car_id"
    assert len({car["genmodel_id"] for car in cars}) == 50, "Duplicate genmodel_id"
    assert all(car["presence_source_id"] for car in cars), "Missing Vietnam presence source"

    sources = {
        json.loads(line)["source_id"]
        for line in (PROCESSED / "sources.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    unknown_sources = {car["presence_source_id"] for car in cars} - sources
    assert not unknown_sources, f"Unknown source IDs: {sorted(unknown_sources)}"

    with (PROCESSED / "images_manifest.csv").open(encoding="utf-8-sig", newline="") as handle:
        images = list(csv.DictReader(handle))
    broken = [image["image_path"] for image in images if not (ROOT / image["image_path"]).is_file()]
    assert not broken, f"Broken image paths: {broken[:5]}"
    image_counts = {}
    for image in images:
        image_counts[image["car_id"]] = image_counts.get(image["car_id"], 0) + 1
    for car in cars:
        count = image_counts.get(car["car_id"], 0)
        assert count == car["verified_image_count"], f"Image count mismatch for {car['car_id']}"
        if count < 5:
            assert "minimum_5_verified_images" in car["missing_fields"], f"Unflagged image shortage: {car['car_id']}"

    print(f"PASS: 50 unique cars, {len(images)} valid image paths, {len(sources)} sources.")


if __name__ == "__main__":
    main()
