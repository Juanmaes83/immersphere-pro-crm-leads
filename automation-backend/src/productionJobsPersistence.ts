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

export async function createJob(
  leadId: number,
  leadSlug: string,
  hookType: "G1" | "G2" | "G3" | "G4",
  idempotencyKey?: string
): Promise<ProductionJob> {
  const result = await query(
    `INSERT INTO production_jobs (lead_id, lead_slug, hook_type, idempotency_key, status)
     VALUES ($1, $2, $3, $4, 'queued')
     RETURNING *`,
    [leadId, leadSlug, hookType, idempotencyKey || null]
  );
  return mapRow(result.rows[0])!;
}

export async function getJob(jobId: string): Promise<ProductionJob | null> {
  const result = await query(`SELECT * FROM production_jobs WHERE id = $1`, [jobId]);
  return mapRow(result.rows[0]);
}

export async function updateJobStatus(
  jobId: string,
  updates: Partial<Omit<ProductionJob, "id" | "createdAt">>
): Promise<ProductionJob> {
  const updateKeys = Object.keys(updates).filter((k) => (updates as any)[k] !== undefined);
  if (updateKeys.length === 0) {
    throw new Error("updateJobStatus llamado sin campos para actualizar");
  }

  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.prUrl !== undefined) {
    fields.push(`pr_url = $${paramIndex++}`);
    values.push(updates.prUrl);
  }
  if (updates.prNumber !== undefined) {
    fields.push(`pr_number = $${paramIndex++}`);
    values.push(updates.prNumber);
  }
  if (updates.repo !== undefined) {
    fields.push(`repo = $${paramIndex++}`);
    values.push(updates.repo);
  }
  if (updates.targetUrl !== undefined) {
    fields.push(`target_url = $${paramIndex++}`);
    values.push(updates.targetUrl);
  }
  if (updates.error !== undefined) {
    fields.push(`error = $${paramIndex++}`);
    values.push(updates.error);
  }
  if (updates.generatedFiles !== undefined) {
    fields.push(`generated_files = $${paramIndex++}`);
    values.push(updates.generatedFiles ?? null);
  }

  fields.push(`updated_at = now()`);
  values.push(jobId);

  const result = await query(
    `UPDATE production_jobs SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error(`job_not_found: ${jobId}`);
  }

  return mapRow(result.rows[0])!;
}

export async function findJobByIdempotencyKey(idempotencyKey: string): Promise<ProductionJob | null> {
  const result = await query(`SELECT * FROM production_jobs WHERE idempotency_key = $1`, [idempotencyKey]);
  return mapRow(result.rows[0]);
}

export async function listJobs(limit: number = 50): Promise<ProductionJob[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 1000);
  const result = await query(`SELECT * FROM production_jobs ORDER BY created_at DESC LIMIT $1`, [safeLimit]);
  return result.rows.map(mapRow).filter(Boolean) as ProductionJob[];
}
