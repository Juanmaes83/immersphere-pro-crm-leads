-- Fase 8B: EnrichmentProfile persistence. Same shape as crm_audit_runs:
-- append-only history (every POST inserts a new row), lead_key always
-- present ('seed:<id>'), lead_id nullable convenience column.
CREATE TABLE IF NOT EXISTS crm_enrichment_profiles (
  id                      BIGSERIAL PRIMARY KEY,
  lead_key                TEXT NOT NULL,
  lead_id                 INTEGER NULL CHECK (lead_id IS NULL OR lead_id > 0),
  audit_run_id            BIGINT NULL,
  website                 TEXT,
  web_has_whatsapp        BOOLEAN,
  crm_has_whatsapp        BOOLEAN,
  whatsapp_links          JSONB NOT NULL DEFAULT '[]'::jsonb,
  emails                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  phones                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_links            JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_links             JSONB NOT NULL DEFAULT '[]'::jsonb,
  document_links          JSONB NOT NULL DEFAULT '[]'::jsonb,
  forms                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_pages           JSONB NOT NULL DEFAULT '[]'::jsonb,
  property_pages          JSONB NOT NULL DEFAULT '[]'::jsonb,
  pages_reviewed          INTEGER,
  page_discovery          JSONB NOT NULL DEFAULT '{}'::jsonb,
  logo_candidates         JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_candidates        JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_signals         JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings                JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence              TEXT,
  raw_enrichment_profile  JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version          TEXT NOT NULL DEFAULT 'enrichment-profile/1.0',
  source                  TEXT NOT NULL DEFAULT 'crm',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_enrichment_profiles_lead_key_created
  ON crm_enrichment_profiles (lead_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_enrichment_profiles_lead_id_created
  ON crm_enrichment_profiles (lead_id, created_at DESC);
