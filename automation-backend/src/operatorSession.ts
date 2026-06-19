import crypto from "node:crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "op_session";

const sessions = new Map();

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function operatorAdminToken() {
  return String(process.env.OPERATOR_ADMIN_TOKEN || "").trim();
}

export function isOperatorConsoleEnabled() {
  return String(process.env.OPERATOR_CONSOLE_ENABLED || "true").toLowerCase() !== "false";
}

export function validateOperatorCredential(provided) {
  const expected = operatorAdminToken();
  if (!expected || expected === "change-me-local-only") return false;
  return provided === expected;
}

export function createSession() {
  const sessionId = randomHex(32);
  const csrfToken = randomHex(16);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, { csrfToken, expiresAt });
  return { sessionId, csrfToken, expiresAt };
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function invalidateSession(sessionId) {
  sessions.delete(sessionId);
}

export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const parts = String(cookieHeader).split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return null;
}

export function buildSetCookieHeader(sessionId, expiresAt) {
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
