import assert from "node:assert/strict";
import test from "node:test";
import { buildAurumFiles, buildRubikFiles } from "../src/fileGenerators.ts";
import { startServer } from "../src/server.ts";
import { SERVICE_VERSION } from "../src/schemas.ts";

function validPayload(overrides = {}) {
  const slug = overrides.slug || "torrevieja-sur";
  return {
    lead: {
      id: "lead_" + slug.replace(/-/g, "_"),
      name: slug.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
      slug,
      sector: "Inmobiliaria",
      zone: "Torrevieja",
      website: "https://example.com",
      email: "hola@example.com",
      phone: "+34000000000",
    },
    audit: {
      status: "complete",
      pagesReviewed: ["https://example.com"],
      signals: { responsive: true },
      opportunities: ["Experiencia visual de propiedad"],
      weaknesses: ["Sin tour inmersivo"],
      ...overrides.audit,
    },
    auditSnapshot: {
      available: true,
      status: "success",
      score: 56,
      ...overrides.auditSnapshot,
    },
    leadIntelligenceProfile: {
      readinessScore: 64,
      ...overrides.leadIntelligenceProfile,
    },
    assets: {
      logo: null,
      favicon: null,
      images: ["https://example.com/image.jpg"],
      video: null,
      status: "candidate",
    },
    mediaAssets: {
      logo: { url: "https://cdn.example.com/logo.png", source: "manual", status: "approved" },
      favicon: { url: "https://cdn.example.com/favicon.ico", status: "candidate" },
      heroImage: { url: "https://cdn.example.com/hero.jpg", source: "manual", status: "approved" },
      propertyImages: [
        { url: "https://cdn.example.com/gallery-1.jpg", source: "manual", status: "approved", recommendedUse: "hero" },
        { url: "https://cdn.example.com/gallery-2.jpg", source: "manual", status: "approved", recommendedUse: "gallery" },
      ],
      videos: [{ url: "/VIDEO_AURUM_HEROWEB.mp4", source: "aurum_default", status: "approved", recommendedUse: "hero" }],
      brandColors: ["#111111", "#d8b46a"],
      notes: ["Assets require final rights review before production."],
    },
    targetRoutes: {
      visualExperience: `https://aurum-properties-boutique.vercel.app/visual-experience/${slug}`,
      landing: `https://aurum-properties-boutique.vercel.app/${slug}`,
      webCompleta: `https://aurum-properties-boutique.vercel.app/${slug}-web-completa`,
      bannerPack: `https://aurum-properties-boutique.vercel.app/banners/${slug}`,
      bannerVertical: `https://aurum-properties-boutique.vercel.app/banners/${slug}/vertical`,
      bannerHorizontal: `https://aurum-properties-boutique.vercel.app/banners/${slug}/horizontal`,
    },
    hooks: { visualExperience: {}, landingPage: {}, fullWebDemo: { heroVideoMotion: true }, bannerPack: {} },
    rules: { clientFacingDomain: "aurum-properties-boutique.vercel.app", internalEngine: "rubik-sota-director-de-orquesta.vercel.app", noGeneratedWithout200: true },
    ...overrides.patch,
  };
}

