// Fase 8A: minimal pg Pool wrapper. No ORM, no codegen step - matches this
// backend's existing zero-build-tooling philosophy (npm run build is just
// `node --check` on every source file, nothing compiles).
//
// Safe by construction when DATABASE_URL is absent: getPool() returns null
// instead of throwing, so callers (crmPersistence.ts) can return a
// controlled 503 instead of crashing. Nothing in here runs at import time -
// the Pool is only created lazily, on first real use.
import pg from "pg";

let pool = null;

export function isDatabaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function getPool() {
  if (!isDatabaseConfigured()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const p = getPool();
  if (!p) throw new Error("database_not_configured");
  return p.query(text, params);
}
