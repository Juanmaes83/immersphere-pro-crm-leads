-- Fase 9: ProductionJob persistence. Tracks G1-G4 hook auto-generation
-- pipeline jobs with full lifecycle (queued → generating → pr_created →
-- merged → live). UUID primary key, idempotency_key UNIQUE constraint
-- prevents duplicate jobs for the same logical operation.
CREATE TABLE IF NOT EXISTS production_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           INTEGER NOT NULL CHECK (lead_id > 0),
  lead_slug         TEXT NOT NULL CHECK (lead_slug ~ '^[a-z0-9][a-z0-9-]*$'),
  hook_type         TEXT NOT NULL CHECK (hook_type IN ('G1', 'G2', 'G3', 'G4')),
  status            TEXT NOT NULL DEFAULT 'queued',
  idempotency_key   TEXT UNIQUE,
  pr_url            TEXT,
  pr_number         INTEGER,
  repo              TEXT,
  target_url        TEXT,
  error             TEXT,
  generated_files   JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_jobs_lead_id_created
  ON production_jobs (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_jobs_lead_slug_created
  ON production_jobs (lead_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_jobs_status_created
  ON production_jobs (status, created_at DESC);
