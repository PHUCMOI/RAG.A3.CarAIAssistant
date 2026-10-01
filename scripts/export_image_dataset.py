"""Export only the images selected for the 50-car AutoWise dataset."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data" / "processed" / "images_manifest.csv"
DEFAULT_CARS = ROOT / "data" / "processed" / "cars.json"
DEFAULT_OUTPUT = ROOT / "dataset"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy the selected image subset into a compact external dataset."
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--cars", type=Path, default=DEFAULT_CARS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    cars_path = args.cars.resolve()
    output = args.output.resolve()

    if output.exists() and any(output.iterdir()):
        raise SystemExit(
            f"Output directory is not empty: {output}. Move or empty it before exporting."
        )

    cars = json.loads(cars_path.read_text(encoding="utf-8-sig"))
    manifest = load_csv(manifest_path)
    car_by_id = {car["car_id"]: car for car in cars}

    if len(cars) != 50 or len(car_by_id) != 50:
        raise SystemExit(f"Expected 50 unique cars, found {len(car_by_id)}.")

    image_ids = [row["image_id"] for row in manifest]
    duplicates = [image_id for image_id, count in Counter(image_ids).items() if count > 1]
    if duplicates:
        raise SystemExit(f"Duplicate image IDs: {', '.join(duplicates[:10])}")

    unknown_car_ids = sorted({row["car_id"] for row in manifest} - set(car_by_id))
    if unknown_car_ids:
        raise SystemExit(f"Manifest contains unknown car IDs: {', '.join(unknown_car_ids)}")

    output.mkdir(parents=True, exist_ok=True)
    images_root = output / "images"
    images_root.mkdir()

    for car_id in sorted(car_by_id):
        (images_root / car_id).mkdir()

    exported_rows: list[dict[str, object]] = []
    image_counts: Counter[str] = Counter()

    for row in manifest:
        source = (ROOT / Path(row["image_path"])).resolve()
        if not source.is_file():
            raise SystemExit(f"Missing source image: {source}")

        car_id = row["car_id"]
        destination = images_root / car_id / source.name
        if destination.exists():
            raise SystemExit(f"Destination collision: {destination}")

        shutil.copy2(source, destination)
        image_counts[car_id] += 1
        exported_rows.append(
            {
                "image_id": row["image_id"],
                "car_id": car_id,
                "genmodel_id": row["genmodel_id"],
                "image_path": destination.relative_to(output).as_posix(),
                "view_type": row["view_type"],
                "source_image_path": row["image_path"],
            }
        )

    summary_rows: list[dict[str, object]] = []
    missing_rows: list[dict[str, object]] = []
    for car_id, car in sorted(car_by_id.items()):
        count = image_counts[car_id]
        summary = {
            "car_id": car_id,
            "genmodel_id": car["genmodel_id"],
            "brand": car["brand"],
            "display_name": car["display_name"],
            "image_count": count,
        }
        summary_rows.append(summary)
        if count == 0:
            missing_rows.append(
                {
                    **summary,
                    "reason": "No matching image exists in the provided source corpus.",
                }
            )

    write_csv(
        output / "images_manifest.csv",
        [
            "image_id",
            "car_id",
            "genmodel_id",
            "image_path",
            "view_type",
            "source_image_path",
        ],
        exported_rows,
    )
    write_csv(
        output / "car_image_summary.csv",
        ["car_id", "genmodel_id", "brand", "display_name", "image_count"],
        summary_rows,
    )
    write_csv(
        output / "missing_images.csv",
        ["car_id", "genmodel_id", "brand", "display_name", "image_count", "reason"],
        missing_rows,
    )

    metadata = {
        "car_count": len(cars),
        "cars_with_images": len(cars) - len(missing_rows),
        "cars_without_images": len(missing_rows),
        "image_count": len(exported_rows),
        "layout": "images/{car_id}/{original_filename}",
    }
    (output / "dataset_info.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    print(f"Exported dataset: {output}")


if __name__ == "__main__":
    main()
