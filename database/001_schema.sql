CREATE TABLE IF NOT EXISTS sources (
    source_id text PRIMARY KEY,
    title text NOT NULL,
    url text NOT NULL,
    source_type text NOT NULL,
    supports text,
    checked_at date NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
    car_id text PRIMARY KEY,
    genmodel_id text UNIQUE NOT NULL,
    brand_name text NOT NULL,
    source_model_name text NOT NULL,
    display_name text NOT NULL,
    description text NOT NULL,
    aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
    market_status_vn text NOT NULL,
    body_type text,
    fuel_type text,
    transmission text,
    seats integer CHECK (seats IS NULL OR seats > 0),
    engine text,
    engine_power_hp integer,
    length_mm integer,
    width_mm integer,
    height_mm integer,
    wheelbase_mm integer,
    price_vnd_from bigint CHECK (price_vnd_from IS NULL OR price_vnd_from >= 0),
    price_as_of date,
    price_source_id text REFERENCES sources(source_id) DEFERRABLE INITIALLY DEFERRED,
    warranty_months integer,
    warranty_distance_km integer,
    presence_source_id text REFERENCES sources(source_id) DEFERRABLE INITIALLY DEFERRED,
    missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    image_count integer NOT NULL DEFAULT 0,
    updated_at date NOT NULL
);

CREATE TABLE IF NOT EXISTS car_images (
    image_id text PRIMARY KEY,
    car_id text NOT NULL REFERENCES cars(car_id) ON DELETE CASCADE,
    image_path text NOT NULL,
    view_type text,
    image_embedding vector(512)
);

CREATE TABLE IF NOT EXISTS dealers (
    dealer_id bigserial PRIMARY KEY,
    name text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    phone text,
    website text,
    supported_brands jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_id text REFERENCES sources(source_id) DEFERRABLE INITIALLY DEFERRED,
    checked_at date NOT NULL
);

CREATE TABLE IF NOT EXISTS warranties (
    warranty_id bigserial PRIMARY KEY,
    car_id text REFERENCES cars(car_id) ON DELETE CASCADE,
    brand_name text,
    duration_months integer,
    distance_limit_km integer,
    conditions text,
    source_id text REFERENCES sources(source_id),
    CHECK (car_id IS NOT NULL OR brand_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS documents (
    document_id text PRIMARY KEY,
    car_id text REFERENCES cars(car_id) ON DELETE CASCADE,
    section text NOT NULL,
    content text NOT NULL,
    source_id text REFERENCES sources(source_id),
    text_embedding vector(768),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cars_brand ON cars (brand_name);
CREATE INDEX IF NOT EXISTS ix_cars_filters ON cars (body_type, seats, fuel_type, price_vnd_from);
CREATE INDEX IF NOT EXISTS ix_cars_name_search ON cars USING gin (to_tsvector('simple', display_name || ' ' || source_model_name));
CREATE INDEX IF NOT EXISTS ix_images_car ON car_images (car_id);
CREATE INDEX IF NOT EXISTS ix_documents_car_section ON documents (car_id, section);
CREATE UNIQUE INDEX IF NOT EXISTS ux_dealers_name_address ON dealers (name, address);
CREATE UNIQUE INDEX IF NOT EXISTS ux_dealers_name ON dealers (name);
CREATE INDEX IF NOT EXISTS ix_dealers_city ON dealers (city);

