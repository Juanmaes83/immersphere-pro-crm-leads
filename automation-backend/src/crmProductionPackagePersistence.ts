// Fase 8D: ProductionPackage persistence only. Never executes AURUM/Rubik
// PRs, never generates new hooks - only stores the payload the CRM already
// built locally.
import { containsScript, containsSecrets } from "./security.ts";
import { ensureCrmPersistenceSchema } from "./crmPersistence.ts";
import { query } from "./db.ts";

const MAX_ARRAY_LENGTH = 100;
const GESTURE_LAB_RE = /\/gesture-lab\//i;
const LOCALHOST_RE = /^(https?:)?\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\//i;

function collectStrings(value, out) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
}

export function validateProductionPackagePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload_must_be_object"] };
  }
  if (payload.packageVersion !== undefined && payload.packageVersion !== null) {
    if (typeof payload.packageVersion !== "string" || payload.packageVersion.length > 100) errors.push("packageVersion_invalid");
  }
  if (typeof payload.status !== "string" || !payload.status.trim()) errors.push("status_required");
  if (payload.stale !== undefined && typeof payload.stale !== "boolean") errors.push("stale_must_be_boolean");
  if (payload.validationErrors !== undefined && (!Array.isArray(payload.validationErrors) || payload.validationErrors.length > MAX_ARRAY_LENGTH)) {
    errors.push("validationErrors_must_be_array_within_limit");
  }
  if (payload.hooks !== undefined && payload.hooks !== null && typeof payload.hooks !== "object") {
    errors.push("hooks_must_be_object_or_array");
  }
  if (payload.routes !== undefined && payload.routes !== null && typeof payload.routes !== "object") {
    errors.push("routes_must_be_object");
  }
  if (payload.targetRepos !== undefined && payload.targetRepos !== null && typeof payload.targetRepos !== "object") {
    errors.push("targetRepos_must_be_object");
  }

  const routeStrings = [];
  collectStrings(payload.routes, routeStrings);
  routeStrings.forEach((url) => {
    if (LOCALHOST_RE.test(url)) errors.push("routes_contains_localhost_url");
    if (GESTURE_LAB_RE.test(url)) errors.push("routes_contains_gesture_lab_path");
  });

  if (payload.status === "ready") {
    if (payload.stale === true) errors.push("status_ready_requires_stale_false");
    if (Array.isArray(payload.validationErrors) && payload.validationErrors.length > 0) {
      errors.push("status_ready_requires_empty_validationErrors");
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
    packageVersion: row.package_version,
    status: row.status,
    stale: row.stale,
    validationErrors: row.validation_errors,
    hooks: row.hooks,
    routes: row.routes,
    targetRepos: row.target_repos,
    packagePayload: row.package_payload,
    source: row.source,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertProductionPackage(leadId, payload) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `INSERT INTO crm_production_packages
      (lead_key, lead_id, package_version, status, stale, validation_errors, hooks, routes, target_repos, package_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      leadKey,
      leadId,
      typeof payload.packageVersion === "string" ? payload.packageVersion : null,
      payload.status,
      payload.stale === true,
      JSON.stringify(Array.isArray(payload.validationErrors) ? payload.validationErrors : []),
      JSON.stringify(payload.hooks && typeof payload.hooks === "object" ? payload.hooks : []),
      JSON.stringify(payload.routes && typeof payload.routes === "object" ? payload.routes : {}),
      JSON.stringify(payload.targetRepos && typeof payload.targetRepos === "object" ? payload.targetRepos : {}),
      JSON.stringify(payload.packagePayload && typeof payload.packagePayload === "object" ? payload.packagePayload : {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getLatestProductionPackage(leadId) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `SELECT * FROM crm_production_packages WHERE lead_key = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadKey],
  );
  return mapRow(result.rows[0]);
}
