import http from "node:http";
import { URL } from "node:url";
import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import { logInfo, logWarn } from "./logger.ts";
import { MAX_BODY_BYTES, MODE, SERVICE_NAME, SERVICE_VERSION } from "./schemas.ts";
import { validateProductionPackage } from "./validateProductionPackage.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://juanmaes83.github.io",
];

const rateLimitBuckets = new Map();

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

    if (isRateLimited(req)) {
      sendJson(res, 429, { ok: false, error: "rate_limited" }, headers);
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION, mode: MODE }, headers);
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

    sendJson(res, 404, { ok: false, error: "not_found" }, headers);
  };
}

export function startServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 8787);
  const host = options.host ?? "127.0.0.1";
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
