-- Fase 8D: ProductionPackage persistence. Append-only history, same
-- lead_key/lead_id pattern as the other tables. Never executes AURUM/Rubik
-- PRs - this table only stores the payload that would later feed them.
CREATE TABLE IF NOT EXISTS crm_production_packages (
  id                 BIGSERIAL PRIMARY KEY,
  lead_key           TEXT NOT NULL,
  lead_id            INTEGER NULL CHECK (lead_id IS NULL OR lead_id > 0),
  package_version    TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  stale              BOOLEAN NOT NULL DEFAULT false,
  validation_errors  JSONB NOT NULL DEFAULT '[]'::jsonb,
  hooks              JSONB NOT NULL DEFAULT '[]'::jsonb,
  routes             JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_repos       JSONB NOT NULL DEFAULT '{}'::jsonb,
  package_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  source             TEXT NOT NULL DEFAULT 'crm',
  schema_version     TEXT NOT NULL DEFAULT 'production-package/1.0',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_production_packages_lead_key_created
  ON crm_production_packages (lead_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_production_packages_lead_id_created
  ON crm_production_packages (lead_id, created_at DESC);
