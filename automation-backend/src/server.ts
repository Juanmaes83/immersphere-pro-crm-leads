import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { buildPrAutomationPlan } from "./buildPrAutomationPlan.ts";
import { buildAurumFiles } from "./fileGenerators.ts";
import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import {
  classifyExistingAurumComponent,
  extractExistingDataFileRef,
  patchAurumDataFileScoreSafely,
  resolveAurumRouteComponents,
  scanForbiddenGeneratedPatterns,
  wouldIntroduceDuplicateRoutes,
} from "./existingOutputReview.ts";
import {
  allowedRepos,
  branchExists,
  createBranch,
  createPullRequest,
  findOpenPullRequestByHead,
  getBranchHeadSha,
  getFileContent,
  getFileInfo,
  putFile,
  sanitizeGithubError,
} from "./githubClient.ts";
import { logInfo, logWarn } from "./logger.ts";
import { getMode, MAX_BODY_BYTES, SERVICE_NAME, SERVICE_VERSION } from "./schemas.ts";
import { detectExistingOutputsForPlan, filterGeneratedFilesByExistingOutputs } from "./outputIdempotency.ts";
import { reviewExistingOutputsAgainstProductionPackage } from "./existingOutputReview.ts";
import { buildProposalPackage } from "./proposalPackage.ts";
import { sanitizeProductionPackageForPrAutomation } from "./sanitizeProductionPackage.ts";
import { validateProductionPackage } from "./validateProductionPackage.ts";
import { AURUM_APP_TSX, AURUM_REPO, RUBIK_REPO } from "./pathSecurity.ts";
import { resolveProductionScore } from "./productionScore.ts";
import {
  buildClearCookieHeader,
  buildSetCookieHeader,
  createSession,
  getSession,
  invalidateSession,
  isOperatorConsoleEnabled,
  parseSessionCookie,
  validateOperatorCredential,
} from "./operatorSession.ts";
import { buildOperatorConsoleHtml } from "./operatorConsoleHtml.ts";
import { sanitizeLog } from "./security.ts";
import {
  getLatestAuditRun,
  insertAuditRun,
  isCrmPersistenceAuthorized,
  isCrmPersistenceConfigured,
  validateAuditRunPayload,
  validateLeadIdParam,
} from "./crmPersistence.ts";
import {
  getLatestEnrichmentProfile,
  insertEnrichmentProfile,
  validateEnrichmentProfilePayload,
} from "./crmEnrichmentPersistence.ts";
import {
  getLatestApprovedMediaAssets,
  insertApprovedMediaAssets,
  validateApprovedMediaAssetsPayload,
} from "./crmAssetsPersistence.ts";
import {
  getLatestProductionPackage,
  insertProductionPackage,
  validateProductionPackagePayload,
} from "./crmProductionPackagePersistence.ts";
import {
  getCommercialActionsHistory,
  insertCommercialAction,
  validateCommercialActionPayload,
} from "./crmCommercialActionsPersistence.ts";
import { getPersistedStateForLead } from "./crmPersistedState.ts";
 
// ──────────────────────────────────────────────────────────────────────────
// NUEVO: persistencia PostgreSQL para los jobs del pipeline G1-G4
// (auto-generación de ganchos vía IA). Esto es DELIBERADAMENTE un sistema
// separado del `jobs` Map de abajo, que pertenece a pr-plan/create-prs/
// crm-intake/operator-create-prs y NO debe tocarse ni reemplazarse: romperlo
// rompería el tracking de jobs que ya usa el flujo de Casas y Mar.
// ──────────────────────────────────────────────────────────────────────────
import {
  ensureProductionJobsSchema,
  createJob as createHookJob,
  getJob as getHookJob,
  updateJobStatus as updateHookJobStatus,
  findJobByIdempotencyKey as findHookJobByIdempotencyKey,
  listJobs as listHookJobs,
} from "./productionJobsPersistence.ts";
 
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://juanmaes83.github.io",
];
 
const rateLimitBuckets = new Map();
// Sistema de jobs EXISTENTE — usado por pr-plan/create-prs/crm-intake/
// operator-create-prs. NO renombrar, NO migrar, NO tocar. Vive en memoria
// a propósito desde el diseño original de estas rutas; cambiarlo es un
// proyecto aparte que no corresponde a la migración de jobs de G1-G4.
const jobs = new Map();
 
export function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
 
function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}
 
function sendHtml(res, statusCode, html, extraHeaders = {}) {
  const body = html;
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}
 
function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Internal-Api-Token,X-Csrf-Token,X-CRM-Persistence-Token",
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {
    "Access-Control-Allow-Origin": "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Internal-Api-Token,X-Csrf-Token,X-CRM-Persistence-Token",
  };
}
 
function isRateLimited(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > 60;
}
 
function isTokenRequired() {
  const token = String(process.env.INTERNAL_API_TOKEN || "").trim();
  return Boolean(token) && token !== "change-me-local-only";
}
 
function isAuthorized(req) {
  if (!isTokenRequired()) return true;
  return req.headers["x-internal-api-token"] === process.env.INTERNAL_API_TOKEN;
}
 
function prAutomationEnabled() {
  return String(process.env.GITHUB_PR_AUTOMATION_ENABLED || "false").toLowerCase() === "true";
}
 
function proposalPackageEnabled() {
  return String(process.env.PROPOSAL_PACKAGE_ENABLED || "true").toLowerCase() !== "false";
}
 
function crmIntakeEnabled() {
  return String(process.env.CRM_INTAKE_ENABLED || "false").toLowerCase() === "true";
}
 
// NUEVO: kill switch maestro para el pipeline de auto-generación de ganchos
// (G1-G4 vía IA). Por defecto false. No confundir con prAutomationEnabled(),
// que gobierna el create-prs ya existente y manual.
function autoGenerateEnabled() {
  return String(process.env.AUTO_GENERATE_ENABLED || "false").toLowerCase() === "true";
}
 
function hasGithubToken() {
  return Boolean(String(process.env.GITHUB_SERVER_TOKEN || "").trim());
}
 
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "") || "{}";
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}
 
async function readAndSanitizeProductionPackage(req) {
  const rawPayload = await readJsonBody(req);
  return sanitizeProductionPackageForPrAutomation(rawPayload);
}
 
