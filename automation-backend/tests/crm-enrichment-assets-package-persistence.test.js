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

function dulyEnrichment() {
  return {
    website: "https://dulyinvestment.com/",
    webHasWhatsapp: false,
    crmHasWhatsapp: false,
    whatsappLinks: [],
    emails: [{ value: "info@dulyinvestment.com" }],
    phones: [{ value: "+34000000000" }],
    socialLinks: [{ value: "https://www.instagram.com/dulyinvestment" }],
    videoLinks: [],
    documentLinks: [],
    forms: [],
    contactPages: [{ url: "https://dulyinvestment.com/contacto/" }],
    propertyPages: [],
    pagesReviewed: 8,
    pageDiscovery: { pagesReviewed: 8, urlsReviewed: [] },
    logoCandidates: [],
    imageCandidates: [],
    contactSignals: [],
    warnings: [],
    confidence: "media",
    rawEnrichmentProfile: { schemaVersion: "enrichment-profile/1.0" },
  };
}

function dulyAssets(overrides = {}) {
  return {
    logoUrl: "https://dulyinvestment.com/logo.png",
    heroUrl: "https://dulyinvestment.com/hero.jpg",
    imageUrls: [
      "https://dulyinvestment.com/img1.jpg",
      "https://dulyinvestment.com/img2.jpg",
      "https://dulyinvestment.com/img3.jpg",
      "https://dulyinvestment.com/img4.jpg",
    ],
    approvedAssets: { logo: { url: "https://dulyinvestment.com/logo.png" }, hero: {}, images: [] },
    assetsApproved: true,
    approvedAt: new Date().toISOString(),
    approvedBy: "operator",
    source: "crm",
    ...overrides,
  };
}

function dulyPackage(overrides = {}) {
  return {
    packageVersion: "v5",
    status: "ready",
    stale: false,
    validationErrors: [],
    hooks: { visualExperience: {}, landingPage: {}, fullWebDemo: { heroVideoMotion: true }, bannerPack: {} },
    routes: { landing: "https://aurum-properties-boutique.vercel.app/duly-investment" },
    targetRepos: { rubik: "Juanmaes83/Rubik-Sota-Director-de-Orquesta", aurum: "Juanmaes83/AURUM_PROPERTIES_BOUTIQUE" },
    packagePayload: { lead: { id: "30", name: "Duly Investment" } },
    ...overrides,
  };
}

const RESOURCES = [
  { label: "8B enrichment-profiles", postPath: "/api/crm/leads/30/enrichment-profiles", latestPath: "/api/crm/leads/30/enrichment-profiles/latest", payload: dulyEnrichment, recordKey: "enrichmentProfile" },
  { label: "8C approved-media-assets", postPath: "/api/crm/leads/30/approved-media-assets", latestPath: "/api/crm/leads/30/approved-media-assets/latest", payload: dulyAssets, recordKey: "approvedMediaAssets" },
  { label: "8D production-packages", postPath: "/api/crm/leads/30/production-packages", latestPath: "/api/crm/leads/30/production-packages/latest", payload: dulyPackage, recordKey: "productionPackage" },
];

