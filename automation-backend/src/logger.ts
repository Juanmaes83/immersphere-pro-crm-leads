import { sanitizeLog } from "./security.ts";

export function logInfo(message, meta = {}) {
  console.log(JSON.stringify({ level: "info", message: sanitizeLog(message), meta: sanitizeMeta(meta) }));
}

export function logWarn(message, meta = {}) {
  console.warn(JSON.stringify({ level: "warn", message: sanitizeLog(message), meta: sanitizeMeta(meta) }));
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [sanitizeLog(key), sanitizeLog(String(value))]),
  );
}
