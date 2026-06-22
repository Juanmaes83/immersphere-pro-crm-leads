import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../src/server.ts";

async function withServer(env, run) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const server = await startServer({ port: 0 });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function duly() {
  return {
    website: "https://dulyinvestment.com/contacto/",
    auditVersion: "3.3",
    status: "success",
    httpStatus: 200,
    score: 84,
    pagesReviewed: 8,
    urlsReviewed: [{ url: "https://dulyinvestment.com/", pageType: "home", selectedReason: "home_page", httpStatus: 200, imageCandidateCount: 27, contactSignalCount: 6 }],
    weaknesses: ["No se detecta WhatsApp visible."],
    opportunities: ["Convertir propiedades destacadas en experiencias inmersivas medibles."],
    recommendedService: "Pack Inmobiliaria 360",
    rawAudit: { auditVersion: "3.3" },
  };
}

// ── Sin DATABASE_URL / CRM_PERSISTENCE_TOKEN: 503 controlado, resto intacto ──

test("8A: sin DATABASE_URL ni CRM_PERSISTENCE_TOKEN, POST devuelve 503 controlado", async () => {
  await withServer({ DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(duly()),
    });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_not_configured");
  });
});

test("8A: sin DATABASE_URL ni CRM_PERSISTENCE_TOKEN, GET latest devuelve 503 controlado", async () => {
  await withServer({ DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs/latest`);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_not_configured");
  });
});

test("8A: sin persistencia configurada, /health sigue respondiendo normal", async () => {
  await withServer({ DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
  });
});

test("8A: sin persistencia configurada, /api/production/capabilities sigue funcionando", async () => {
  await withServer({ DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/production/capabilities`);
    assert.equal(res.status, 200);
  });
});

// ── Configurado pero sin token correcto: 401 ──────────────────────────────
// DATABASE_URL apunta a un host inalcanzable a propósito - basta para pasar
// isCrmPersistenceConfigured() (solo comprueba presencia, no validez) sin
// necesitar Postgres real para probar la capa de autenticación.

const FAKE_DB_URL = "postgres://test:test@127.0.0.1:1/nonexistent";

test("8A: configurado, POST sin header de token devuelve 401", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(duly()),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, "unauthorized");
  });
});

test("8A: configurado, GET latest sin header de token devuelve 401", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs/latest`);
    assert.equal(res.status, 401);
  });
});

test("8A: configurado, token incorrecto devuelve 401", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "wrong-token" },
      body: JSON.stringify(duly()),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, "unauthorized");
  });
});

// ── Token correcto: validaciones de leadId / payload ──────────────────────

test("8A: token correcto, leadId negativo devuelve 400", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/-1/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(duly()),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "lead_id_must_be_positive_integer");
  });
});

test("8A: token correcto, leadId 0 devuelve 400", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/0/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(duly()),
    });
    assert.equal(res.status, 400);
  });
});

test("8A: token correcto, leadId texto devuelve 400", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/abc/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(duly()),
    });
    assert.equal(res.status, 400);
  });
});

test("8A: token correcto, leadId válido, website con esquema javascript: devuelve 400", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify({ ...duly(), website: "javascript:alert(1)" }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, "invalid_payload");
    assert.ok(body.details.includes("website_must_be_http_or_https_url"));
  });
});

test("8A: token correcto, leadId válido, urlsReviewed con file: devuelve 400", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const payload = duly();
    payload.urlsReviewed = [{ url: "file:///etc/passwd" }];
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
  });
});

// ── Token correcto, leadId válido, payload válido, pero Postgres inalcanzable:
// 503 persistence_unavailable (conexión real intentada y fallida, sin
// necesitar un Postgres que funcione) ──────────────────────────────────────

test("8A: todo válido pero Postgres inalcanzable devuelve 503 persistence_unavailable (no 500)", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(duly()),
    });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_unavailable");
  });
}, { timeout: 10000 });

test("8A: GET latest con Postgres inalcanzable devuelve 503 persistence_unavailable", async () => {
  await withServer({ DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token" }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs/latest`, {
      headers: { "X-CRM-Persistence-Token": "real-token" },
    });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_unavailable");
  });
}, { timeout: 10000 });

// ── CORS ───────────────────────────────────────────────────────────────────

test("8A: CORS allow-list incluye X-CRM-Persistence-Token para origin permitido", async () => {
  await withServer({ DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "OPTIONS",
      headers: { Origin: "https://juanmaes83.github.io", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get("access-control-allow-headers").includes("X-CRM-Persistence-Token"));
    assert.ok(res.headers.get("access-control-allow-methods").includes("POST"));
  });
});
