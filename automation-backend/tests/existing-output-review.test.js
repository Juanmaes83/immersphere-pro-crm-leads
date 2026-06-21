import assert from "node:assert/strict";
import test from "node:test";
import { buildAurumFiles, buildRubikFiles } from "../src/fileGenerators.ts";
import { startServer } from "../src/server.ts";
import { SERVICE_VERSION } from "../src/schemas.ts";
import {
  classifyExistingAurumComponent,
  extractExistingDataFileRef,
  extractRouteComponentMap,
  patchAurumDataFileScoreSafely,
  resolveAurumRouteComponents,
  scanForbiddenGeneratedPatterns,
  wouldIntroduceDuplicateRoutes,
} from "../src/existingOutputReview.ts";

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

// ─── buildAurumFiles usa resolveProductionScore ───────────────────────────────

function findDataFile(aurumFiles, slug) {
  const camelBase = slug.split("-").filter(Boolean).map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");
  return aurumFiles.files.find((f) => f.path === `src/data/clientDemos/${camelBase}.ts`);
}

test("buildAurumFiles usa auditSnapshot.score cuando audit.score falta", () => {
  const slug = "score-audit-snapshot";
  const payload = validPayload({ slug });
  payload.audit = { ...(payload.audit || {}), score: undefined };
  payload.auditSnapshot = { available: true, status: "success", score: 56 };
  const aurumFiles = buildAurumFiles(payload);
  const dataFile = findDataFile(aurumFiles, slug);
  assert.ok(dataFile, "data file generado");
  assert.match(dataFile.content, /digitalPresenceScore:\s*56/, "usa auditSnapshot.score = 56");
});

test("buildAurumFiles usa leadIntelligenceProfile.readinessScore cuando es la única fuente", () => {
  const slug = "score-readiness";
  const payload = validPayload({ slug });
  payload.audit = { ...(payload.audit || {}), score: undefined };
  payload.auditSnapshot = { available: true, status: "success", score: undefined };
  payload.leadIntelligenceProfile = { readinessScore: 64 };
  const aurumFiles = buildAurumFiles(payload);
  const dataFile = findDataFile(aurumFiles, slug);
  assert.ok(dataFile, "data file generado");
  assert.match(dataFile.content, /digitalPresenceScore:\s*64/, "usa readinessScore = 64");
});

test("buildAurumFiles no vuelve a 35 si hay score real en Production Package", () => {
  const slug = "score-real";
  const payload = validPayload({ slug });
  payload.auditSnapshot = { available: true, status: "success", score: 72 };
  const aurumFiles = buildAurumFiles(payload);
  const dataFile = findDataFile(aurumFiles, slug);
  assert.ok(dataFile, "data file generado");
  assert.match(dataFile.content, /digitalPresenceScore:\s*72/, "usa score real 72");
  assert.doesNotMatch(dataFile.content, /digitalPresenceScore:\s*35/, "no usa fallback 35");
});

// ─── Reutilización de componentes AURUM existentes ────────────────────────────

