-- Fase 8E/8F/8G/8H: commercial action log. Distinct from the other 4 tables
-- on purpose (per Juanma's design call): an action is an event/history
-- record, not part of the production package itself. Append-only by
-- nature (every action is its own row, never updated in place).
CREATE TABLE IF NOT EXISTS crm_commercial_actions (
  id                          BIGSERIAL PRIMARY KEY,
  lead_key                    TEXT NOT NULL,
  lead_id                     INTEGER NULL CHECK (lead_id IS NULL OR lead_id > 0),
  hook_id                     TEXT,
  hook_type                   TEXT,
  action_type                 TEXT NOT NULL,
  channel                     TEXT,
  status                      TEXT NOT NULL DEFAULT 'recorded',
  message_snapshot            TEXT,
  email_subject_snapshot      TEXT,
  email_body_snapshot         TEXT,
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  source                      TEXT NOT NULL DEFAULT 'crm',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_commercial_actions_lead_key_created
  ON crm_commercial_actions (lead_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_commercial_actions_lead_id_created
  ON crm_commercial_actions (lead_id, created_at DESC);
