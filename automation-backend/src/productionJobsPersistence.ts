// Fase 9: ProductionJob persistence. Tracks G1-G4 hook auto-generation
// pipeline jobs in PostgreSQL so they survive service restarts. Follows the
// same patterns as crmPersistence.ts (lazy schema init, mapRow, query()).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDatabaseConfigured, query } from "./db.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");
let schemaReady = false;

export interface ProductionJob {
  id: string;
  leadId: number;
  leadSlug: string;
  hookType: "G1" | "G2" | "G3" | "G4";
  status: string;
  idempotencyKey: string | null;
  prUrl: string | null;
  prNumber: number | null;
  repo: string | null;
  targetUrl: string | null;
  error: string | null;
  generatedFiles: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

// Runs the production_jobs migration exactly once per process lifetime.
// Safe to call at server boot — uses CREATE TABLE/INDEX IF NOT EXISTS so
// re-running on an already-migrated DB is harmless.
export async function ensureProductionJobsSchema(): Promise<void> {
  if (schemaReady) return;
  if (!isDatabaseConfigured()) {
    const err: any = new Error("database_not_configured");
    err.code = "PERSISTENCE_NOT_CONFIGURED";
    throw err;
  }
  const sql = readFileSync(join(MIGRATIONS_DIR, "006_create_production_jobs.sql"), "utf8");
  await query(sql);
  schemaReady = true;
}

function mapRow(row: any): ProductionJob | null {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    leadSlug: row.lead_slug,
    hookType: row.hook_type,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? null,
    prUrl: row.pr_url ?? null,
    prNumber: row.pr_number ?? null,
    repo: row.repo ?? null,
    targetUrl: row.target_url ?? null,
    error: row.error ?? null,
    generatedFiles: row.generated_files ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createJob(
  leadId: number,
  leadSlug: string,
  hookType: "G1" | "G2" | "G3" | "G4",
  idempotencyKey?: string,
): Promise<ProductionJob> {
  await ensureProductionJobsSchema();
  const result = await query(
    `INSERT INTO production_jobs
      (lead_id, lead_slug, hook_type, idempotency_key)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [leadId, leadSlug, hookType, idempotencyKey ?? null],
  );
  return mapRow(result.rows[0])!;
}

export async function getJob(jobId: string): Promise<ProductionJob | null> {
  await ensureProductionJobsSchema();
  const result = await query(
    `SELECT * FROM production_jobs WHERE id = $1`,
    [jobId],
  );
  return mapRow(result.rows[0] ?? null);
}

export async function updateJobStatus(
  jobId: string,
  updates: {
    status?: string;
    prUrl?: string | null;
    prNumber?: number | null;
    repo?: string | null;
    targetUrl?: string | null;
    error?: string | null;
    generatedFiles?: Record<string, any> | null;
  },
): Promise<ProductionJob> {
  await ensureProductionJobsSchema();

  const setClauses: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    values.push(updates.status);
    setClauses.push(`status = $${values.length}`);
  }
  if (updates.prUrl !== undefined) {
    values.push(updates.prUrl);
    setClauses.push(`pr_url = $${values.length}`);
  }
  if (updates.prNumber !== undefined) {
    values.push(updates.prNumber);
    setClauses.push(`pr_number = $${values.length}`);
  }
  if (updates.repo !== undefined) {
    values.push(updates.repo);
    setClauses.push(`repo = $${values.length}`);
  }
  if (updates.targetUrl !== undefined) {
    values.push(updates.targetUrl);
    setClauses.push(`target_url = $${values.length}`);
  }
  if (updates.error !== undefined) {
    values.push(updates.error);
    setClauses.push(`error = $${values.length}`);
  }
  if (updates.generatedFiles !== undefined) {
    // pg driver serializes JSONB automatically — do NOT use JSON.stringify()
    values.push(updates.generatedFiles ?? null);
    setClauses.push(`generated_files = $${values.length}`);
  }

  if (setClauses.length === 0) {
    throw new Error("updateJobStatus: at least one field must be updated");
  }

  // Always bump updated_at
  setClauses.push(`updated_at = now()`);

  values.push(jobId);
  const result = await query(
    `UPDATE production_jobs SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) {
    throw new Error(`job_not_found: ${jobId}`);
  }
  return mapRow(result.rows[0])!;
}

export async function findJobByIdempotencyKey(idempotencyKey: string): Promise<ProductionJob | null> {
  await ensureProductionJobsSchema();
  const result = await query(
    `SELECT * FROM production_jobs WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return mapRow(result.rows[0] ?? null);
}

export async function listJobs(limit = 50): Promise<ProductionJob[]> {
  await ensureProductionJobsSchema();
  const result = await query(
    `SELECT * FROM production_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map(mapRow).filter(Boolean) as ProductionJob[];
}