test("buildAurumFiles reutiliza nombres de componentes existentes y no duplica rutas", () => {
  const slug = "sandhouse-inmobiliaria";
  const existingApp = `
import { SandhouseLanding } from "./SandhouseLanding";
import { SandhouseWebCompleta } from "./SandhouseWebCompleta";
import { SandhouseVisualExperience } from "./SandhouseVisualExperience";
import { SandhouseBannerPack } from "./SandhouseBannerPack";
import { SandhouseBannerVertical } from "./SandhouseBannerVertical";
import { SandhouseBannerHorizontal } from "./SandhouseBannerHorizontal";

export function App() {
  return (
    <Routes>
      <Route path="/${slug}" element={<SandhouseLanding />} />
      <Route path="/${slug}-web-completa" element={<SandhouseWebCompleta />} />
      <Route path="/visual-experience/${slug}" element={<SandhouseVisualExperience />} />
      <Route path="/banners/${slug}" element={<SandhouseBannerPack />} />
      <Route path="/banners/${slug}/vertical" element={<SandhouseBannerVertical />} />
      <Route path="/banners/${slug}/horizontal" element={<SandhouseBannerHorizontal />} />
    </Routes>
  );
}
`;
  const existingRouteComponentMap = extractRouteComponentMap(existingApp, slug);
  const payload = validPayload({ slug });
  const aurumFiles = buildAurumFiles(payload, undefined, { existingRouteComponentMap, existingAppTsxContent: existingApp });

  const componentPaths = aurumFiles.files.map((f) => f.path);
  assert.ok(componentPaths.includes("src/SandhouseLanding.tsx"), "reutiliza SandhouseLanding");
  assert.ok(componentPaths.includes("src/SandhouseWebCompleta.tsx"), "reutiliza SandhouseWebCompleta");
  assert.ok(componentPaths.includes("src/SandhouseVisualExperience.tsx"), "reutiliza SandhouseVisualExperience");
  assert.ok(componentPaths.includes("src/SandhouseBannerPack.tsx"), "reutiliza SandhouseBannerPack");
  assert.ok(componentPaths.includes("src/SandhouseBannerVertical.tsx"), "reutiliza SandhouseBannerVertical");
  assert.ok(componentPaths.includes("src/SandhouseBannerHorizontal.tsx"), "reutiliza SandhouseBannerHorizontal");

  assert.ok(!componentPaths.includes("src/SandhouseInmobiliariaLanding.tsx"), "no crea SandhouseInmobiliariaLanding");
  assert.ok(!componentPaths.includes("src/SandhouseInmobiliariaWebCompleta.tsx"), "no crea SandhouseInmobiliariaWebCompleta");

  // All 6 routes already exist verbatim — there is nothing left to add, so
  // App.tsx must not be touched at all (no no-op diff).
  const appPatch = aurumFiles.files.find((f) => f.path === "src/App.tsx");
  assert.equal(appPatch, undefined, "App.tsx no se toca cuando no faltan rutas");
});

test("buildAurumFiles añade solo rutas faltantes manteniendo componentes existentes", () => {
  const slug = "sandhouse-inmobiliaria";
  const existingApp = `
import { SandhouseLanding } from "./SandhouseLanding";

export function App() {
  return (
    <Routes>
      <Route path="/${slug}" element={<SandhouseLanding />} />
    </Routes>
  );
}
`;
  const existingRouteComponentMap = extractRouteComponentMap(existingApp, slug);
  const payload = validPayload({ slug });
  const aurumFiles = buildAurumFiles(payload, undefined, { existingRouteComponentMap, existingAppTsxContent: existingApp });

  const appPatch = aurumFiles.files.find((f) => f.path === "src/App.tsx");
  const patch = JSON.parse(appPatch.content);
  assert.equal(patch.routes.length, 5, "añade las 5 rutas faltantes");
  assert.ok(patch.routes.every((r) => !existingApp.includes(r)), "ninguna ruta ya existía");

  const newComponent = aurumFiles.files.find((f) => f.path === "src/SandhouseInmobiliariaWebCompleta.tsx");
  assert.ok(newComponent, "crea componente nuevo para ruta faltante");
  const reusedLanding = aurumFiles.files.find((f) => f.path === "src/SandhouseLanding.tsx");
  assert.ok(reusedLanding, "mantiene componente existente");
});

// ─── Bug raíz: no doblar sufijos en el nombre exportado ───────────────────────

test("buildAurumFiles no dobla sufijos en el nombre de función exportado (reuso)", () => {
  const slug = "sandhouse-inmobiliaria";
  const existingApp = `
import { SandhouseLanding } from "./SandhouseLanding";
import { SandhouseWebCompleta } from "./SandhouseWebCompleta";
import { SandhouseVisualExperience } from "./SandhouseVisualExperience";
import { SandhouseBannerPack } from "./SandhouseBannerPack";
import { SandhouseBannerVertical } from "./SandhouseBannerVertical";
import { SandhouseBannerHorizontal } from "./SandhouseBannerHorizontal";

export function App() {
  return (
    <Routes>
      <Route path="/${slug}" element={<SandhouseLanding />} />
      <Route path="/${slug}-web-completa" element={<SandhouseWebCompleta />} />
      <Route path="/visual-experience/${slug}" element={<SandhouseVisualExperience />} />
      <Route path="/banners/${slug}" element={<SandhouseBannerPack />} />
      <Route path="/banners/${slug}/vertical" element={<SandhouseBannerVertical />} />
      <Route path="/banners/${slug}/horizontal" element={<SandhouseBannerHorizontal />} />
    </Routes>
  );
}
`;
  const existingRouteComponentMap = extractRouteComponentMap(existingApp, slug);
  const payload = validPayload({ slug });
  const aurumFiles = buildAurumFiles(payload, undefined, { existingRouteComponentMap, existingAppTsxContent: existingApp });

  const byPath = Object.fromEntries(aurumFiles.files.map((f) => [f.path, f.content]));
  assert.match(byPath["src/SandhouseLanding.tsx"], /export function SandhouseLanding\(\)/);
  assert.match(byPath["src/SandhouseWebCompleta.tsx"], /export function SandhouseWebCompleta\(\)/);
  assert.match(byPath["src/SandhouseVisualExperience.tsx"], /export function SandhouseVisualExperience\(\)/);
  assert.match(byPath["src/SandhouseBannerPack.tsx"], /export function SandhouseBannerPack\(\)/);
  assert.match(byPath["src/SandhouseBannerVertical.tsx"], /export function SandhouseBannerVertical\(\)/);
  assert.match(byPath["src/SandhouseBannerHorizontal.tsx"], /export function SandhouseBannerHorizontal\(\)/);

  for (const content of Object.values(byPath)) {
    assert.doesNotMatch(content, /BannerPackBannerPack|BannerVerticalBannerVertical|BannerHorizontalBannerHorizontal|LandingLanding|WebCompletaWebCompleta|VisualExperienceVisualExperience/);
  }
});

