-- Fail fast when a fresh database does not match the committed AutoWise dataset.
-- This script intentionally runs last during Docker first-time initialization.
BEGIN;

-- Normalize sequences after idempotent seed/upsert statements.
SELECT setval(
    pg_get_serial_sequence('dealers', 'dealer_id'),
    COALESCE((SELECT MAX(dealer_id) FROM dealers), 1),
    (SELECT COUNT(*) > 0 FROM dealers)
);

SELECT setval(
    pg_get_serial_sequence('warranties', 'warranty_id'),
    COALESCE((SELECT MAX(warranty_id) FROM warranties), 1),
    (SELECT COUNT(*) > 0 FROM warranties)
);

DO $$
DECLARE
    actual_count bigint;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'Required PostgreSQL extension "vector" is not installed';
    END IF;

    SELECT COUNT(*) INTO actual_count FROM cars;
    IF actual_count <> 50 THEN
        RAISE EXCEPTION 'Seed validation failed for cars: expected 50, found %', actual_count;
    END IF;

    SELECT COUNT(*) INTO actual_count FROM car_images;
    IF actual_count <> 215 THEN
        RAISE EXCEPTION 'Seed validation failed for car_images: expected 215, found %', actual_count;
    END IF;

    SELECT COUNT(*) INTO actual_count FROM dealers;
    IF actual_count <> 22 THEN
        RAISE EXCEPTION 'Seed validation failed for dealers: expected 22, found %', actual_count;
    END IF;

    SELECT COUNT(*) INTO actual_count FROM warranties;
    IF actual_count <> 9 THEN
        RAISE EXCEPTION 'Seed validation failed for warranties: expected 9, found %', actual_count;
    END IF;

    SELECT COUNT(*) INTO actual_count FROM sources;
    IF actual_count <> 61 THEN
        RAISE EXCEPTION 'Seed validation failed for sources: expected 61, found %', actual_count;
    END IF;

    SELECT COUNT(*) INTO actual_count FROM documents;
    IF actual_count <> 0 THEN
        RAISE EXCEPTION 'Fresh seed must leave documents empty for the RAG indexing job, found %', actual_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM cars
        WHERE description IS NULL OR btrim(description) = ''
    ) THEN
        RAISE EXCEPTION 'Every car must have an English description';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM cars
        WHERE price_vnd_from IS NULL OR price_source_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Every seeded car must have a VND price and price source';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM cars
        WHERE presence_source_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Every seeded car must have a Vietnam presence source';
    END IF;

    IF (SELECT COUNT(DISTINCT car_id) FROM car_images) <> 48 THEN
        RAISE EXCEPTION 'Expected image coverage for 48 cars';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM car_images
        WHERE image_path NOT LIKE 'dataset/images/%'
    ) THEN
        RAISE EXCEPTION 'Every image path must target the committed curated dataset';
    END IF;

    IF (SELECT COUNT(DISTINCT brand_name) FROM warranties WHERE car_id IS NULL) <> 9 THEN
        RAISE EXCEPTION 'Expected one brand-level warranty for each of the 9 brands';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM dealers
        WHERE address IS NULL
           OR btrim(address) = ''
           OR city IS NULL
           OR btrim(city) = ''
           OR phone IS NULL
           OR btrim(phone) = ''
           OR source_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Every seeded dealer must have address, city, phone and source';
    END IF;

    IF EXISTS (
        SELECT price_source_id FROM cars WHERE price_source_id IS NOT NULL
        EXCEPT
        SELECT source_id FROM sources
    ) OR EXISTS (
        SELECT presence_source_id FROM cars WHERE presence_source_id IS NOT NULL
        EXCEPT
        SELECT source_id FROM sources
    ) THEN
        RAISE EXCEPTION 'A car references a missing price or presence source';
    END IF;
END
$$;

COMMIT;
