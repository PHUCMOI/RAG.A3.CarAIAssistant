"""Export 50-car catalog from database/seed.sql into image_service/data/cars.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

SEED_SQL = PROJECT_ROOT / "database" / "seed.sql"
DATA_DIR = SERVICE_DIR / "data"
DATASET_DIR = PROJECT_ROOT / "dataset"


def parse_sql_values(val_str: str) -> list[str]:
    """Parse comma-separated values in an SQL INSERT statement."""
    values = []
    current = []
    in_quote = False
    escape = False

    for char in val_str:
        if escape:
            current.append(char)
            escape = False
        elif char == "\\":
            escape = True
        elif char == "'":
            in_quote = not in_quote
            current.append(char)
        elif char == "," and not in_quote:
            values.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if current:
        values.append("".join(current).strip())
    return values


def clean_val(v: str):
    v = v.strip()
    if v.upper() == "NULL":
        return None
    if v.startswith("'") and v.endswith("'"):
        # unquote and replace escaped quotes
        inner = v[1:-1].replace("''", "'")
        return inner
    try:
        if "." in v:
            return float(v)
        return int(v)
    except ValueError:
        return v


def export_cars_json():
    if not SEED_SQL.exists():
        print(f"File {SEED_SQL} không tồn tại.")
        return

    text = SEED_SQL.read_text(encoding="utf-8")
    lines = text.splitlines()

    cars = []
    for line in lines:
        line = line.strip()
        if not line.startswith("INSERT INTO cars "):
            continue

        match = re.search(r"INSERT INTO cars \((.*?)\) VALUES \((.*?)\) ON CONFLICT", line)
        if not match:
            continue

        cols = [c.strip() for c in match.group(1).split(",")]
        raw_vals = parse_sql_values(match.group(2))
        vals = [clean_val(v) for v in raw_vals]

        car_dict = dict(zip(cols, vals))
        # Parse json fields if any
        if "aliases" in car_dict and isinstance(car_dict["aliases"], str):
            try:
                car_dict["aliases"] = json.loads(car_dict["aliases"])
            except Exception:
                car_dict["aliases"] = [car_dict["aliases"]]

        if "missing_fields" in car_dict and isinstance(car_dict["missing_fields"], str):
            try:
                car_dict["missing_fields"] = json.loads(car_dict["missing_fields"])
            except Exception:
                car_dict["missing_fields"] = []

        # Standardize brand and model names for member 3
        car_dict["brand"] = car_dict.get("brand_name")
        car_dict["model"] = car_dict.get("source_model_name")
        cars.append(car_dict)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_data = DATA_DIR / "cars.json"

    json_str = json.dumps(cars, ensure_ascii=False, indent=2)
    out_data.write_text(json_str, encoding="utf-8")

    # Also copy images_manifest.csv into image_service/data/ if not present
    manifest_src = DATASET_DIR / "images_manifest.csv"
    manifest_dst = DATA_DIR / "images_manifest.csv"
    if manifest_src.exists() and not manifest_dst.exists():
        manifest_dst.write_text(manifest_src.read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Successfully exported {len(cars)} cars to {out_data}")


if __name__ == "__main__":
    export_cars_json()