for (const r of RESOURCES) {
  test(`${r.label}: sin DB/token configurados, POST y GET devuelven 503 controlado`, async () => {
    await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
      const postRes = await fetch(`${baseUrl}${r.postPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.payload()) });
      const postBody = await postRes.json();
      assert.equal(postRes.status, 503);
      assert.equal(postBody.error, "persistence_not_configured");

      const getRes = await fetch(`${baseUrl}${r.latestPath}`);
      const getBody = await getRes.json();
      assert.equal(getRes.status, 503);
      assert.equal(getBody.error, "persistence_not_configured");
    });
  });

  test(`${r.label}: configurado, POST sin token devuelve 401`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.postPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.payload()) });
      assert.equal(res.status, 401);
    });
  });

  test(`${r.label}: configurado, GET latest sin token devuelve 401`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.latestPath}`);
      assert.equal(res.status, 401);
    });
  });

  test(`${r.label}: configurado, token incorrecto devuelve 401 (no bloqueado por INTERNAL_API_TOKEN tampoco)`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.postPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "wrong-token" },
        body: JSON.stringify(r.payload()),
      });
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.error, "unauthorized");
    });
  });

  test(`${r.label}: token correcto, leadId invalido (negativo) devuelve 400`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.postPath.replace("/30/", "/-1/")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
        body: JSON.stringify(r.payload()),
      });
      assert.equal(res.status, 400);
    });
  });

  test(`${r.label}: token correcto, payload valido de Duly -> 503 persistence_unavailable (Postgres inalcanzable, no 500)`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.postPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
        body: JSON.stringify(r.payload()),
      });
      const body = await res.json();
      assert.equal(res.status, 503);
      assert.equal(body.error, "persistence_unavailable");
    });
  });

  test(`${r.label}: GET latest con token correcto -> 503 persistence_unavailable (Postgres inalcanzable, no 500)`, async () => {
    await withServer(ENV_FULL, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.latestPath}`, { headers: { "X-CRM-Persistence-Token": "real-token" } });
      const body = await res.json();
      assert.equal(res.status, 503);
      assert.equal(body.error, "persistence_unavailable");
    });
  });

  test(`${r.label}: CORS preflight incluye X-CRM-Persistence-Token`, async () => {
    await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
      const res = await fetch(`${baseUrl}${r.postPath}`, {
        method: "OPTIONS",
        headers: { Origin: "https://juanmaes83.github.io", "Access-Control-Request-Method": "POST" },
      });
      assert.equal(res.status, 204);
      assert.ok(res.headers.get("access-control-allow-headers").includes("X-CRM-Persistence-Token"));
    });
  });
}

// ── Validaciones de URL peligrosa por recurso ──────────────────────────────

test("8B: website con javascript: devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/enrichment-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify({ ...dulyEnrichment(), website: "javascript:alert(1)" }),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("website_must_be_http_or_https_url_or_empty"));
  });
});

test("8B: socialLinks con data: devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const payload = dulyEnrichment();
    payload.socialLinks = [{ value: "data:text/html,x" }];
    const res = await fetch(`${baseUrl}/api/crm/leads/30/enrichment-profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 400);
  });
});

test("8C: logoUrl con file: devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/approved-media-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyAssets({ logoUrl: "file:///etc/passwd" })),
    });
    assert.equal(res.status, 400);
  });
});

test("8C: assetsApproved true sin logoUrl devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/approved-media-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyAssets({ logoUrl: null })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("assetsApproved_true_requires_logoUrl"));
  });
});

test("8C: assetsApproved true sin imagenes devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/approved-media-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyAssets({ imageUrls: [] })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("assetsApproved_true_requires_at_least_1_image"));
  });
});

test("8C: assetsApproved false sin nada es valido (503 por Postgres inalcanzable, no 400)", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/approved-media-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify({ assetsApproved: false }),
    });
    assert.equal(res.status, 503);
  });
});

test("8D: routes con localhost devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/production-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyPackage({ routes: { landing: "http://localhost:3000/duly" } })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("routes_contains_localhost_url"));
  });
});

test("8D: routes con gesture-lab devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/production-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyPackage({ routes: { landing: "https://aurum-properties-boutique.vercel.app/gesture-lab/duly" } })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("routes_contains_gesture_lab_path"));
  });
});

test("8D: status ready con stale true devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/production-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyPackage({ stale: true })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("status_ready_requires_stale_false"));
  });
});

test("8D: status ready con validationErrors no vacio devuelve 400", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/production-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyPackage({ validationErrors: ["lead.website: required_string"] })),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.details.includes("status_ready_requires_empty_validationErrors"));
  });
});

test("8D: status draft con stale true es valido (503 por Postgres inalcanzable, no 400)", async () => {
  await withServer(ENV_FULL, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/crm/leads/30/production-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Persistence-Token": "real-token" },
      body: JSON.stringify(dulyPackage({ status: "draft", stale: true })),
    });
    assert.equal(res.status, 503);
  });
});

// ── Confirmar que /health y /api/production/capabilities siguen intactos ──

test("8B/8C/8D: /health no se rompe con persistencia sin configurar", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
  });
});

test("8B/8C/8D: /api/production/capabilities no se rompe", async () => {
  await withServer(ENV_UNCONFIGURED, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/production/capabilities`);
    assert.equal(res.status, 200);
  });
});