function buildGithubFetchMock(t, options = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const existingFiles = options.existingFiles || new Set();
  const existingRoutes = options.existingRoutes || {};
  const fileContents = options.fileContents || {};

  function getFileContent(path) {
    if (Object.prototype.hasOwnProperty.call(fileContents, path)) {
      return String(fileContents[path] ?? "");
    }
    return "existing";
  }

  globalThis.fetch = async (url, fetchOptions = {}) => {
    const u = String(url);
    if (u.includes("127.0.0.1") || u.includes("localhost")) {
      return originalFetch(url, fetchOptions);
    }
    calls.push({ url: u, method: fetchOptions.method || "GET", body: fetchOptions.body });

    function resp(payload, status = 200) {
      const body = JSON.stringify(payload);
      return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
    }

    if (u.includes("/repos/") && !u.includes("/git/") && !u.includes("/pulls") && !u.includes("/contents/")) {
      return resp({ default_branch: "main" });
    }
    if (u.includes("/git/ref/heads/")) {
      if (u.endsWith("/main")) return resp({ object: { sha: "mainsha123" } });
      return resp({ message: "Not Found" }, 404);
    }
    if (u.includes("/git/refs") && fetchOptions.method === "POST") {
      return resp({ ref: "refs/heads/production/test" }, 201);
    }
    if (u.includes("/contents/") && (!fetchOptions.method || fetchOptions.method === "GET")) {
      const pathMatch = u.match(/\/contents\/(.+?)\?/);
      const filePath = pathMatch ? decodeURIComponent(pathMatch[1]) : "";
      if (Object.prototype.hasOwnProperty.call(fileContents, filePath)) {
        return resp({ content: Buffer.from(getFileContent(filePath)).toString("base64"), sha: "filesha" });
      }
      if (filePath === "vercel.json") {
        const rewrites = (existingRoutes.rubikRewrites || []).map((r) => ({ source: r, destination: `/dynamic-motion-banner/${existingRoutes.slug}/banner-vertical.html` }));
        return resp({ content: Buffer.from(JSON.stringify({ rewrites }, null, 2)).toString("base64"), sha: "vercelsha" });
      }
      if (filePath === "src/App.tsx") {
        const routes = (existingRoutes.aurumRoutes || []).map((r) => `<Route path="${r}" element={<div />} />`);
        return resp({ content: Buffer.from(routes.join("\n")).toString("base64"), sha: "appsha" });
      }
      if (existingFiles.has(filePath)) {
        return resp({ content: Buffer.from(getFileContent(filePath)).toString("base64"), sha: "filesha" });
      }
      return resp({ message: "Not Found" }, 404);
    }
    if (u.includes("/contents/") && fetchOptions.method === "PUT") {
      return resp({ content: { sha: "filesha" } }, 201);
    }
    if (u.includes("/pulls") && (!fetchOptions.method || fetchOptions.method === "GET")) {
      return resp([], 200);
    }
    if (u.includes("/pulls") && fetchOptions.method === "POST") {
      const isAurum = u.includes("AURUM");
      return resp({ number: isAurum ? 42 : 43, html_url: `https://github.com/${isAurum ? "AURUM" : "Rubik"}/pull/${isAurum ? 42 : 43}` }, 201);
    }
    return resp({ message: "not mocked" }, 404);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return { calls };
}

async function withServer(run) {
  const server = await startServer({ port: 0 });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseUrl, path, payload, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

// ─── Bloqueador 1: manifests interpolan SERVICE_VERSION ───────────────────────

test("fileGenerators: manifests interpolan SERVICE_VERSION real", () => {
  const payload = validPayload({ slug: "version-check-lead" });
  const rubik = buildRubikFiles(payload);
  const aurum = buildAurumFiles(payload);
  const rubikManifest = rubik.files.find((f) => f.path === "production-manifests/version-check-lead.json");
  const aurumManifest = aurum.files.find((f) => f.path === "production-manifests/version-check-lead.json");
  assert.ok(rubikManifest, "rubik manifest generado");
  assert.ok(aurumManifest, "aurum manifest generado");
  assert.ok(rubikManifest.content.includes(`v${SERVICE_VERSION}`), `rubik manifest contiene v${SERVICE_VERSION}`);
  assert.ok(aurumManifest.content.includes(`v${SERVICE_VERSION}`), `aurum manifest contiene v${SERVICE_VERSION}`);
  assert.doesNotMatch(rubikManifest.content, /v\$\{SERVICE_VERSION\}/, "rubik manifest no contiene literal ${SERVICE_VERSION}");
  assert.doesNotMatch(aurumManifest.content, /v\$\{SERVICE_VERSION\}/, "aurum manifest no contiene literal ${SERVICE_VERSION}");
});

// ─── Bloqueador 2: import-response-bundle acepta nuevos statuses ──────────────

test("import-response-bundle acepta status existing_outputs_current", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/crm/import-response-bundle", {
      leadId: "lead_test",
      responseBundle: {
        schemaVersion: "operator-response-bundle/1.0",
        jobId: "pr_test",
        leadId: "test",
        slug: "test",
        status: "existing_outputs_current",
        source: "railway-operator-create-prs",
        pullRequests: { aurum: null, rubik: null, crm: null },
        plannedPublicRoutes: {},
        publicRoutes: {},
        assetMode: "client_real_asset",
        warnings: [],
        errors: [],
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "publication_pending");
  });
});

test("import-response-bundle acepta status existing_outputs_update_required", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/crm/import-response-bundle", {
      leadId: "lead_test",
      responseBundle: {
        schemaVersion: "operator-response-bundle/1.0",
        jobId: "pr_test",
        leadId: "test",
        slug: "test",
        status: "existing_outputs_update_required",
        source: "railway-operator-create-prs",
        pullRequests: { aurum: { url: "https://github.com/AURUM/pull/42", number: 42, branch: "production/test" }, rubik: null, crm: null },
        plannedPublicRoutes: {},
        publicRoutes: {},
        assetMode: "client_real_asset",
        warnings: [],
        errors: [],
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "publication_pending");
  });
});

// ─── Bloqueador 3: App.tsx realista detecta WebCompleta y placeholders ────────

