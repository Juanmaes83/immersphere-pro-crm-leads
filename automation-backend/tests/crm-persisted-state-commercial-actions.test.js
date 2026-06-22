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

const FAKE_DB_URL = "postgres://test:test@127.0.0.1:1/nonexistent";
const ENV_FULL = { DATABASE_URL: FAKE_DB_URL, CRM_PERSISTENCE_TOKEN: "real-token", INTERNAL_API_TOKEN: "some-internal-token" };
const ENV_UNCONFIGURED = { DATABASE_URL: undefined, CRM_PERSISTENCE_TOKEN: undefined };

function action(overrides = {}) {
  return {
    actionType: "copied_whatsapp",
    hookId: "visualExperience",
    hookType: "visualExperience",
    channel: "whatsapp",
    status: "recorded",
    messageSnapshot: "Hola, he preparado una propuesta...",
    metadata: { leadName: "Duly Investment" },
    ...overrides,
  };
}

// ── persisted-state aggregator (8E) ────────────────────────────────────────

test("8E: GET persisted-state sin DB/token devuelve 503 controlado", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/persisted-state`);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_not_configured");
  });
});

test("8E: GET persisted-state sin token devuelve 401", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/persisted-state`);
    assert.equal(res.status, 401);
  });
});

test("8E: GET persisted-state con token incorrecto devuelve 401", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/persisted-state`, { headers: { "X-CRM-Persistence-Token": "wrong" } });
    assert.equal(res.status, 401);
  });
});

test("8E: GET persisted-state con leadId invalido devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/abc/persisted-state`, { headers: { "X-CRM-Persistence-Token": "real-token" } });
    assert.equal(res.status, 400);
  });
});

test("8E: GET persisted-state con token correcto -> 503 persistence_unavailable (Postgres inalcanzable, no 500)", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/persisted-state`, { headers: { "X-CRM-Persistence-Token": "real-token" } });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_unavailable");
  });
});

test("8E: CORS preflight de persisted-state incluye X-CRM-Persistence-Token", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/persisted-state`, {
      method: "OPTIONS",
      headers: { Origin: "https://juanmaes83.github.io", "Access-Control-Request-Method": "GET" },
    });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get("access-control-allow-headers").includes("X-CRM-Persistence-Token"));
  });
});

// ── commercial-actions ──────────────────────────────────────────────────────

test("8E: POST commercial-actions sin DB/token devuelve 503 controlado", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action()) });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_not_configured");
  });
});

test("8E: GET commercial-actions sin DB/token devuelve 503 controlado", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`);
    assert.equal(res.status, 503);
  });
});

test("8E: POST commercial-actions sin token devuelve 401 (no bloqueado por INTERNAL_API_TOKEN)", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action()) });
    assert.equal(res.status, 401);
  });
});

test("8E: POST commercial-actions con token incorrecto devuelve 401", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "wrong" },
      body: JSON.stringify(action()),
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, "unauthorized");
  });
});

test("8E: POST commercial-actions con leadId invalido devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/-5/commercial-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(action()),
    });
    assert.equal(res.status, 400);
  });
});

test("8E: POST commercial-actions con actionType invalido devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(action({ actionType: "send_automatically_to_everyone" })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.some((d) => d.startsWith("actionType_must_be_one_of")));
  });
});

for (const validType of ["copied_whatsapp", "copied_email", "opened_whatsapp", "opened_email", "sent_manual", "followup_needed"]) {
  test(`8E: POST commercial-actions con actionType '${validType}' valido -> 503 persistence_unavailable (no 400, no 500)`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
        body: JSON.stringify(action({ actionType: validType })),
      });
      assert.equal(res.status, 503);
    });
  });
}

test("8E: GET commercial-actions con token correcto -> 503 persistence_unavailable (no 500)", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, { headers: { "X-CRM-Persistence-Token": "real-token" } });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error, "persistence_unavailable");
  });
});

test("8E: CORS preflight de commercial-actions incluye X-CRM-Persistence-Token", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/commercial-actions`, {
      method: "OPTIONS",
      headers: { Origin: "https://juanmaes83.github.io", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(res.status, 204);
    assert.ok(res.headers.get("access-control-allow-headers").includes("X-CRM-Persistence-Token"));
  });
});

// ── confirmar que 8A-8D y el resto del backend siguen intactos ────────────

test("8E: /health no se rompe", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
  });
});

test("8E: /api/production/capabilities no se rompe", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/production/capabilities`);
    assert.equal(res.status, 200);
  });
});

test("8E: audit-runs (8A) sigue intacto y no bloqueado por la nueva ruta commercial-actions", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/audit-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify({ website: "https://dulyinvestment.com/", auditVersion: "3.3", status: "success" }),
    });
    assert.equal(res.status, 503); // persistence_unavailable, never 401/404
  });
});
