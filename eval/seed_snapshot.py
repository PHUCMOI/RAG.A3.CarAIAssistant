"""Offline authoring fixture from committed SQL, not a PostgreSQL runtime substitute.

Only the repository's single-line INSERT/UPDATE data statements are replayed in
SQLite. PostgreSQL DDL/DO blocks and SQL semantics are covered by integration tests.
"""
import re
import sqlite3
from datetime import date
from pathlib import Path
from app.repositories.car_repository import map_car_row
from app.repositories.dealer_repository import map_dealer_row
from app.repositories.source_repository import map_source_row
from app.repositories.warranty_repository import map_warranty_row

ROOT = Path(__file__).resolve().parents[1]


def load_seed_snapshot():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    schema = (ROOT / "database/001_schema.sql").read_text(encoding="utf-8-sig")
    for table in re.findall(r"CREATE TABLE IF NOT EXISTS \w+ \([\s\S]*?\n\);", schema):
        table = re.sub(r"vector\(\d+\)", "text", table).replace("jsonb", "text").replace("bigserial", "integer")
        table = table.replace("::text", "").replace("now()", "CURRENT_TIMESTAMP")
        db.execute(table)
    for index in re.findall(r"CREATE UNIQUE INDEX IF NOT EXISTS [^;]+;", schema):
        db.execute(index)
    for name in ("seed.sql", "002_add_descriptions.sql", "003_enrich_missing_data.sql", "004_seed_dealers.sql"):
        for line in (ROOT / "database" / name).read_text(encoding="utf-8-sig").splitlines():
            if line.startswith(("INSERT INTO ", "UPDATE ")):
                db.execute(line.replace("::jsonb", ""))
    def rows(table):
        result = []
        for row in db.execute(f"SELECT * FROM {table}"):
            row = dict(row)
            for field in ("price_as_of", "checked_at"):
                if row.get(field):
                    row[field] = date.fromisoformat(row[field])
            result.append(row)
        return result
    try:
        return ([map_car_row(r) for r in rows("cars")], [map_warranty_row(r) for r in rows("warranties")],
                [map_dealer_row(r) for r in rows("dealers")], {r["source_id"]: map_source_row(r) for r in rows("sources")})
    finally:
        db.close()
