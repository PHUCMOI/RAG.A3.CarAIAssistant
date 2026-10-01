-- Point database image records at the compact dataset committed with the project.
-- Safe to run repeatedly: the resulting path is deterministic for each image row.
BEGIN;

UPDATE car_images
SET image_path =
    'dataset/images/' || car_id || '/' || regexp_replace(image_path, '^.*/', '')
WHERE image_path IS DISTINCT FROM
    'dataset/images/' || car_id || '/' || regexp_replace(image_path, '^.*/', '');

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM car_images) <> 215 THEN
        RAISE EXCEPTION 'Expected 215 car_images rows before path migration, found %',
            (SELECT COUNT(*) FROM car_images);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM car_images
        WHERE image_path NOT LIKE 'dataset/images/%'
    ) THEN
        RAISE EXCEPTION 'One or more image paths do not use the curated dataset directory';
    END IF;
END
$$;

COMMIT;