test("create-prs detecta App.tsx realista con Sandhouse* componentes y placeholder", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const slug = "sandhouse-inmobiliaria";
  const existingFiles = new Set([
    `dynamic-motion-banner/${slug}/index.html`,
    `dynamic-motion-banner/${slug}/banner-vertical.html`,
    `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    `dynamic-motion-banner/${slug}/banner-pack/index.html`,
    `production-manifests/${slug}.json`,
    "src/App.tsx",
    `src/data/clientDemos/sandhouse.ts`,
    "src/SandhouseWebCompleta.tsx",
    "vercel.json",
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const fileContents = {
    "src/App.tsx": `
import { SandhouseLanding } from "./SandhouseLanding";
import { SandhouseWebCompleta } from "./SandhouseWebCompleta";
import { SandhouseVisualExperience } from "./SandhouseVisualExperience";
import { SandhouseBannerPack } from "./SandhouseBannerPack";

export function App() {
  return (
    <Routes>
      <Route path="/${slug}" element={<SandhouseLanding />} />
      <Route path="/${slug}-web-completa" element={<SandhouseWebCompleta />} />
      <Route path="/visual-experience/${slug}" element={<SandhouseVisualExperience />} />
      <Route path="/banners/${slug}" element={<SandhouseBannerPack />} />
    </Routes>
  );
}
`,
    "src/SandhouseWebCompleta.tsx": `export function SandhouseWebCompleta() { return <div>Internal draft — Propiedad de ejemplo</div>; }`,
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      clientName: "Sandhouse Inmobiliaria",
      generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
      },
    }, null, 2),
    [`dynamic-motion-banner/${slug}/index.html`]: `<!doctype html><html><body>Banner</body></html>`,
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 35 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
  };

  buildGithubFetchMock(t, { existingFiles, existingRoutes, fileContents });

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug }));
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.equal(body.status, "existing_outputs_update_required");
      assert.ok(body.existingOutputReview.mismatches.some((m) => m.includes("placeholder")), "detecta placeholder en WebCompleta");
      const allWarnings = [...body.existingOutputReview.mismatches, ...body.existingOutputReview.criticalWarnings];
      assert.ok(allWarnings.some((m) => m.includes("client_facing_dangerous_copy") || m.includes("Internal draft")), "detecta Internal draft");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Bloqueador 4: score review lee múltiples fuentes y claves ────────────────

test("create-prs detecta score mismatch desde auditSnapshot.score y digitalPresenceScore", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const slug = "sandhouse-inmobiliaria";
  const existingFiles = new Set([
    `dynamic-motion-banner/${slug}/index.html`,
    `dynamic-motion-banner/${slug}/banner-vertical.html`,
    `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    `dynamic-motion-banner/${slug}/banner-pack/index.html`,
    `production-manifests/${slug}.json`,
    "src/App.tsx",
    `src/data/clientDemos/sandhouse.ts`,
    "vercel.json",
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const fileContents = {
    "src/App.tsx": existingRoutes.aurumRoutes.map((r) => `<Route path="${r}" element={<div />} />`).join("\n"),
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
      },
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 88, readinessScore: 90 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
  };

  buildGithubFetchMock(t, { existingFiles, existingRoutes, fileContents });

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      payload.auditSnapshot = { available: true, status: "success", score: 56 };
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      const scoreMismatches = body.existingOutputReview.mismatches.filter((m) => m.startsWith("score_mismatch"));
      assert.ok(scoreMismatches.length >= 1, "detecta al menos un score mismatch");
      assert.ok(scoreMismatches.some((m) => m.includes("digitalPresenceScore")), "detecta digitalPresenceScore");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs detecta readinessScore mismatch desde leadIntelligenceProfile", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const slug = "sandhouse-inmobiliaria";
  const existingFiles = new Set([
    `dynamic-motion-banner/${slug}/index.html`,
    `dynamic-motion-banner/${slug}/banner-vertical.html`,
    `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    `dynamic-motion-banner/${slug}/banner-pack/index.html`,
    `production-manifests/${slug}.json`,
    "src/App.tsx",
    `src/data/clientDemos/sandhouse.ts`,
    "vercel.json",
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const fileContents = {
    "src/App.tsx": existingRoutes.aurumRoutes.map((r) => `<Route path="${r}" element={<div />} />`).join("\n"),
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
      },
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 64 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
  };

  buildGithubFetchMock(t, { existingFiles, existingRoutes, fileContents });

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      payload.audit = { ...(payload.audit || {}), score: undefined };
      payload.auditSnapshot = { available: true, status: "success", score: undefined };
      payload.leadIntelligenceProfile = { readinessScore: 64 };
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, false);
      assert.equal(body.status, "existing_outputs_current");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});
