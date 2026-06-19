import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { buildPrAutomationPlan } from "./buildPrAutomationPlan.ts";
import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import {
  allowedRepos,
  branchExists,
  createBranch,
  createPullRequest,
  findOpenPullRequestByHead,
  getBranchHeadSha,
  getFileInfo,
  putFile,
  sanitizeGithubError,
} from "./githubClient.ts";
import { logInfo, logWarn } from "./logger.ts";
import { MAX_BODY_BYTES, MODE, SERVICE_NAME, SERVICE_VERSION } from "./schemas.ts";
import { buildProposalPackage } from "./proposalPackage.ts";
import { validateProductionPackage } from "./validateProductionPackage.ts";
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

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://juanmaes83.github.io",
];

const rateLimitBuckets = new Map();
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
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Internal-Api-Token,X-Csrf-Token",
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {
    "Access-Control-Allow-Origin": "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Internal-Api-Token,X-Csrf-Token",
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
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
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
    if (req.method === "POST" && !isOperatorEndpoint && !isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
      return;
    }

    if (isRateLimited(req)) {
      sendJson(res, 429, { ok: false, error: "rate_limited" }, headers);
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, mode: MODE }, headers);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/production/capabilities") {
      const enabled = prAutomationEnabled();
      sendJson(res, 200, {
        ok: true,
        version: SERVICE_VERSION,
        mode: MODE,
        dryRunEnabled: true,
        prAutomationAvailable: true,
        prAutomationEnabled: enabled,
        proposalPackageEnabled: proposalPackageEnabled(),
        crmDirectConnection: false,
        operatorConsoleAvailable: isOperatorConsoleEnabled(),
        crmIntakeEnabled: crmIntakeEnabled(),
        writeMode: enabled ? "enabled" : "disabled",
        allowedRepos: allowedRepos(),
      }, headers);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/production/jobs" || url.pathname === "/api/production/jobs/")) {
      sendJson(res, 200, { ok: true, jobs: [...jobs.values()] }, headers);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/production/jobs/")) {
      const jobId = decodeURIComponent(url.pathname.replace("/api/production/jobs/", ""));
      sendJson(res, jobs.has(jobId) ? 200 : 404, jobs.get(jobId) || { ok: false, error: "job_not_found" }, headers);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/github/dispatch-production") {
      logWarn("dispatch-production blocked in v0.1");
      sendJson(res, 200, { ok: false, reason: "disabled_in_v0_1_until_security_review" }, headers);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/production/dry-run") {
      try {
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildDryRunPlan(payload, validation);
        logInfo("dry-run requested", { leadSlug: payload?.lead?.slug || "missing", ok: plan.ok });
        sendJson(res, plan.ok ? 200 : 400, plan, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, {
          ok: false,
          mode: MODE,
          validation: { passed: false, errors: [message], warnings: [] },
          blocked: true,
        }, headers);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/production/pr-plan") {
      try {
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildPrAutomationPlan(payload, validation);
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
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        if (!validation.passed) {
          sendJson(res, 400, { ok: false, validation, blocked: true }, headers);
          return;
        }
        const plan = buildPrAutomationPlan(payload, validation);
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
        const payload = await readJsonBody(req);
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
        const plan = buildPrAutomationPlan(payload, validation);
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
        logInfo("github-preflight requested", { leadSlug: plan.leadSlug, canCreatePRs: preflight.canCreatePRs });
        sendJson(res, preflight.ok ? 200 : 200, preflight, headers);
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
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildPrAutomationPlan(payload, validation);
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
        const result = await createProductionPullRequests(plan, preflight);
        jobs.set(plan.jobId, {
          ok: true,
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          status: "prs_created",
          pullRequests: result.pullRequests,
          timestamp: Date.now(),
        });
        sendJson(res, 200, {
          ok: true,
          mode: "create-prs",
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          writeAttempted: true,
          pullRequests: result.pullRequests,
          idempotencyNotes: result.idempotencyNotes,
          nextStep: "human_review_required",
        }, headers);
      } catch (error) {
        const safeError = sanitizeGithubError(error);
        sendJson(res, 500, { ok: false, mode: "create-prs", writeAttempted: true, status: "error", error: safeError }, headers);
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

      if (url.pathname === "/api/operator/pr-plan") {
        try {
          const payload = await readJsonBody(req);
          const validation = validateProductionPackage(payload);
          const plan = buildPrAutomationPlan(payload, validation);
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
          const payload = await readJsonBody(req);
          const validation = validateProductionPackage(payload);
          if (!validation.passed) {
            sendJson(res, 400, { ok: false, mode: "github-preflight", canCreatePRs: false, blockers: validation.errors }, headers);
            return;
          }
          const plan = buildPrAutomationPlan(payload, validation);
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
          const payload = await readJsonBody(req);
          const validation = validateProductionPackage(payload);
          const plan = buildPrAutomationPlan(payload, validation);
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
          const result = await createProductionPullRequests(plan, preflight);
          jobs.set(plan.jobId, {
            ok: true,
            jobId: plan.jobId,
            leadSlug: plan.leadSlug,
            status: "prs_created",
            pullRequests: result.pullRequests,
            timestamp: Date.now(),
            source: "operator",
          });
          logInfo("operator create-prs success", { leadSlug: plan.leadSlug });
          sendJson(res, 200, {
            ok: true,
            mode: "create-prs",
            jobId: plan.jobId,
            leadSlug: plan.leadSlug,
            writeAttempted: true,
            pullRequests: result.pullRequests,
            idempotencyNotes: result.idempotencyNotes,
            nextStep: "human_review_required",
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

async function createProductionPullRequests(plan, preflight = {}) {
  const grouped = groupByRepo(plan.generatedFiles);
  const pullRequests = {};
  const idempotencyNotes = [];
  const repoStatus = preflight.repos || {};

  for (const [repo, files] of grouped.entries()) {
    const target = Object.values(plan.targetPRs).find((item) => item.repo === repo);
    if (!target) continue;

    const alreadyExists = repoStatus[Object.keys(plan.targetPRs).find((k) => plan.targetPRs[k].repo === repo)]?.branchExists;

    if (!alreadyExists) {
      const fromSha = await getBranchHeadSha(repo, "main");
      await createBranch(repo, target.headBranch, fromSha);
    } else {
      idempotencyNotes.push(`branch_reused:${target.headBranch}`);
    }

    for (const file of files) {
      const info = await getFileInfo(repo, file.path, target.headBranch);
      await putFile(repo, target.headBranch, file.path, file.content, file.message, info.sha || undefined);
      if (info.exists) idempotencyNotes.push(`file_updated:${file.path}`);
    }

    const repoKey = Object.keys(plan.targetPRs).find((k) => plan.targetPRs[k].repo === repo);
    const existingPR = repoStatus[repoKey]?.existingPR;

    if (existingPR) {
      pullRequests[repo] = { url: existingPR.url, number: existingPR.number, branch: target.headBranch, reused: true };
      idempotencyNotes.push(`pr_reused:#${existingPR.number}`);
    } else {
      const pr = await createPullRequest(
        repo,
        target.headBranch,
        "main",
        `Production draft for ${plan.leadSlug}`,
        "Automated v0.3 production draft. Human review required. No auto-merge.",
      );
      pullRequests[repo] = { url: pr.html_url, number: pr.number, branch: target.headBranch };
    }
  }
  return { pullRequests, idempotencyNotes };
}

export function startServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
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