// Fase 8A handlers. Kept in server.ts (not crmPersistence.ts) since they
// deal with HTTP request/response plumbing (auth, body parsing, status
// codes) - crmPersistence.ts stays pure data/validation, same separation
// already used elsewhere in this file (e.g. buildPrAutomationPlan.ts vs the
// route handler that calls it).
async function handleCreateAuditRun(req, res, headers, leadIdRaw) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    const status = err && err.message === "payload_too_large" ? 413 : 400;
    sendJson(res, status, { ok: false, error: err && err.message === "payload_too_large" ? "payload_too_large" : "invalid_json" }, headers);
    return;
  }
  const validation = validateAuditRunPayload(payload);
  if (!validation.valid) {
    sendJson(res, 400, { ok: false, error: "invalid_payload", details: validation.errors }, headers);
    return;
  }
  try {
    const auditRun = await insertAuditRun(leadId, payload);
    sendJson(res, 201, { ok: true, auditRun }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn("crm_audit_run_insert_failed", { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
async function handleLatestAuditRun(req, res, headers, leadIdRaw) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  try {
    const auditRun = await getLatestAuditRun(leadId);
    sendJson(res, 200, { ok: true, auditRun }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn("crm_audit_run_fetch_failed", { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
// Generic create/latest handler pair shared by Fase 8B/8C/8D - all three
// follow the exact same auth -> leadId -> body -> validate -> persist shape
// already established by handleCreateAuditRun/handleLatestAuditRun above.
async function handleCreatePersistedResource(req, res, headers, leadIdRaw, { validate, insert, logLabel }) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    const tooLarge = err && err.message === "payload_too_large";
    sendJson(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? "payload_too_large" : "invalid_json" }, headers);
    return;
  }
  const validation = validate(payload);
  if (!validation.valid) {
    sendJson(res, 400, { ok: false, error: "invalid_payload", details: validation.errors }, headers);
    return;
  }
  try {
    const record = await insert(leadId, payload);
    sendJson(res, 201, { ok: true, record }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn(`${logLabel}_insert_failed`, { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
async function handleLatestPersistedResource(req, res, headers, leadIdRaw, { fetchLatest, recordKey, logLabel }) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  try {
    const record = await fetchLatest(leadId);
    sendJson(res, 200, { ok: true, [recordKey]: record }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn(`${logLabel}_fetch_failed`, { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
async function handleCreateEnrichmentProfile(req, res, headers, leadIdRaw) {
  await handleCreatePersistedResource(req, res, headers, leadIdRaw, {
    validate: validateEnrichmentProfilePayload,
    insert: insertEnrichmentProfile,
    logLabel: "crm_enrichment_profile",
  });
}
 
async function handleLatestEnrichmentProfile(req, res, headers, leadIdRaw) {
  await handleLatestPersistedResource(req, res, headers, leadIdRaw, {
    fetchLatest: getLatestEnrichmentProfile,
    recordKey: "enrichmentProfile",
    logLabel: "crm_enrichment_profile",
  });
}
 
async function handleCreateApprovedMediaAssets(req, res, headers, leadIdRaw) {
  await handleCreatePersistedResource(req, res, headers, leadIdRaw, {
    validate: validateApprovedMediaAssetsPayload,
    insert: insertApprovedMediaAssets,
    logLabel: "crm_approved_media_assets",
  });
}
 
async function handleLatestApprovedMediaAssets(req, res, headers, leadIdRaw) {
  await handleLatestPersistedResource(req, res, headers, leadIdRaw, {
    fetchLatest: getLatestApprovedMediaAssets,
    recordKey: "approvedMediaAssets",
    logLabel: "crm_approved_media_assets",
  });
}
 
async function handleCreateProductionPackage(req, res, headers, leadIdRaw) {
  await handleCreatePersistedResource(req, res, headers, leadIdRaw, {
    validate: validateProductionPackagePayload,
    insert: insertProductionPackage,
    logLabel: "crm_production_package",
  });
}
 
async function handleLatestProductionPackage(req, res, headers, leadIdRaw) {
  await handleLatestPersistedResource(req, res, headers, leadIdRaw, {
    fetchLatest: getLatestProductionPackage,
    recordKey: "productionPackage",
    logLabel: "crm_production_package",
  });
}
 
async function handleCreateCommercialAction(req, res, headers, leadIdRaw) {
  await handleCreatePersistedResource(req, res, headers, leadIdRaw, {
    validate: validateCommercialActionPayload,
    insert: insertCommercialAction,
    logLabel: "crm_commercial_action",
  });
}
 
// Fase 8E. Auth/leadId checks mirror handleLatestPersistedResource, but the
// response shape (full history list, not a single "latest" record) and
// the aggregation logic (Promise.all across 4 tables) don't fit that
// helper, so this stays its own function.
async function handlePersistedState(req, res, headers, leadIdRaw) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  try {
    const state = await getPersistedStateForLead(leadId);
    sendJson(res, 200, { ok: true, ...state }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn("crm_persisted_state_fetch_failed", { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
async function handleCommercialActionsHistory(req, res, headers, leadIdRaw) {
  if (!isCrmPersistenceConfigured()) {
    sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
    return;
  }
  if (!isCrmPersistenceAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
    return;
  }
  const leadId = validateLeadIdParam(leadIdRaw);
  if (leadId === null) {
    sendJson(res, 400, { ok: false, error: "lead_id_must_be_positive_integer" }, headers);
    return;
  }
  try {
    const commercialActions = await getCommercialActionsHistory(leadId, 20);
    sendJson(res, 200, { ok: true, commercialActions }, headers);
  } catch (err) {
    if (err && err.code === "PERSISTENCE_NOT_CONFIGURED") {
      sendJson(res, 503, { ok: false, error: "persistence_not_configured" }, headers);
      return;
    }
    if (err && err.code === "PERSISTENCE_UNAVAILABLE") {
      sendJson(res, 503, { ok: false, error: "persistence_unavailable" }, headers);
      return;
    }
    logWarn("crm_commercial_actions_history_fetch_failed", { message: sanitizeLog(err && err.message) });
    sendJson(res, 500, { ok: false, error: "internal_error" }, headers);
  }
}
 
// ──────────────────────────────────────────────────────────────────────────
// NUEVO: handlers para el pipeline G1-G4 (jobs en PostgreSQL). Rutas bajo
// /api/production/hook-jobs/* — deliberadamente DISTINTAS de
// /api/production/jobs/* (que pertenece al Map existente, ver nota arriba).
// ──────────────────────────────────────────────────────────────────────────
async function handleListHookJobs(req, res, headers) {
  try {
    const jobsList = await listHookJobs(50);
    sendJson(res, 200, { ok: true, jobs: jobsList }, headers);
  } catch (error) {
    logWarn("hook_jobs_list_error", { error: sanitizeLog(error instanceof Error ? error.message : String(error)) });
    sendJson(res, 500, { ok: false, error: "database_error" }, headers);
  }
}
 
async function handleGetHookJob(req, res, headers, jobId) {
  try {
    const job = await getHookJob(jobId);
    if (job) {
      sendJson(res, 200, { ok: true, job }, headers);
    } else {
      sendJson(res, 404, { ok: false, error: "job_not_found" }, headers);
    }
  } catch (error) {
    logWarn("hook_jobs_get_error", { jobId, error: sanitizeLog(error instanceof Error ? error.message : String(error)) });
    sendJson(res, 500, { ok: false, error: "database_error" }, headers);
  }
}
 
function getOperatorSession(req) {
  const sessionId = parseSessionCookie(req.headers.cookie);
  return { sessionId, session: getSession(sessionId) };
}
 
function isOperatorCsrfValid(req, session) {
  if (!session) return false;
  const provided = req.headers["x-csrf-token"] || "";
  return provided === session.csrfToken;
}
 
async function runGithubPreflight(plan) {
  const blockers = [];
  const warnings = [];
  const repoStatus = {};
 
  if (!hasGithubToken()) {
    blockers.push("missing_github_token");
    return {
      ok: false,
      mode: "github-preflight",
      canCreatePRs: false,
      blockers,
      warnings,
      repos: {},
      branches: plan.branches,
      nextStep: "configure_github_server_token",
    };
  }
 
  for (const key of ["rubik", "aurum"]) {
    const target = plan.targetPRs[key];
    if (!target) continue;
    const { repo, headBranch } = target;
    const repoEntry = { repo, headBranch, branchExists: false, existingPR: null, fileStatuses: [] };
 
    try {
      repoEntry.branchExists = await branchExists(repo, headBranch);
      if (repoEntry.branchExists) {
        warnings.push(`${key}_branch_already_exists:${headBranch}`);
      }
 
      const existingPR = await findOpenPullRequestByHead(repo, headBranch);
      if (existingPR) {
        repoEntry.existingPR = { number: existingPR.number, url: existingPR.html_url };
        warnings.push(`${key}_existing_pr_detected:#${existingPR.number}`);
      }
 
      if (repoEntry.branchExists) {
        const keyFiles = (plan.generatedFiles || []).filter((f) => f.repo === repo).slice(0, 3);
        for (const file of keyFiles) {
          const info = await getFileInfo(repo, file.path, headBranch);
          repoEntry.fileStatuses.push({ path: file.path, exists: info.exists });
          if (info.exists) warnings.push(`${key}_file_already_exists:${file.path}`);
        }
      }
    } catch (err) {
      blockers.push(`${key}_github_check_failed:${sanitizeLog(err?.message || "unknown")}`);
    }
 
    repoStatus[key] = repoEntry;
  }
 
  const canCreatePRs = blockers.length === 0;
  return {
    ok: canCreatePRs,
    mode: "github-preflight",
    canCreatePRs,
    blockers,
    warnings,
    repos: repoStatus,
    branches: plan.branches,
    files: (plan.filesToCreate || []).map(({ repo, path }) => ({ repo, path })),
    nextStep: canCreatePRs ? "ready_to_create_prs" : "resolve_blockers",
  };
}
 
export function createRequestHandler() {
  return async function requestHandler(req, res) {
    const headers = corsHeaders(req);
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }
 
    const url = new URL(req.url || "/", "http://127.0.0.1");
 
    // All /api/operator/* endpoints are exempt from the internal-token gate.
    // The browser console has no way to supply INTERNAL_API_TOKEN; operator
    // endpoints are protected by OPERATOR_ADMIN_TOKEN (login) and session+CSRF
    // (all other operator POSTs).
    const isOperatorEndpoint = url.pathname.startsWith("/api/operator/");
    // Fase 8A/8B/8C/8D: all crm-persistence POST endpoints have their own
    // independent auth (isCrmPersistenceAuthorized / CRM_PERSISTENCE_TOKEN,
    // checked inside each handler) and must never require
    // INTERNAL_API_TOKEN - same reasoning as the operator-endpoint
    // exemption above. Listed explicitly (not a generic /api/crm/ prefix
    // match) so a future unrelated /api/crm/* POST doesn't get silently
    // exempted too.
    const CRM_PERSISTENCE_POST_SUFFIXES = ["/audit-runs", "/enrichment-profiles", "/approved-media-assets", "/production-packages", "/commercial-actions"];
    const isCrmPersistencePostEndpoint = req.method === "POST" && url.pathname.startsWith("/api/crm/leads/")
      && CRM_PERSISTENCE_POST_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix));
    if (req.method === "POST" && !isOperatorEndpoint && !isCrmPersistencePostEndpoint && !isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
      return;
    }
 
    if (isRateLimited(req)) {
      sendJson(res, 429, { ok: false, error: "rate_limited" }, headers);
      return;
    }
 
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, mode: getMode() }, headers);
      return;
    }
 
    if (req.method === "GET" && url.pathname === "/api/production/capabilities") {
      const enabled = prAutomationEnabled();
      sendJson(res, 200, {
        ok: true,
        version: SERVICE_VERSION,
        mode: getMode(),
        dryRunEnabled: true,
        prAutomationAvailable: true,
        prAutomationEnabled: enabled,
        proposalPackageEnabled: proposalPackageEnabled(),
        crmDirectConnection: false,
        operatorConsoleAvailable: isOperatorConsoleEnabled(),
        crmIntakeEnabled: crmIntakeEnabled(),
        autoGenerateEnabled: autoGenerateEnabled(),
        writeMode: enabled ? "enabled" : "disabled",
        allowedRepos: allowedRepos(),
      }, headers);
      return;
    }
 
    // Fase 8A: AuditRun persistence only (EnrichmentProfile/ApprovedMediaAssets/
    // ProductionPackage are explicitly out of scope here). Both routes require
    // CRM_PERSISTENCE_TOKEN via X-CRM-Persistence-Token - never
    // INTERNAL_API_TOKEN or OPERATOR_ADMIN_TOKEN, kept deliberately separate
    // (Fase 6B). If DATABASE_URL/CRM_PERSISTENCE_TOKEN aren't configured, both
    // return a controlled 503 - /health and every other route are unaffected.
    if (req.method === "POST" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/audit-runs")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/audit-runs".length);
      await handleCreateAuditRun(req, res, headers, leadIdRaw);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/audit-runs/latest")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/audit-runs/latest".length);
      await handleLatestAuditRun(req, res, headers, leadIdRaw);
      return;
    }
 
    // Fase 8B: EnrichmentProfile persistence only.
    if (req.method === "POST" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/enrichment-profiles")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/enrichment-profiles".length);
      await handleCreateEnrichmentProfile(req, res, headers, leadIdRaw);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/enrichment-profiles/latest")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/enrichment-profiles/latest".length);
      await handleLatestEnrichmentProfile(req, res, headers, leadIdRaw);
      return;
    }
 
    // Fase 8C: ApprovedMediaAssets persistence only.
    if (req.method === "POST" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/approved-media-assets")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/approved-media-assets".length);
      await handleCreateApprovedMediaAssets(req, res, headers, leadIdRaw);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/approved-media-assets/latest")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/approved-media-assets/latest".length);
      await handleLatestApprovedMediaAssets(req, res, headers, leadIdRaw);
      return;
    }
 
    // Fase 8D: ProductionPackage persistence only. Never executes AURUM/Rubik
    // PRs - only stores the payload the CRM already built locally.
    if (req.method === "POST" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/production-packages")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/production-packages".length);
      await handleCreateProductionPackage(req, res, headers, leadIdRaw);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/production-packages/latest")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/production-packages/latest".length);
      await handleLatestProductionPackage(req, res, headers, leadIdRaw);
      return;
    }
 
    // Fase 8E: Persisted State Aggregator. Read-only - combines the latest
    // record from each Fase 8A-8D table plus commercial-actions history.
    // fourHooks/outreachMessages are read verbatim from the latest
    // ProductionPackage, never regenerated here.
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/persisted-state")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/persisted-state".length);
      await handlePersistedState(req, res, headers, leadIdRaw);
      return;
    }
 
    // Fase 8E/8F/8G/8H: commercial action log. Never sends anything itself -
    // only records that copy/open/mark-as-sent happened in the CRM.
    if (req.method === "POST" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/commercial-actions")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/commercial-actions".length);
      await handleCreateCommercialAction(req, res, headers, leadIdRaw);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/crm/leads/") && url.pathname.endsWith("/commercial-actions")) {
      const leadIdRaw = url.pathname.slice("/api/crm/leads/".length, -"/commercial-actions".length);
      await handleCommercialActionsHistory(req, res, headers, leadIdRaw);
      return;
    }
 
    // ── Sistema de jobs EXISTENTE (Map en memoria) ───────────────────────
    // Pertenece a pr-plan/create-prs/crm-intake/operator-create-prs.
    // NO TOCAR. Ver nota junto a la declaración de `jobs` arriba.
    if (req.method === "GET" && (url.pathname === "/api/production/jobs" || url.pathname === "/api/production/jobs/")) {
      sendJson(res, 200, { ok: true, jobs: [...jobs.values()] }, headers);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/production/jobs/")) {
      const jobId = decodeURIComponent(url.pathname.replace("/api/production/jobs/", ""));
      sendJson(res, jobs.has(jobId) ? 200 : 404, jobs.get(jobId) || { ok: false, error: "job_not_found" }, headers);
      return;
    }
 
    // ── Sistema de jobs NUEVO (PostgreSQL) — pipeline G1-G4 ──────────────
    // Rutas deliberadamente distintas (/hook-jobs, no /jobs) para no
    // colisionar nunca con el sistema de arriba.
    if (req.method === "GET" && (url.pathname === "/api/production/hook-jobs" || url.pathname === "/api/production/hook-jobs/")) {
      await handleListHookJobs(req, res, headers);
      return;
    }
 
    if (req.method === "GET" && url.pathname.startsWith("/api/production/hook-jobs/")) {
      const jobId = decodeURIComponent(url.pathname.replace("/api/production/hook-jobs/", ""));
      await handleGetHookJob(req, res, headers, jobId);
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/github/dispatch-production") {
      logWarn("dispatch-production blocked in v0.1");
      sendJson(res, 200, { ok: false, reason: "disabled_in_v0_1_until_security_review" }, headers);
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/production/dry-run") {
      try {
        const payload = await readAndSanitizeProductionPackage(req);
        const validation = validateProductionPackage(payload);
        const plan = buildDryRunPlan(payload, validation);
        logInfo("dry-run requested", { leadSlug: payload?.lead?.slug || "missing", ok: plan.ok });
        sendJson(res, plan.ok ? 200 : 400, plan, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, {
          ok: false,
          mode: getMode(),
          validation: { passed: false, errors: [message], warnings: [] },
          blocked: true,
        }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/production/pr-plan") {
      try {
        const payload = await readAndSanitizeProductionPackage(req);
        const validation = validateProductionPackage(payload);
        const plan = await buildPrAutomationPlan(payload, validation);
        if (plan.jobId) {
          jobs.set(plan.jobId, {
            ok: plan.ok,
            jobId: plan.jobId,
            leadSlug: plan.leadSlug,
            status: plan.ok ? "planned" : "blocked",
            warnings: plan.validation?.warnings?.length || 0,
            errors: plan.validation?.errors?.length || 0,
            timestamp: Date.now(),
          });
        }
        logInfo("pr-plan requested", { leadSlug: payload?.lead?.slug || "missing", ok: plan.ok });
        sendJson(res, plan.ok ? 200 : 400, plan, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, 400, { ok: false, mode: "pr-plan", validation: { passed: false, errors: [message], warnings: [] }, blocked: true }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/production/proposal-package") {
      try {
        const payload = await readAndSanitizeProductionPackage(req);
        const validation = validateProductionPackage(payload);
        if (!validation.passed) {
          sendJson(res, 400, { ok: false, validation, blocked: true }, headers);
          return;
        }
        const plan = await buildPrAutomationPlan(payload, validation);
        sendJson(res, 200, {
          ok: true,
          mode: "proposal-package",
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          proposalPackage: buildProposalPackage(payload, plan),
          nextStep: "review_required",
        }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, 400, { ok: false, errors: [message] }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/production/github-preflight") {
      try {
        const payload = await readAndSanitizeProductionPackage(req);
        const validation = validateProductionPackage(payload);
        if (!validation.passed) {
          sendJson(res, 400, {
            ok: false,
            mode: "github-preflight",
            canCreatePRs: false,
            blockers: validation.errors,
            warnings: validation.warnings,
            validation,
          }, headers);
          return;
        }
        const plan = await buildPrAutomationPlan(payload, validation);
        if (!plan.ok) {
          sendJson(res, 400, {
            ok: false,
            mode: "github-preflight",
            canCreatePRs: false,
            blockers: plan.validation?.errors || [],
            warnings: plan.validation?.warnings || [],
          }, headers);
          return;
        }
        const preflight = await runGithubPreflight(plan);
        let existingOutputReview = {
          overall: {
            passed: false,
            status: "missing",
            mismatches: [],
            criticalWarnings: [],
            safeWarnings: ["github_preflight_skipped_existing_output_review:missing_token"],
            checkedFiles: [],
            recommendedAction: "configure_github_server_token",
          },
        };
        if (preflight.canCreatePRs) {
          const existingOutputs = await detectExistingOutputsForPlan(plan, "main");
          existingOutputReview = await reviewExistingOutputsAgainstProductionPackage(payload, plan, existingOutputs, "main");
        }
        logInfo("github-preflight requested", { leadSlug: plan.leadSlug, canCreatePRs: preflight.canCreatePRs, existingOutputStatus: existingOutputReview.overall.status });
        sendJson(res, preflight.ok ? 200 : 200, { ...preflight, existingOutputReview: existingOutputReview.overall }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, 400, { ok: false, mode: "github-preflight", canCreatePRs: false, blockers: [message] }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/production/create-prs") {
      if (!prAutomationEnabled()) {
        sendJson(res, 200, { ok: false, reason: "disabled_until_security_flags_enabled", writeAttempted: false }, headers);
        return;
      }
      if (!hasGithubToken()) {
        sendJson(res, 200, { ok: false, reason: "missing_server_side_github_token", writeAttempted: false }, headers);
        return;
      }
      try {
        const payload = await readAndSanitizeProductionPackage(req);
        const validation = validateProductionPackage(payload);
        const plan = await buildPrAutomationPlan(payload, validation);
        if (!plan.ok) {
          sendJson(res, 400, { ...plan, writeAttempted: false }, headers);
          return;
        }
        const preflight = await runGithubPreflight(plan);
        if (!preflight.canCreatePRs) {
          sendJson(res, 400, {
            ok: false,
            mode: "create-prs",
            reason: "preflight_blocked",
            blockers: preflight.blockers,
            warnings: preflight.warnings,
            writeAttempted: false,
          }, headers);
          return;
        }
        const result = await createProductionPullRequests(payload, plan, preflight);
        jobs.set(plan.jobId, {
          ok: true,
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          status: result.status || "prs_created",
          pullRequests: result.pullRequests,
          responseBundle: result.responseBundle,
          timestamp: Date.now(),
        });
        sendJson(res, 200, {
          ok: result.ok !== false,
          mode: "create-prs",
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          writeAttempted: result.writeAttempted,
          status: result.status,
          blocked: result.blocked || false,
          blockers: result.blockers || [],
          existingOutputReview: result.existingOutputReview,
          pullRequests: result.pullRequests,
          responseBundle: result.responseBundle,
          idempotencyNotes: result.idempotencyNotes,
          nextStep: result.nextStep || "human_review_required",
        }, headers);
      } catch (error) {
        const safeError = sanitizeGithubError(error);
        sendJson(res, 500, { ok: false, mode: "create-prs", writeAttempted: true, status: "error", error: safeError }, headers);
      }
      return;
    }
 
    // ── GET /api/production/response-bundle/:jobId ───────────────────────────
    const prodBundleMatch = url.pathname.match(/^\/api\/production\/response-bundle\/([a-z0-9_-]+)$/i);
    if (req.method === "GET" && prodBundleMatch) {
      const jobId = prodBundleMatch[1];
      const job = jobs.get(jobId);
      if (!job || !job.responseBundle) {
        sendJson(res, 404, { ok: false, error: "job_not_found_or_no_bundle", jobId, hint: "Only available after /api/production/create-prs or /api/operator/create-prs" }, headers);
        return;
      }
      logInfo("production/response-bundle retrieved", { jobId, leadSlug: job.leadSlug });
      sendJson(res, 200, { ok: true, jobId, leadSlug: job.leadSlug, responseBundle: job.responseBundle, retrievedAt: new Date().toISOString() }, headers);
      return;
    }
 
    // ── POST /api/crm/import-response-bundle ─────────────────────────────────
    if (req.method === "POST" && url.pathname === "/api/crm/import-response-bundle") {
      try {
        const body = await readJsonBody(req);
        const leadId = typeof body?.leadId === "string" ? body.leadId : null;
        const responseBundle = body?.responseBundle;
        if (!leadId) { sendJson(res, 400, { ok: false, error: "leadId_required" }, headers); return; }
        if (!responseBundle || typeof responseBundle !== "object") { sendJson(res, 400, { ok: false, error: "responseBundle_required_object" }, headers); return; }
        if (responseBundle.schemaVersion !== "operator-response-bundle/1.0") {
          sendJson(res, 400, { ok: false, error: "invalid_schema_version", expected: "operator-response-bundle/1.0", received: responseBundle.schemaVersion }, headers);
          return;
        }
        const validStatuses = ["dry_run_ok", "pr_created", "needs_manual_merge", "published", "failed", "needs_existing_output_review", "existing_outputs_current", "existing_outputs_update_required"];
        const bundleStatus = typeof responseBundle.status === "string" ? responseBundle.status : "unknown";
        if (!validStatuses.includes(bundleStatus)) {
          sendJson(res, 400, { ok: false, error: "invalid_status", status: bundleStatus, valid: validStatuses }, headers);
          return;
        }
        const importStatus = bundleStatus === "published" ? "published" : "publication_pending";
        const warnings: string[] = [];
        if (bundleStatus === "dry_run_ok") warnings.push("responseBundle.status is dry_run_ok — PRs not yet merged. Publication pending.");
        if (bundleStatus === "needs_manual_merge") warnings.push("responseBundle.status is needs_manual_merge — merge required before publication.");
        if (bundleStatus === "failed") warnings.push("responseBundle.status is failed — check errors before importing.");
        const jobId = typeof responseBundle.jobId === "string" ? responseBundle.jobId : null;
        if (jobId && jobs.has(jobId)) {
          const existing = jobs.get(jobId);
          jobs.set(jobId, { ...existing, crmImportedAt: new Date().toISOString(), crmLeadId: leadId });
        }
        logInfo("crm/import-response-bundle", { leadId, jobId: jobId || "none", importStatus });
        sendJson(res, 200, { ok: true, leadId, imported: true, status: importStatus, jobId, warnings }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, { ok: false, error: message }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/crm/intake") {
      if (!crmIntakeEnabled()) {
        sendJson(res, 200, { ok: false, reason: "crm_intake_disabled", hint: "Set CRM_INTAKE_ENABLED=true to enable" }, headers);
        return;
      }
      try {
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildDryRunPlan(payload, validation);
        const intakeId = crypto.randomBytes(8).toString("hex");
        const jobId = plan.jobId || `intake_${Date.now()}`;
        jobs.set(jobId, {
          ok: validation.passed,
          jobId,
          intakeId,
          leadSlug: plan.leadSlug || "unknown",
          status: validation.passed ? "intake_received" : "intake_blocked",
          warnings: validation.warnings?.length || 0,
          errors: validation.errors?.length || 0,
          timestamp: Date.now(),
          source: "crm_intake",
        });
        logInfo("crm-intake received", { leadSlug: plan.leadSlug || "missing", valid: validation.passed });
        sendJson(res, 200, {
          ok: validation.passed,
          intakeId,
          jobId,
          leadSlug: plan.leadSlug,
          validation: { passed: validation.passed, warnings: validation.warnings?.length || 0, errors: validation.errors?.length || 0 },
          nextStep: "operator_review_required",
        }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, 400, { ok: false, error: message }, headers);
      }
      return;
    }
 
    // ── Operator Console ──
 
    if (req.method === "GET" && url.pathname === "/operator") {
      if (!isOperatorConsoleEnabled()) {
        sendJson(res, 404, { ok: false, error: "operator_console_disabled" });
        return;
      }
      sendHtml(res, 200, buildOperatorConsoleHtml(SERVICE_VERSION));
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/operator/login") {
      if (!isOperatorConsoleEnabled()) {
        sendJson(res, 404, { ok: false, error: "operator_console_disabled" }, headers);
        return;
      }
      try {
        const body = await readJsonBody(req);
        const provided = String(body.token || "").trim();
        if (!validateOperatorCredential(provided)) {
          sendJson(res, 401, { ok: false, error: "invalid_operator_token" }, headers);
          return;
        }
        const { sessionId, csrfToken, expiresAt } = createSession();
        sendJson(res, 200, { ok: true, csrfToken, expiresAt }, {
          ...headers,
          "Set-Cookie": buildSetCookieHeader(sessionId, expiresAt),
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: "request_failed" }, headers);
      }
      return;
    }
 
    if (req.method === "POST" && url.pathname === "/api/operator/logout") {
      const { sessionId } = getOperatorSession(req);
      if (sessionId) invalidateSession(sessionId);
      sendJson(res, 200, { ok: true }, {
        ...headers,
        "Set-Cookie": buildClearCookieHeader(),
      });
      return;
    }
 
    if (req.method === "GET" && url.pathname === "/api/operator/session") {
      if (!isOperatorConsoleEnabled()) {
        sendJson(res, 200, { ok: true, authenticated: false }, headers);
        return;
      }
      const { session } = getOperatorSession(req);
      if (!session) {
        sendJson(res, 200, { ok: true, authenticated: false }, headers);
        return;
      }
      sendJson(res, 200, { ok: true, authenticated: true, csrfToken: session.csrfToken, expiresAt: session.expiresAt }, headers);
      return;
    }
 
    // ── GET /api/operator/response-bundle/:jobId (no session required for GET) ─
    const operatorBundleMatch = url.pathname.match(/^\/api\/operator\/response-bundle\/([a-z0-9_-]+)$/i);
    if (req.method === "GET" && operatorBundleMatch) {
      const jobId = operatorBundleMatch[1];
      const job = jobs.get(jobId);
      if (!job || !job.responseBundle) {
        sendJson(res, 404, { ok: false, error: "job_not_found_or_no_bundle", jobId, hint: "Only available after /api/operator/create-prs or /api/production/create-prs" }, headers);
        return;
      }
      logInfo("operator/response-bundle retrieved", { jobId, leadSlug: job.leadSlug });
      sendJson(res, 200, { ok: true, jobId, leadSlug: job.leadSlug, responseBundle: job.responseBundle, retrievedAt: new Date().toISOString() }, headers);
      return;
    }
 
    if (url.pathname.startsWith("/api/operator/") && req.method === "POST") {
      if (!isOperatorConsoleEnabled()) {
        sendJson(res, 404, { ok: false, error: "operator_console_disabled" }, headers);
        return;
      }
      const { session } = getOperatorSession(req);
      if (!session) {
        sendJson(res, 401, { ok: false, error: "operator_session_required" }, headers);
        return;
      }
      if (!isOperatorCsrfValid(req, session)) {
        sendJson(res, 403, { ok: false, error: "csrf_token_invalid" }, headers);
        return;
      }
 
      if (url.pathname === "/api/operator/proposal-package") {
        try {
          const payload = await readAndSanitizeProductionPackage(req);
          const validation = validateProductionPackage(payload);
          if (!validation.passed) {
            sendJson(res, 400, {
              ok: false,
              mode: "operator-proposal-package",
              leadSlug: payload?.lead?.slug || "missing",
              validation,
              nextStep: "fix_validation_errors",
            }, headers);
            return;
          }
          const plan = await buildPrAutomationPlan(payload, validation);
          const proposalPackage = plan.proposalPackage || buildProposalPackage(payload, {
            branches: plan.branches || {},
            targetPRs: plan.targetPRs || {},
          });
          logInfo("operator proposal-package requested", { leadSlug: payload?.lead?.slug || "missing", ok: plan.ok });
          sendJson(res, plan.ok ? 200 : 400, {
            ok: plan.ok,
            mode: "operator-proposal-package",
            leadSlug: plan.leadSlug || payload?.lead?.slug || "missing",
            validation: plan.validation || validation,
            proposalPackage,
            nextStep: plan.ok ? "run_pr_plan" : "review_validation_or_path_errors",
          }, headers);
        } catch (error) {
          const message = error instanceof Error ? error.message : "request_failed";
          sendJson(res, 400, { ok: false, mode: "operator-proposal-package", validation: { passed: false, errors: [message], warnings: [] } }, headers);
        }
        return;
      }
 
      if (url.pathname === "/api/operator/pr-plan") {
        try {
          const payload = await readAndSanitizeProductionPackage(req);
          const validation = validateProductionPackage(payload);
          const plan = await buildPrAutomationPlan(payload, validation);
          logInfo("operator pr-plan requested", { leadSlug: payload?.lead?.slug || "missing", ok: plan.ok });
          sendJson(res, plan.ok ? 200 : 400, plan, headers);
        } catch (error) {
          const message = error instanceof Error ? error.message : "request_failed";
          sendJson(res, 400, { ok: false, error: message }, headers);
        }
        return;
      }
 
      if (url.pathname === "/api/operator/github-preflight") {
        try {
          const payload = await readAndSanitizeProductionPackage(req);
          const validation = validateProductionPackage(payload);
          if (!validation.passed) {
            sendJson(res, 400, { ok: false, mode: "github-preflight", canCreatePRs: false, blockers: validation.errors }, headers);
            return;
          }
          const plan = await buildPrAutomationPlan(payload, validation);
          if (!plan.ok) {
            sendJson(res, 400, { ok: false, mode: "github-preflight", canCreatePRs: false, blockers: plan.validation?.errors || [] }, headers);
            return;
          }
          const preflight = await runGithubPreflight(plan);
          logInfo("operator github-preflight", { leadSlug: plan.leadSlug, canCreatePRs: preflight.canCreatePRs });
          sendJson(res, 200, preflight, headers);
        } catch (error) {
          const message = error instanceof Error ? error.message : "request_failed";
          sendJson(res, 400, { ok: false, mode: "github-preflight", canCreatePRs: false, blockers: [message] }, headers);
        }
        return;
      }
 
      if (url.pathname === "/api/operator/create-prs") {
        if (!prAutomationEnabled()) {
          sendJson(res, 200, { ok: false, reason: "disabled_until_security_flags_enabled", writeAttempted: false }, headers);
          return;
        }
        if (!hasGithubToken()) {
          sendJson(res, 200, { ok: false, reason: "missing_server_side_github_token", writeAttempted: false }, headers);
          return;
        }
        try {
          const payload = await readAndSanitizeProductionPackage(req);
          const validation = validateProductionPackage(payload);
          const plan = await buildPrAutomationPlan(payload, validation);
          if (!plan.ok) {
            sendJson(res, 400, { ...plan, writeAttempted: false }, headers);
            return;
          }
          const preflight = await runGithubPreflight(plan);
          if (!preflight.canCreatePRs) {
            sendJson(res, 400, {
              ok: false,
              reason: "preflight_blocked",
              blockers: preflight.blockers,
              warnings: preflight.warnings,
              writeAttempted: false,
            }, headers);
            return;
          }
          const result = await createProductionPullRequests(payload, plan, preflight);
          jobs.set(plan.jobId, {
            ok: true,
            jobId: plan.jobId,
            leadSlug: plan.leadSlug,
            status: result.status || "prs_created",
            pullRequests: result.pullRequests,
            responseBundle: result.responseBundle,
            timestamp: Date.now(),
            source: "operator",
          });
          logInfo("operator create-prs success", { leadSlug: plan.leadSlug });
          sendJson(res, 200, {
            ok: result.ok !== false,
            mode: "create-prs",
            jobId: plan.jobId,
            leadSlug: plan.leadSlug,
            writeAttempted: result.writeAttempted,
            status: result.status,
            blocked: result.blocked || false,
            blockers: result.blockers || [],
            existingOutputReview: result.existingOutputReview,
            pullRequests: result.pullRequests,
            responseBundle: result.responseBundle,
            idempotencyNotes: result.idempotencyNotes,
            nextStep: result.nextStep || "human_review_required",
          }, headers);
        } catch (error) {
          const safeError = sanitizeGithubError(error);
          sendJson(res, 500, { ok: false, mode: "create-prs", writeAttempted: true, status: "error", error: safeError }, headers);
        }
        return;
      }
 
      sendJson(res, 404, { ok: false, error: "not_found" }, headers);
      return;
    }
 
    sendJson(res, 404, { ok: false, error: "not_found" }, headers);
  };
}
 
function groupByRepo(files) {
  const map = new Map();
  for (const file of files) {
    const list = map.get(file.repo) || [];
    list.push(file);
    map.set(file.repo, list);
  }
  return map;
}
 
function applyAppTsxPatch(current: string, patch: { imports: string[]; routes: string[] }): string {
  let result = current;
  const importBlock = patch.imports.join("\n");
  const lastImportIdx = result.lastIndexOf("\nimport ");
  if (lastImportIdx !== -1) {
    const endOfLine = result.indexOf("\n", lastImportIdx + 1);
    result = endOfLine !== -1
      ? result.slice(0, endOfLine + 1) + importBlock + "\n" + result.slice(endOfLine + 1)
      : result + "\n" + importBlock + "\n";
  } else {
    result = importBlock + "\n" + result;
  }
  const routeBlock = patch.routes.map((r) => "      " + r).join("\n");
  if (result.includes("</Routes>")) {
    result = result.replace("</Routes>", routeBlock + "\n      </Routes>");
  }
  return result;
}
 
function applyVercelJsonPatch(current: string, newRewrites: Array<{ source: string; destination: string }>): string {
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(current || "{}"); } catch { parsed = {}; }
  const existing = Array.isArray(parsed.rewrites) ? parsed.rewrites as Array<{ source: string }> : [];
  const toAdd = newRewrites.filter((nr) => !existing.some((er) => er.source === nr.source));
  parsed.rewrites = [...existing, ...toAdd];
  return JSON.stringify(parsed, null, 2);
}
 
async function writeFileToRepo(repo: string, branch: string, file: Record<string, unknown>): Promise<void> {
  if (file.isPatchTarget && file.patchType === "app-tsx-routes") {
    const patch = JSON.parse(String(file.content));
    const current = await getFileContent(repo, String(file.path), "main");
    const patched = applyAppTsxPatch(current.content || "", patch);
    const info = await getFileInfo(repo, String(file.path), branch);
    await putFile(repo, branch, String(file.path), patched, String(file.message), info.sha || undefined);
    return;
  }
  if (file.isPatchTarget && file.patchType === "vercel-json-rewrites") {
    const newRewrites = JSON.parse(String(file.content));
    const current = await getFileContent(repo, String(file.path), "main");
    const patched = applyVercelJsonPatch(current.content || "{}", newRewrites);
    const info = await getFileInfo(repo, String(file.path), branch);
    await putFile(repo, branch, String(file.path), patched, String(file.message), info.sha || undefined);
    return;
  }
  const info = await getFileInfo(repo, String(file.path), branch);
  await putFile(repo, branch, String(file.path), String(file.content), String(file.message), info.sha || undefined);
}
 
function buildResponseBundle(plan, pullRequestsByRepo: Record<string, { url: string; number: number; branch: string }>, createdAt: string) {
  const aurum = Object.entries(pullRequestsByRepo).find(([repo]) => repo.toLowerCase().includes("aurum"))?.[1] || null;
  const rubik = Object.entries(pullRequestsByRepo).find(([repo]) => repo.toLowerCase().includes("rubik"))?.[1] || null;
  return {
    schemaVersion: "operator-response-bundle/1.0",
    jobId: plan.jobId,
    leadId: plan.leadSlug,
    slug: plan.leadSlug,
    status: "pr_created",
    source: "railway-operator-create-prs",
    pullRequests: {
      aurum: aurum ? { url: aurum.url, number: aurum.number, branch: aurum.branch } : null,
      rubik: rubik ? { url: rubik.url, number: rubik.number, branch: rubik.branch } : null,
      crm: null,
    },
    plannedPublicRoutes: plan.plannedPublicRoutes || {},
    publicRoutes: {},
    assetMode: plan.assetMode || "fallback_internal_library",
    warnings: plan.generatorWarnings || [],
    errors: plan.generatorErrors || [],
    createdAt,
  };
}
 
// Branches are always cut from the *current* main SHA, fetched fresh from
// GitHub on every call — never from a cached/previous branch's tip. If the
// SHA can't be confirmed we refuse to create a branch at all rather than
// silently falling back to some other ref.
async function ensureUpdateBranch(repo: string, desiredBranch: string, baseBranch = "main") {
  const fromSha = await getBranchHeadSha(repo, baseBranch);
  if (!fromSha) {
    throw new Error(`main_sha_unconfirmed:${repo}`);
  }
  if (await branchExists(repo, desiredBranch)) {
    const safeBranch = `${desiredBranch}-refresh-${Date.now()}`;
    await createBranch(repo, safeBranch, fromSha);
    return { branch: safeBranch, reused: false, refreshed: true };
  }
  await createBranch(repo, desiredBranch, fromSha);
  return { branch: desiredBranch, reused: false, refreshed: false };
}
 
function blockedResult(blockers: string[], idempotencyNotes: string[], existingOutputReview = null) {
  return {
    ok: false,
    blocked: true,
    blockers,
    pullRequests: {},
    idempotencyNotes,
    existingOutputReview,
    status: "blocked",
    writeAttempted: false,
    nextStep: "resolve_blocker",
  };
}
 
async function createProductionPullRequests(payload, plan, preflight = {}) {
  const createdAt = new Date().toISOString();
  const idempotencyNotes: string[] = [];
 
  const aurumMainSha = await getBranchHeadSha(AURUM_REPO, "main").catch(() => null);
  if (!aurumMainSha) {
    return blockedResult(["aurum_main_sha_unconfirmed"], idempotencyNotes);
  }
 
  const existingOutputs = await detectExistingOutputsForPlan(plan, "main");
  const existingOutputReview = await reviewExistingOutputsAgainstProductionPackage(payload, plan, existingOutputs, "main");
 
  const hasExistingOutputs = existingOutputs.overall === "all_exist" || existingOutputs.overall === "partial";
  if (hasExistingOutputs) {
    const appInfo = await getFileContent(AURUM_REPO, "src/App.tsx", "main");
    const existingAppTsxContent = appInfo.exists ? appInfo.content || "" : "";
 
    const routeResolution = resolveAurumRouteComponents(existingAppTsxContent, plan.leadSlug);
    if (routeResolution.ambiguousTypes.length > 0) {
      return blockedResult(
        routeResolution.ambiguousTypes.map((t) => `aurum_route_component_ambiguous:${t}`),
        idempotencyNotes,
        existingOutputReview.overall,
      );
    }
 
    // If the reused components already point at a data file (e.g. sandhouse.ts),
    // reuse that same file/export instead of creating a parallel one keyed off
    // the incoming slug. Two reused components disagreeing on their data file
    // is treated as unsafe to auto-resolve. The same fetched content is also
    // used below to classify each component as premium/manual vs. something
    // we can safely regenerate — one round-trip per component, not two.
    const reusedComponentNames = [...new Set(Object.values(routeResolution.componentByCanonicalRoute))];
    const componentContentByName = new Map<string, string>();
    for (const componentName of reusedComponentNames) {
      const componentInfo = await getFileContent(AURUM_REPO, `src/${componentName}.tsx`, "main");
      componentContentByName.set(componentName, componentInfo.exists ? componentInfo.content || "" : "");
    }
 
    const dataFileRefs = new Map<string, { path: string; exportName: string }>();
    for (const content of componentContentByName.values()) {
      const ref = extractExistingDataFileRef(content);
      if (ref) dataFileRefs.set(`${ref.path}::${ref.exportName}`, ref);
    }
    if (dataFileRefs.size > 1) {
      return blockedResult(["aurum_data_file_ambiguous"], idempotencyNotes, existingOutputReview.overall);
    }
    const existingDataFile = dataFileRefs.size === 1 ? [...dataFileRefs.values()][0] : undefined;
 
    // "Reusing a component's name does not mean overwriting its content."
    // Anything we cannot positively identify as our own previous
    // auto-generated output (premium/manual hand-built, or simply unknown)
    // is preserved untouched rather than regenerated from a basic template.
    const preserveComponentTypes = routeResolution.reusedTypes.filter((type) => {
      const componentName = routeResolution.componentByType[type];
      const classification = classifyExistingAurumComponent(componentContentByName.get(componentName) || "");
      return classification !== "autogenerated_safe_to_replace";
    });
 
    // Existing data files are never fully overwritten — only a surgical,
    // non-destructive patch of the score field, preserving everything else
    // byte-for-byte. If that field can't be located safely, block instead of
    // guessing at the file's structure and risking destroying it.
    let dataFileOverrideContent: string | undefined;
    let dataFilePatched = false;
    if (existingDataFile) {
      const dataFileInfo = await getFileContent(AURUM_REPO, existingDataFile.path, "main");
      if (dataFileInfo.exists) {
        const realScore = resolveProductionScore(payload as Record<string, unknown>);
        const patched = patchAurumDataFileScoreSafely(dataFileInfo.content || "", realScore, plan.leadSlug);
        if (!patched) {
          return blockedResult(
            [`aurum_existing_data_file_requires_manual_review:${existingDataFile.path}`],
            idempotencyNotes,
            existingOutputReview.overall,
          );
        }
        dataFileOverrideContent = patched;
        dataFilePatched = true;
      }
    }
 
    const reconciledAurum = buildAurumFiles(payload, plan.proposalPackage, {
      existingRouteComponentMap: routeResolution.componentByCanonicalRoute,
      existingAppTsxContent,
      existingDataFile,
      preserveComponentTypes,
      dataFileOverrideContent,
    });
    const reconciledAurumPaths = new Set(reconciledAurum.files.map((f) => f.path));
 
    // Hard gate: a preserved (premium/unknown) component must never end up
    // in the write set, regardless of how it got there.
    const overwrittenPremiumPaths = preserveComponentTypes
      .map((type) => `src/${routeResolution.componentByType[type]}.tsx`)
      .filter((p) => reconciledAurumPaths.has(p));
    if (overwrittenPremiumPaths.length > 0) {
      return blockedResult(
        overwrittenPremiumPaths.map((p) => `aurum_premium_component_overwrite_blocked:${p}`),
        idempotencyNotes,
        existingOutputReview.overall,
      );
    }
 
    // Critical existing outputs that DO need refreshing must actually be
    // part of the write set: the manifest (always), the data file whenever
    // one was detected (full regen or surgical patch), and any reused
    // component that wasn't intentionally preserved as premium/unknown.
    // App.tsx and preserved components are excluded here on purpose — their
    // absence from the write set is the correct, intended outcome.
    const criticalAurumPaths = [
      `production-manifests/${plan.leadSlug}.json`,
      ...(existingDataFile ? [existingDataFile.path] : []),
      ...routeResolution.reusedTypes
        .filter((type) => !preserveComponentTypes.includes(type))
        .map((type) => `src/${routeResolution.componentByType[type]}.tsx`),
    ];
    const unupdatedCriticalAurumFiles = criticalAurumPaths.filter((p) => !reconciledAurumPaths.has(p));
    if (unupdatedCriticalAurumFiles.length > 0) {
      return blockedResult(
        unupdatedCriticalAurumFiles.map((p) => `aurum_critical_file_not_updated:${p}`),
        idempotencyNotes,
        existingOutputReview.overall,
      );
    }
 
    const forbiddenPatternViolations = scanForbiddenGeneratedPatterns(reconciledAurum.files);
    if (forbiddenPatternViolations.length > 0) {
      return blockedResult(forbiddenPatternViolations, idempotencyNotes, existingOutputReview.overall);
    }
 
    const appTsxPatchFile = reconciledAurum.files.find((f) => f.path === AURUM_APP_TSX && f.isPatchTarget);
    if (appTsxPatchFile) {
      const patch = JSON.parse(String(appTsxPatchFile.content));
      const newPaths = (patch.routes || [])
        .map((r: string) => r.match(/path="([^"]+)"/)?.[1])
        .filter((p): p is string => Boolean(p));
      const duplicateRoutes = wouldIntroduceDuplicateRoutes(existingAppTsxContent, newPaths);
      if (duplicateRoutes.length > 0) {
        return blockedResult(
          duplicateRoutes.map((p) => `aurum_duplicate_routes_detected:${p}`),
          idempotencyNotes,
          existingOutputReview.overall,
        );
      }
    }
 
    const rubikFiles = plan.generatedFiles.filter((f) => f.repo === RUBIK_REPO);
    plan.generatedFiles = [...rubikFiles, ...reconciledAurum.files];
    idempotencyNotes.push("aurum_files_reconciled_with_existing_app_tsx");
    idempotencyNotes.push("aurum_refresh_based_on_main");
    if (routeResolution.reusedTypes.length > 0) idempotencyNotes.push("aurum_reused_existing_components");
    if (preserveComponentTypes.length > 0) idempotencyNotes.push("aurum_existing_premium_components_preserved");
    if (!appTsxPatchFile) idempotencyNotes.push("aurum_app_tsx_unchanged_routes_already_present");
    if (existingDataFile) idempotencyNotes.push(`aurum_existing_data_file_detected:${existingDataFile.path}`);
    if (dataFilePatched) idempotencyNotes.push(`aurum_existing_data_file_patched:${existingDataFile!.path}`);
    idempotencyNotes.push("aurum_manifest_updated");
  }
 
  if (existingOutputs.overall === "all_exist" && existingOutputReview.overall.passed) {
    const responseBundle = buildResponseBundle(plan, {}, createdAt);
    responseBundle.status = "existing_outputs_current";
    // Client-facing publicRoutes must always be AURUM URLs — Rubik is the
    // internal rendering engine, never a public link. AURUM's route set is
    // already a superset of Rubik's (landing/webCompleta have no Rubik
    // equivalent at all), so there is nothing legitimate to merge in from
    // existingOutputs.rubik.publicRoutes here.
    responseBundle.publicRoutes = { ...existingOutputs.aurum.publicRoutes };
    responseBundle.warnings = existingOutputReview.overall.safeWarnings;
    return {
      ok: true,
      pullRequests: {},
      idempotencyNotes: ["existing_outputs_current_no_pr_needed"],
      responseBundle,
      existingOutputReview: existingOutputReview.overall,
      status: "existing_outputs_current",
      writeAttempted: false,
      nextStep: "ready_to_validate_public_urls",
    };
  }
 
  const status = hasExistingOutputs ? "existing_outputs_update_required" : "prs_created";
 
  const repoStatus = (preflight as Record<string, unknown>).repos || {};
  const grouped = groupByRepo(plan.generatedFiles);
  const pullRequests: Record<string, { url: string; number: number; branch: string; reused?: boolean }> = {};
 
  for (const [repo, rawFiles] of grouped.entries()) {
    const target = Object.values(plan.targetPRs).find((item: Record<string, unknown>) => item.repo === repo) as Record<string, string> | undefined;
    if (!target) continue;
 
    const repoKey = Object.keys(plan.targetPRs).find((k) => (plan.targetPRs[k] as Record<string, string>).repo === repo);
    const existing = repo === RUBIK_REPO ? existingOutputs.rubik : existingOutputs.aurum;
 
    if (existing.allExist && existingOutputReview[repoKey || "aurum"].passed) {
      idempotencyNotes.push(`${repoKey}_outputs_current_skipped`);
      continue;
    }
 
    const files = hasExistingOutputs ? rawFiles as Array<Record<string, unknown>> : filterGeneratedFilesByExistingOutputs(rawFiles as Array<Record<string, unknown>>, existing);
    if (files.length === 0) {
      idempotencyNotes.push(`${repoKey}_all_files_filtered_skipped`);
      continue;
    }
 
    if (hasExistingOutputs) {
      // In stale/update mode `files` is the full unfiltered set (nothing is
      // dropped — see the ternary above), so every file GitHub already has
      // is about to be overwritten with fresh content. Labeling that
      // "skipped" is actively misleading. Instead, verify it really is in
      // the write set and block if a critical file would otherwise be left
      // stale.
      const writePaths = new Set(files.map((f) => String(f.path)));
      const unupdatedCriticalFiles = existing.skippedFiles.filter((p) => !writePaths.has(p));
      if (unupdatedCriticalFiles.length > 0) {
        return blockedResult(
          unupdatedCriticalFiles.map((p) => `${repoKey}_critical_file_not_updated:${p}`),
          idempotencyNotes,
          existingOutputReview.overall,
        );
      }
    } else {
      for (const skipped of existing.skippedFiles) {
        idempotencyNotes.push(`skipped_existing_file:${repo}:${skipped}`);
      }
    }
 
    const branchInfo = await ensureUpdateBranch(repo, target.headBranch, "main");
    if (branchInfo.refreshed) {
      idempotencyNotes.push(`branch_refreshed:${target.headBranch}->${branchInfo.branch}`);
    }
 
    for (const file of files) {
      await writeFileToRepo(repo, branchInfo.branch, file);
      const info = await getFileInfo(repo, String(file.path), branchInfo.branch);
      if (info.exists && !file.isPatchTarget) idempotencyNotes.push(`file_updated:${String(file.path)}`);
    }
 
    const existingPR = (repoStatus as Record<string, Record<string, unknown>>)[repoKey || ""]?.existingPR as { url: string; number: number } | null;
 
    if (existingPR) {
      pullRequests[repo] = { url: existingPR.url, number: existingPR.number, branch: branchInfo.branch, reused: true };
      idempotencyNotes.push(`pr_reused:#${existingPR.number}`);
    } else {
      const pr = await createPullRequest(
        repo,
        branchInfo.branch,
        "main",
        `[Production Update] ${plan.leadSlug} — ${repoKey === "aurum" ? "Landing, Web Completa & wrappers" : "Visual Experience & Banners"}`,
        `Auto-generated by immersphere-production-orchestrator v${SERVICE_VERSION}\n\nHuman review required. No auto-merge.\n\nExisting outputs review: \`${existingOutputReview[repoKey || "aurum"].status}\`\n\nMismatches: ${existingOutputReview[repoKey || "aurum"].mismatches.join(", ") || "none"}\n\nAsset mode: \`${plan.assetMode || "unknown"}\`\n\nWarnings: ${(plan.generatorWarnings || []).length}`,
      );
      pullRequests[repo] = { url: pr.html_url, number: pr.number, branch: branchInfo.branch };
    }
  }
 
  const responseBundle = buildResponseBundle(plan, pullRequests, createdAt);
  responseBundle.status = status === "prs_created" ? "pr_created" : status;
  responseBundle.warnings = [
    ...(responseBundle.warnings || []),
    ...existingOutputReview.overall.mismatches,
    ...existingOutputReview.overall.criticalWarnings,
    ...idempotencyNotes.filter((n) => n.startsWith("skipped_existing_file:")),
  ];
 
  return {
    ok: true,
    pullRequests,
    idempotencyNotes,
    responseBundle,
    existingOutputReview: existingOutputReview.overall,
    status: Object.keys(pullRequests).length ? status : "existing_outputs_update_required_but_write_blocked",
    writeAttempted: Object.keys(pullRequests).length > 0,
    nextStep: Object.keys(pullRequests).length ? "human_review_required" : "resolve_write_blocker",
  };
}
 
export async function startServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
 
  // NUEVO: inicializa la tabla production_jobs (pipeline G1-G4) una sola
  // vez al arrancar. Si falla, el servidor sigue arrancando igual — el
  // resto de endpoints (incluido todo lo de Casas y Mar) no depende de
  // esto. Solo /api/production/hook-jobs/* y el futuro
  // auto-generate-hook se verían afectados.
  try {
    await ensureProductionJobsSchema();
    logInfo("production_jobs_schema_ready");
  } catch (error) {
    logWarn("production_jobs_schema_init_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
 
  const server = http.createServer(createRequestHandler());
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      logInfo("server_started", { host, port: server.address()?.port || port });
      resolve(server);
    });
  });
}
 
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  startServer();
}