test("buildAurumFiles no dobla sufijos en el nombre de función exportado (fallback, lead nuevo)", () => {
  const slug = "nuevo-lead-qa";
  const payload = validPayload({ slug });
  const aurumFiles = buildAurumFiles(payload);
  const byPath = Object.fromEntries(aurumFiles.files.map((f) => [f.path, f.content]));
  assert.match(byPath["src/NuevoLeadQaLanding.tsx"], /export function NuevoLeadQaLanding\(\)/);
  assert.match(byPath["src/NuevoLeadQaBannerPack.tsx"], /export function NuevoLeadQaBannerPack\(\)/);
  for (const content of Object.values(byPath)) {
    assert.doesNotMatch(content, /LandingLanding|WebCompletaWebCompleta|VisualExperienceVisualExperience|BannerPackBannerPack|BannerVerticalBannerVertical|BannerHorizontalBannerHorizontal/);
  }
});

test("buildAurumFiles reutiliza el data file existente en vez de crear uno nuevo por slug", () => {
  const slug = "sandhouse-inmobiliaria";
  const payload = validPayload({ slug });
  const aurumFiles = buildAurumFiles(payload, undefined, {
    existingDataFile: { path: "src/data/clientDemos/sandhouse.ts", exportName: "sandhouse" },
  });
  const paths = aurumFiles.files.map((f) => f.path);
  assert.ok(paths.includes("src/data/clientDemos/sandhouse.ts"), "escribe en el data file existente");
  assert.ok(!paths.includes("src/data/clientDemos/sandhouseInmobiliaria.ts"), "no crea un data file paralelo");

  const landing = aurumFiles.files.find((f) => f.path.endsWith("Landing.tsx"));
  assert.match(landing.content, /import \{ sandhouse \} from "@\/data\/clientDemos\/sandhouse"/);
});

// ─── Resolución de rutas alias y ambigüedad ────────────────────────────────────

test("resolveAurumRouteComponents reutiliza componente vía ruta alias cuando la canónica no existe", () => {
  const slug = "sandhouse-inmobiliaria";
  const appContent = `
    <Route path="/${slug}/web-completa" element={<SandhouseWebCompleta />} />
  `;
  const resolution = resolveAurumRouteComponents(appContent, slug);
  assert.equal(resolution.componentByCanonicalRoute[`/${slug}-web-completa`], "SandhouseWebCompleta");
  assert.ok(resolution.reusedTypes.includes("webCompleta"));
  assert.equal(resolution.ambiguousTypes.length, 0);
});

test("resolveAurumRouteComponents marca ambigüedad cuando canónica y alias difieren", () => {
  const slug = "sandhouse-inmobiliaria";
  const appContent = `
    <Route path="/${slug}-web-completa" element={<SandhouseWebCompleta />} />
    <Route path="/${slug}/web-completa" element={<LegacyWebCompletaDraft />} />
  `;
  const resolution = resolveAurumRouteComponents(appContent, slug);
  assert.ok(resolution.ambiguousTypes.includes("webCompleta"));
  assert.equal(resolution.componentByCanonicalRoute[`/${slug}-web-completa`], undefined);
});

test("wouldIntroduceDuplicateRoutes detecta rutas existentes con comillas simples", () => {
  const slug = "sandhouse-inmobiliaria";
  const existingApp = `<Route path='/${slug}' element={<SandhouseLanding />} />`;
  const dups = wouldIntroduceDuplicateRoutes(existingApp, [`/${slug}`, `/${slug}-web-completa`]);
  assert.deepEqual(dups, [`/${slug}`]);
});

