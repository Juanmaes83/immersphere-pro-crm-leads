-- Fase 8C: ApprovedMediaAssets persistence. Append-only history, same
-- lead_key/lead_id pattern as the other tables.
CREATE TABLE IF NOT EXISTS crm_approved_media_assets (
  id               BIGSERIAL PRIMARY KEY,
  lead_key         TEXT NOT NULL,
  lead_id          INTEGER NULL CHECK (lead_id IS NULL OR lead_id > 0),
  logo_url         TEXT,
  hero_url         TEXT,
  image_urls       JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_assets  JSONB NOT NULL DEFAULT '{}'::jsonb,
  assets_approved  BOOLEAN NOT NULL DEFAULT false,
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT,
  source           TEXT NOT NULL DEFAULT 'crm',
  schema_version   TEXT NOT NULL DEFAULT 'approved-media-assets/1.0',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_approved_media_assets_lead_key_created
  ON crm_approved_media_assets (lead_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_approved_media_assets_lead_id_created
  ON crm_approved_media_assets (lead_id, created_at DESC);
