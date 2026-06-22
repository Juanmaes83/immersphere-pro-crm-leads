-- Fase 8A: AuditRun persistence only. Append-only history table (every
-- POST inserts a new row; nothing here is ever UPDATEd in 8A). lead_key is
-- the stable, always-present identifier ('seed:30' for seed leads today);
-- lead_id is a nullable numeric convenience column, only populated for
-- seed leads. Future lead types (imported leads, once they have a stable
-- _persistentId) can use a different lead_key prefix without a migration.
CREATE TABLE IF NOT EXISTS crm_audit_runs (
  id                  BIGSERIAL PRIMARY KEY,
  lead_key            TEXT NOT NULL,
  lead_id             INTEGER NULL CHECK (lead_id IS NULL OR lead_id > 0),
  website             TEXT NOT NULL,
  audit_version       TEXT NOT NULL,
  status              TEXT NOT NULL,
  http_status         INTEGER,
  score               INTEGER,
  pages_reviewed      INTEGER,
  urls_reviewed       JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses          JSONB NOT NULL DEFAULT '[]'::jsonb,
  opportunities       JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_service TEXT,
  raw_audit           JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version      TEXT NOT NULL DEFAULT 'audit-run/1.0',
  source              TEXT NOT NULL DEFAULT 'crm',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_runs_lead_key_created
  ON crm_audit_runs (lead_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_runs_lead_id_created
  ON crm_audit_runs (lead_id, created_at DESC);