test("scanForbiddenGeneratedPatterns detecta nombres doblados y gesture-lab fuera de dominio interno", () => {
  const violations = scanForbiddenGeneratedPatterns([
    { path: "src/SandhouseInmobiliariaBannerPack.tsx", content: "export function SandhouseInmobiliariaBannerPackBannerPack() {}" },
    { path: "src/Clean.tsx", content: "const url = 'https://aurum-properties-boutique.vercel.app/gesture-lab/leak';" },
  ]);
  assert.ok(violations.some((v) => v.includes("BannerPackBannerPack")));
  assert.ok(violations.some((v) => v.includes("gesture_lab_leak_in_client_facing_output")));
});

test("extractExistingDataFileRef lee el import real de un componente existente", () => {
  const content = `import { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() { return null; }`;
  const ref = extractExistingDataFileRef(content);
  assert.deepEqual(ref, { path: "src/data/clientDemos/sandhouse.ts", exportName: "sandhouse" });
});

test("extractExistingDataFileRef devuelve null si no hay import de clientDemos", () => {
  assert.equal(extractExistingDataFileRef("export function X() { return null; }"), null);
});

test("extractExistingDataFileRef reconoce import relativo ./data/clientDemos/...", () => {
  const ref = extractExistingDataFileRef(`import { sandhouseDemo } from './data/clientDemos/sandhouse';`);
  assert.deepEqual(ref, { path: "src/data/clientDemos/sandhouse.ts", exportName: "sandhouseDemo" });
});

test("extractExistingDataFileRef reconoce import alias @/data/clientDemos/... con nombre distinto al slug", () => {
  const ref = extractExistingDataFileRef(`import { sandhouseInmobiliaria } from '@/data/clientDemos/sandhouseInmobiliaria';`);
  assert.deepEqual(ref, { path: "src/data/clientDemos/sandhouseInmobiliaria.ts", exportName: "sandhouseInmobiliaria" });
});

// ─── classifyExistingAurumComponent ────────────────────────────────────────

test("classifyExistingAurumComponent detecta premium_manual por señales (Helmet, motion, CustomCursor...)", () => {
  const premiumSamples = [
    `import { Helmet } from "react-helmet-async";\nexport function X() { return <Helmet><title>X</title></Helmet>; }`,
    `import { motion } from "framer-motion";\nexport function X() { return <motion.div />; }`,
    `import { CustomCursor } from "./CustomCursor";\nexport function X() { return <CustomCursor />; }`,
    `import { GridOverlay } from "./GridOverlay";\nexport function X() { return <GridOverlay />; }`,
    `import { useSmoothScroll } from "./hooks";\nexport function X() { useSmoothScroll(); return null; }`,
    `import gsap from "gsap";\nexport function X() { gsap.to(".x", {}); return null; }`,
    `import SplitType from "split-type";\nconst t = new SplitType(".x");`,
    `import { ArrowRight } from "lucide-react";\nexport function X() { return <ArrowRight />; }`,
  ];
  for (const content of premiumSamples) {
    assert.equal(classifyExistingAurumComponent(content), "premium_manual", content.slice(0, 40));
  }
});

test("classifyExistingAurumComponent detecta autogenerated_safe_to_replace por el marcador propio", () => {
  const content = `// Auto-generated by immersphere-production-orchestrator v0.4.0\nimport React from "react";\nexport function SandhouseLanding() { return <main />; }`;
  assert.equal(classifyExistingAurumComponent(content), "autogenerated_safe_to_replace");
});

test("classifyExistingAurumComponent devuelve unknown para contenido ambiguo sin marcador ni señales premium", () => {
  assert.equal(classifyExistingAurumComponent(`export function SandhouseLanding() { return null; }`), "unknown");
  assert.equal(classifyExistingAurumComponent(""), "unknown");
});

test("classifyExistingAurumComponent prioriza premium_manual aunque el marcador también esté presente", () => {
  const content = `// Auto-generated by immersphere-production-orchestrator v0.2\nimport { Helmet } from "react-helmet-async";\nexport function X() { return <Helmet />; }`;
  assert.equal(classifyExistingAurumComponent(content), "premium_manual");
});

// ─── patchAurumDataFileScoreSafely ─────────────────────────────────────────

