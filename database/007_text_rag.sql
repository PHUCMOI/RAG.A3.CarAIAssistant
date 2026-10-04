-- Additive migration; safe for fresh and existing volumes. Never index during seed.
BEGIN;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_version text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_version text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
CREATE INDEX IF NOT EXISTS ix_documents_search_vector ON documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS ix_documents_section ON documents (section);
COMMIT;
