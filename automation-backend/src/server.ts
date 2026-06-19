import http from "node:http";
import { URL } from "node:url";
import { buildPrAutomationPlan } from "./buildPrAutomationPlan.ts";
import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import { allowedRepos, createBranch, createPullRequest, getBranchHeadSha, putFile, sanitizeGithubError } from "./githubClient.ts";
import { logInfo, logWarn } from "./logger.ts";
import { MAX_BODY_BYTES, MODE, SERVICE_NAME, SERVICE_VERSION } from "./schemas.ts";
import { buildProposalPackage } from "./proposalPackage.ts";
import { validateProductionPackage } from "./validateProductionPackage.ts";

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

function prAutomationEnabled() {
  return String(process.env.GITHUB_PR_AUTOMATION_ENABLED || "false").toLowerCase() === "true";
}

function proposalPackageEnabled() {
  return String(process.env.PROPOSAL_PACKAGE_ENABLED || "true").toLowerCase() !== "false";
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
        const result = await createProductionPullRequests(plan);
        jobs.set(plan.jobId, {
          ok: true,
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          status: "prs_created",
          pullRequests: result.pullRequests,
        });
        sendJson(res, 200, {
          ok: true,
          mode: "create-prs",
          jobId: plan.jobId,
          leadSlug: plan.leadSlug,
          writeAttempted: true,
          pullRequests: result.pullRequests,
          nextStep: "human_review_required",
        }, headers);
      } catch (error) {
        const safeError = sanitizeGithubError(error);
        sendJson(res, 500, { ok: false, mode: "create-prs", writeAttempted: true, status: "error", error: safeError }, headers);
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" }, headers);
  };
}

async function createProductionPullRequests(plan) {
  const grouped = Map.groupBy(plan.generatedFiles, (file) => file.repo);
  const pullRequests = {};
  for (const [repo, files] of grouped.entries()) {
    const target = Object.values(plan.targetPRs).find((item) => item.repo === repo);
    const fromSha = await getBranchHeadSha(repo, "main");
    await createBranch(repo, target.headBranch, fromSha);
    for (const file of files) {
      await putFile(repo, target.headBranch, file.path, file.content, file.message);
    }
    const pr = await createPullRequest(
      repo,
      target.headBranch,
      "main",
      `Production draft for ${plan.leadSlug}`,
      "Automated v0.2 production draft. Human review required. No auto-merge.",
    );
    pullRequests[repo] = { url: pr.html_url, number: pr.number, branch: target.headBranch };
  }
  return { pullRequests };
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