test("patchAurumDataFileScoreSafely actualiza solo el score, preservando el resto byte a byte", () => {
  const original = `// hand-authored\nexport const sandhouseDemo = {\n  audit: { digitalPresenceScore: 88, mobileFriendly: true },\n  hero: { headline: "Sandhouse — Premium" },\n};\n`;
  const patched = patchAurumDataFileScoreSafely(original, 56);
  assert.ok(patched);
  assert.match(patched, /digitalPresenceScore:\s*56/);
  assert.equal(patched.replace("88", "56"), original.replace("88", "56"));
  assert.match(patched, /hero: \{ headline: "Sandhouse — Premium" \}/);
});

test("patchAurumDataFileScoreSafely devuelve null cuando no encuentra el campo de score", () => {
  const original = `export const sandhouseDemo = { hero: { headline: "Sandhouse" } };\n`;
  assert.equal(patchAurumDataFileScoreSafely(original, 56), null);
});

// ─── Real-world shape: score: <n> nested inside audit: { ... } ───────────────
// This is the actual structure AURUM's premium sandhouse.ts data file uses —
// the flat `digitalPresenceScore: <n>` pattern never matches it.

test("patchAurumDataFileScoreSafely parchea audit.score real (score: 88 -> 56) preservando el resto byte a byte", () => {
  const original = `export const sandhouseDemo = {
  client: {
    name: 'Sandhouse Inmobiliaria',
  },
  audit: {
    score: 88,
    priority: 'A',
  },
  visualExperience: {
    embedUrl: 'https://rubik-sota-director-de-orquesta.vercel.app/dynamic-motion-banner/sandhouse-inmobiliaria/?embed=1',
    standaloneUrl: 'https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria/visual-experience',
  },
};
`;
  const patched = patchAurumDataFileScoreSafely(original, 56, "sandhouse-inmobiliaria");
  assert.ok(patched, "el patch tiene éxito");
  assert.match(patched, /audit:\s*\{\s*score:\s*56,\s*priority:\s*'A',/, "audit.score pasa a 56");
  assert.doesNotMatch(patched, /score:\s*88/, "no queda el valor viejo");

  // Byte-for-byte preservation of everything except the score digits and
  // the canonical URL it opportunistically fixes — verified by replacing
  // both expected diffs in the original and comparing.
  const expectedUnchanged = original
    .replace("score: 88,", "score: 56,")
    .replace(
      "standaloneUrl: 'https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria/visual-experience',",
      "standaloneUrl: 'https://aurum-properties-boutique.vercel.app/visual-experience/sandhouse-inmobiliaria',",
    );
  assert.equal(patched, expectedUnchanged);
});

test("patchAurumDataFileScoreSafely no toca un score fuera del bloque audit", () => {
  const original = `export const sandhouseDemo = {\n  seo: { score: 99 },\n  hero: { headline: "Sandhouse" },\n};\n`;
  // No `audit:` block at all — must not patch the unrelated seo.score.
  assert.equal(patchAurumDataFileScoreSafely(original, 56), null);
});

test("patchAurumDataFileScoreSafely devuelve null si el bloque audit existe pero no tiene score", () => {
  const original = `export const sandhouseDemo = {\n  audit: { priority: 'A', mobileFriendly: true },\n};\n`;
  assert.equal(patchAurumDataFileScoreSafely(original, 56), null);
});

test("patchAurumDataFileScoreSafely canonicaliza standaloneUrl viejo a /visual-experience/<slug>", () => {
  const original = `export const sandhouseDemo = {\n  audit: { score: 88 },\n  visualExperience: { standaloneUrl: 'https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria/visual-experience' },\n};\n`;
  const patched = patchAurumDataFileScoreSafely(original, 56, "sandhouse-inmobiliaria");
  assert.match(patched, /standaloneUrl:\s*'https:\/\/aurum-properties-boutique\.vercel\.app\/visual-experience\/sandhouse-inmobiliaria'/);
});

test("patchAurumDataFileScoreSafely no bloquea el patch de score si la URL canónica no aparece", () => {
  const original = `export const sandhouseDemo = {\n  audit: { score: 88 },\n  visualExperience: { standaloneUrl: 'https://aurum-properties-boutique.vercel.app/visual-experience/sandhouse-inmobiliaria' },\n};\n`;
  const patched = patchAurumDataFileScoreSafely(original, 56, "sandhouse-inmobiliaria");
  assert.ok(patched, "el patch de score sigue funcionando aunque la URL ya sea canónica");
  assert.match(patched, /score:\s*56/);
});
