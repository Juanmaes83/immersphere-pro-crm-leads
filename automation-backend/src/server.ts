import http from "node:http";
import { URL } from "node:url";
import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import { buildPrAutomationPlan } from "./buildPrAutomationPlan.ts";
import { logInfo, logWarn } from "./logger.ts";
import { MAX_BODY_BYTES, MODE, SERVICE_NAME, SERVICE_VERSION } from "./schemas.ts";
import { validateProductionPackage } from "./validateProductionPackage.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://juanmaes83.github.io",
];

const rateLimitBuckets = new Map();

// In-memory job store for Response Bundles (keyed by jobId)
// In production this would be a persistent store; here it survives the process lifetime.
const jobStore = new Map<string, {
  jobId: string;
  leadId: string;
  slug: string;
  responseBundle: Record<string, unknown>;
  createdAt: string;
}>();

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

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    };
  }
  return {
    "Access-Control-Allow-Origin": "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
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

export function createRequestHandler() {
  return async function requestHandler(req, res) {
    const headers = corsHeaders(req);
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (req.method === "POST" && !isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" }, headers);
      return;
    }

    if (isRateLimited(req)) {
      sendJson(res, 429, { ok: false, error: "rate_limited" }, headers);
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");

    // ── GET /health ──────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, mode: MODE }, headers);
      return;
    }

    // ── POST /api/github/dispatch-production (disabled) ──────────────────────
    if (req.method === "POST" && url.pathname === "/api/github/dispatch-production") {
      logWarn("dispatch-production blocked in v0.1");
      sendJson(res, 200, { ok: false, reason: "disabled_in_v0_1_until_security_review" }, headers);
      return;
    }

    // ── POST /api/production/dry-run ─────────────────────────────────────────
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

    // ── POST /api/operator/create-prs ────────────────────────────────────────
    // Generates AURUM + Rubik files, builds PR plans, stores Response Bundle.
    // Does NOT auto-merge. Returns plan + responseBundle for human review.
    if (req.method === "POST" && url.pathname === "/api/operator/create-prs") {
      try {
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildPrAutomationPlan(payload, validation);

        // Store job in memory for later retrieval via response-bundle endpoint
        if (plan.jobId) {
          jobStore.set(plan.jobId, {
            jobId: plan.jobId,
            leadId: plan.leadId,
            slug: plan.leadSlug,
            responseBundle: plan.responseBundle as unknown as Record<string, unknown>,
            createdAt: plan.responseBundle.createdAt,
          });
        }

        logInfo("operator/create-prs requested", {
          leadSlug: plan.leadSlug,
          jobId: plan.jobId,
          ok: plan.ok,
          aurumFiles: String(plan.pullRequests.find((pr) => pr.repo === "aurum")?.files.length ?? 0),
          rubikFiles: String(plan.pullRequests.find((pr) => pr.repo === "rubik")?.files.length ?? 0),
        });

        sendJson(res, plan.ok ? 200 : 400, {
          ok: plan.ok,
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          leadId: plan.leadId,
          mode: "operator",
          source: "railway-operator-create-prs",
          pullRequests: plan.pullRequests.map((pr) => ({
            repo: pr.repo,
            branch: pr.branch,
            title: pr.title,
            fileCount: pr.files.length,
            files: pr.files.map((f) => ({ path: f.path, bytes: f.content.length })),
          })),
          responseBundle: plan.responseBundle,
          validation: { passed: validation.passed, errors: validation.errors, warnings: validation.warnings },
          generatorWarnings: plan.generatorWarnings,
          generatorErrors: plan.generatorErrors,
          validationResult: plan.validationResult,
        }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, {
          ok: false,
          mode: "operator",
          error: message,
        }, headers);
      }
      return;
    }

    // ── POST /api/production/create-prs ─────────────────────────────────────
    // Alias of /api/operator/create-prs for production pipeline compatibility.
    if (req.method === "POST" && url.pathname === "/api/production/create-prs") {
      try {
        const payload = await readJsonBody(req);
        const validation = validateProductionPackage(payload);
        const plan = buildPrAutomationPlan(payload, validation);

        if (plan.jobId) {
          jobStore.set(plan.jobId, {
            jobId: plan.jobId,
            leadId: plan.leadId,
            slug: plan.leadSlug,
            responseBundle: plan.responseBundle as unknown as Record<string, unknown>,
            createdAt: plan.responseBundle.createdAt,
          });
        }

        logInfo("production/create-prs requested", {
          leadSlug: plan.leadSlug,
          jobId: plan.jobId,
          ok: plan.ok,
        });

        sendJson(res, plan.ok ? 200 : 400, {
          ok: plan.ok,
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          leadId: plan.leadId,
          mode: "production",
          source: "railway-operator-create-prs",
          pullRequests: plan.pullRequests.map((pr) => ({
            repo: pr.repo,
            branch: pr.branch,
            title: pr.title,
            fileCount: pr.files.length,
            files: pr.files.map((f) => ({ path: f.path, bytes: f.content.length })),
          })),
          responseBundle: plan.responseBundle,
          validation: { passed: validation.passed, errors: validation.errors, warnings: validation.warnings },
          generatorWarnings: plan.generatorWarnings,
          generatorErrors: plan.generatorErrors,
          validationResult: plan.validationResult,
        }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, {
          ok: false,
          mode: "production",
          error: message,
        }, headers);
      }
      return;
    }

    // ── GET /api/operator/response-bundle/:jobId ─────────────────────────────
    // Returns the stored Response Bundle for a given jobId.
    const responseBundleMatch = url.pathname.match(/^\/api\/operator\/response-bundle\/([a-z0-9_-]+)$/i);
    if (req.method === "GET" && responseBundleMatch) {
      const jobId = responseBundleMatch[1];
      const job = jobStore.get(jobId);
      if (!job) {
        sendJson(res, 404, {
          ok: false,
          error: "job_not_found",
          jobId,
          hint: "jobId must match a previous /api/operator/create-prs or /api/production/create-prs call in this session",
        }, headers);
        return;
      }
      logInfo("response-bundle retrieved", { jobId, leadId: job.leadId, slug: job.slug });
      sendJson(res, 200, {
        ok: true,
        jobId: job.jobId,
        leadId: job.leadId,
        slug: job.slug,
        responseBundle: job.responseBundle,
        retrievedAt: new Date().toISOString(),
      }, headers);
      return;
    }

    // ── POST /api/crm/import-response-bundle ─────────────────────────────────
    // CRM calls this after receiving a Response Bundle to register the import.
    if (req.method === "POST" && url.pathname === "/api/crm/import-response-bundle") {
      try {
        const body = await readJsonBody(req);
        const leadId = typeof body?.leadId === "string" ? body.leadId : null;
        const responseBundle = body?.responseBundle;

        if (!leadId) {
          sendJson(res, 400, { ok: false, error: "leadId_required" }, headers);
          return;
        }
        if (!responseBundle || typeof responseBundle !== "object") {
          sendJson(res, 400, { ok: false, error: "responseBundle_required_object" }, headers);
          return;
        }

        const bundleStatus = typeof responseBundle.status === "string" ? responseBundle.status : "unknown";
        const importStatus = bundleStatus === "published" ? "published" : "publication_pending";
        const warnings: string[] = [];

        if (bundleStatus === "dry_run_ok") {
          warnings.push("responseBundle.status is dry_run_ok — PRs not yet merged. Publication pending.");
        }
        if (bundleStatus === "needs_manual_merge") {
          warnings.push("responseBundle.status is needs_manual_merge — merge required before publication.");
        }
        if (bundleStatus === "failed") {
          warnings.push("responseBundle.status is failed — check errors before importing.");
        }

        const jobId = typeof responseBundle.jobId === "string" ? responseBundle.jobId : null;
        if (jobId) {
          // Update stored job with CRM import timestamp
          const existing = jobStore.get(jobId);
          if (existing) {
            jobStore.set(jobId, {
              ...existing,
              responseBundle: {
                ...existing.responseBundle,
                crmImportedAt: new Date().toISOString(),
                crmLeadId: leadId,
              },
            });
          }
        }

        logInfo("crm/import-response-bundle", { leadId, jobId: jobId || "none", importStatus });

        sendJson(res, 200, {
          ok: true,
          leadId,
          imported: true,
          status: importStatus,
          jobId,
          warnings,
        }, headers);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request_failed";
        sendJson(res, message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: message,
        }, headers);
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" }, headers);
  };
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
