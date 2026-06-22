// Fase 8A: AuditRun persistence only. Everything here is additive - no
// existing endpoint, token, or behavior is touched. Reuses the existing
// containsSecrets/containsScript helpers from security.ts instead of
// re-inventing payload-safety checks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDatabaseConfigured, query } from "./db.ts";
import { containsScript, containsSecrets } from "./security.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");
let schemaReady = false;

export function isCrmPersistenceConfigured() {
  return isDatabaseConfigured() && Boolean(String(process.env.CRM_PERSISTENCE_TOKEN || "").trim());
}

// Auth is intentionally separate from INTERNAL_API_TOKEN/OPERATOR_ADMIN_TOKEN
// (Fase 6B decision) - a leak here must never unlock create-prs or the
// operator console.
export function isCrmPersistenceAuthorized(req) {
  const expected = String(process.env.CRM_PERSISTENCE_TOKEN || "").trim();
  if (!expected) return false;
  const provided = req.headers["x-crm-persistence-token"];
  return typeof provided === "string" && provided === expected;
}

// Fase 8B/8C/8D adds 3 more migration files to this same list. Each is its
// own CREATE TABLE/INDEX IF NOT EXISTS file, run in order - idempotent, so
// re-running already-applied ones on every cold start is harmless.
const MIGRATION_FILES = [
  "001_create_crm_audit_runs.sql",
  "002_create_crm_enrichment_profiles.sql",
  "003_create_crm_approved_media_assets.sql",
  "004_create_crm_production_packages.sql",
  "005_create_crm_commercial_actions.sql",
];

// Lazy, idempotent (CREATE TABLE/INDEX IF NOT EXISTS). Never runs at server
// boot - only on the first real request to a /api/crm/* endpoint, so a
// missing/unreachable DB can never affect /health or any other route.
export async function ensureCrmPersistenceSchema() {
  if (schemaReady) return;
  if (!isDatabaseConfigured()) {
    const err = new Error("persistence_not_configured");
    err.code = "PERSISTENCE_NOT_CONFIGURED";
    throw err;
  }
  try {
    for (const file of MIGRATION_FILES) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await query(sql);
    }
  } catch (cause) {
    const err = new Error("persistence_unavailable");
    err.code = "PERSISTENCE_UNAVAILABLE";
    err.cause = cause;
    throw err;
  }
  schemaReady = true;
}

export function validateLeadIdParam(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const raw = value.trim();
  if (/^(javascript|data|file|blob|mailto|tel):/i.test(raw)) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

const MAX_URLS_REVIEWED = 20;
const MAX_LIST_ITEMS = 50;
const MAX_STRING_LENGTH = 4000;

export function validateAuditRunPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload_must_be_object"] };
  }
  if (!isSafeHttpUrl(payload.website)) errors.push("website_must_be_http_or_https_url");
  if (typeof payload.auditVersion !== "string" || !payload.auditVersion.trim()) errors.push("auditVersion_required");
  if (typeof payload.status !== "string" || !payload.status.trim()) errors.push("status_required");
  if (payload.httpStatus !== undefined && payload.httpStatus !== null && !Number.isInteger(payload.httpStatus)) {
    errors.push("httpStatus_must_be_integer_or_null");
  }
  if (payload.score !== undefined && payload.score !== null && !Number.isInteger(payload.score)) {
    errors.push("score_must_be_integer_or_null");
  }
  if (payload.pagesReviewed !== undefined && payload.pagesReviewed !== null && !Number.isInteger(payload.pagesReviewed)) {
    errors.push("pagesReviewed_must_be_integer_or_null");
  }
  const urlsReviewed = Array.isArray(payload.urlsReviewed) ? payload.urlsReviewed : [];
  if (urlsReviewed.length > MAX_URLS_REVIEWED) errors.push("urlsReviewed_too_long");
  urlsReviewed.forEach((item, i) => {
    if (item && typeof item === "object" && typeof item.url === "string" && !isSafeHttpUrl(item.url)) {
      errors.push(`urlsReviewed[${i}].url_must_be_http_or_https_url`);
    }
  });
  ["weaknesses", "opportunities"].forEach((key) => {
    const list = payload[key];
    if (list !== undefined && (!Array.isArray(list) || list.length > MAX_LIST_ITEMS)) {
      errors.push(`${key}_must_be_array_within_limit`);
    }
  });
  if (payload.recommendedService !== undefined && payload.recommendedService !== null) {
    if (typeof payload.recommendedService !== "string" || payload.recommendedService.length > MAX_STRING_LENGTH) {
      errors.push("recommendedService_invalid");
    }
  }
  if (containsScript(payload)) errors.push("payload_contains_script");
  if (containsSecrets(payload)) errors.push("payload_contains_secret_like_value");
  return { valid: errors.length === 0, errors };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadKey: row.lead_key,
    leadId: row.lead_id,
    website: row.website,
    auditVersion: row.audit_version,
    status: row.status,
    httpStatus: row.http_status,
    score: row.score,
    pagesReviewed: row.pages_reviewed,
    urlsReviewed: row.urls_reviewed,
    weaknesses: row.weaknesses,
    opportunities: row.opportunities,
    recommendedService: row.recommended_service,
    rawAudit: row.raw_audit,
    schemaVersion: row.schema_version,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertAuditRun(leadId, payload) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `INSERT INTO crm_audit_runs
      (lead_key, lead_id, website, audit_version, status, http_status, score, pages_reviewed,
       urls_reviewed, weaknesses, opportunities, recommended_service, raw_audit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      leadKey,
      leadId,
      payload.website,
      payload.auditVersion,
      payload.status,
      Number.isInteger(payload.httpStatus) ? payload.httpStatus : null,
      Number.isInteger(payload.score) ? payload.score : null,
      Number.isInteger(payload.pagesReviewed) ? payload.pagesReviewed : null,
      JSON.stringify(Array.isArray(payload.urlsReviewed) ? payload.urlsReviewed : []),
      JSON.stringify(Array.isArray(payload.weaknesses) ? payload.weaknesses : []),
      JSON.stringify(Array.isArray(payload.opportunities) ? payload.opportunities : []),
      typeof payload.recommendedService === "string" ? payload.recommendedService : null,
      JSON.stringify(payload.rawAudit && typeof payload.rawAudit === "object" ? payload.rawAudit : {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getLatestAuditRun(leadId) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `SELECT * FROM crm_audit_runs WHERE lead_key = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadKey],
  );
  return mapRow(result.rows[0]);
}
