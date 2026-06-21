import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../src/server.ts";
import { AURUM_REPO, RUBIK_REPO } from "../src/pathSecurity.ts";
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

function installGithubFetchMock(t, existingFiles = new Set(), existingRoutes = {}, fileContents = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  function getFileContent(path) {
    if (Object.prototype.hasOwnProperty.call(fileContents, path)) {
      return String(fileContents[path] ?? "");
    }
    return "existing";
  }

  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes("127.0.0.1") || u.includes("localhost")) {
      return originalFetch(url, options);
    }
    calls.push({ url: u, method: options.method || "GET", body: options.body });

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

    if (u.includes("/git/refs") && options.method === "POST") {
      return resp({ ref: "refs/heads/production/test" }, 201);
    }

    if (u.includes("/contents/") && (!options.method || options.method === "GET")) {
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

    if (u.includes("/contents/") && options.method === "PUT") {
      return resp({ content: { sha: "filesha" } }, 201);
    }

    if (u.includes("/pulls") && (!options.method || options.method === "GET")) {
      return resp([], 200);
    }

    if (u.includes("/pulls") && options.method === "POST") {
      const isAurum = u.includes("AURUM");
      return resp({
        number: isAurum ? 42 : 43,
        html_url: `https://github.com/${isAurum ? AURUM_REPO : RUBIK_REPO}/pull/${isAurum ? 42 : 43}`,
      }, 201);
    }

    return resp({ message: "not mocked" }, 404);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return { calls, originalFetch };
}

test("create-prs para lead nuevo sin outputs existentes crea PRs", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug: "nuevo-lead-qa" }));
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.equal(body.status, "prs_created");
      assert.ok(body.pullRequests[AURUM_REPO], "aurum PR creado");
      assert.ok(body.pullRequests[RUBIK_REPO], "rubik PR creado");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs para Sandhouse con outputs existentes actuales no crea PRs", async (t) => {
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
    `src/App.tsx`,
    `src/data/clientDemos/sandhouse.ts`,
    `vercel.json`,
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
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      clientName: "Sandhouse Inmobiliaria",
      generatedBy: `immersphere-production-orchestrator-v${SERVICE_VERSION}`,
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
        bannerVertical: `/banners/${slug}/vertical`,
        bannerHorizontal: `/banners/${slug}/horizontal`,
      },
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 35 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
    "src/App.tsx": existingRoutes.aurumRoutes.map((r) => `<Route path="${r}" element={<div />} />`).join("\n"),
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug }));
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, false);
      assert.equal(body.status, "existing_outputs_current");
      assert.deepEqual(body.pullRequests, {});
      assert.equal(body.responseBundle.status, "existing_outputs_current");
      assert.equal(body.existingOutputReview.status, "current");

      const branchCreates = calls.filter((c) => c.url.includes("/git/refs") && c.method === "POST");
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const prCreates = calls.filter((c) => c.url.includes("/pulls") && c.method === "POST");
      assert.equal(branchCreates.length, 0, "no crea ramas");
      assert.equal(filePuts.length, 0, "no escribe archivos");
      assert.equal(prCreates.length, 0, "no crea PRs");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs para Sandhouse con outputs existentes stale crea PRs de actualización", async (t) => {
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
    `src/App.tsx`,
    `src/data/clientDemos/sandhouse.ts`,
    `src/SandhouseInmobiliariaWebCompleta.tsx`,
    `vercel.json`,
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
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      clientName: "Sandhouse Inmobiliaria",
      generatedBy: "immersphere-production-orchestrator-v0.2",
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
      },
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 88 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
    "src/App.tsx": `import { SandhouseInmobiliariaWebCompleta } from "./SandhouseInmobiliariaWebCompleta";\n` + existingRoutes.aurumRoutes.map((r) => `<Route path="${r}" element={<div />} />`).join("\n"),
    "src/SandhouseInmobiliariaWebCompleta.tsx": `export function SandhouseInmobiliariaWebCompleta() { return <div>Internal draft — Apartamento Torrevieja Centro</div>; }`,
    [`dynamic-motion-banner/${slug}/index.html`]: `<!doctype html><html><body>Internal draft</body></html>`,
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      payload.audit = { ...(payload.audit || {}), score: 56 };
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.equal(body.status, "existing_outputs_update_required");
      assert.ok(body.existingOutputReview.status === "stale" || body.existingOutputReview.status === "unsafe", "review marca stale/unsafe");
      assert.ok(body.existingOutputReview.mismatches.length > 0, "hay mismatches detectados");
      assert.ok(body.pullRequests[AURUM_REPO], "aurum PR creado");
      assert.ok(body.pullRequests[RUBIK_REPO], "rubik PR creado");

      const prCreates = calls.filter((c) => c.url.includes("/pulls") && c.method === "POST");
      assert.equal(prCreates.length, 2, "crea dos PRs de actualización");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Regresión: AURUM main limpio con Sandhouse* no debe generar duplicados ───
// Reproduce el bug real reportado: AURUM main ya tiene SandhouseLanding,
// SandhouseWebCompleta, etc. con sus rutas canónicas. create-prs en modo
// stale/update debe reutilizarlos (incluyendo el data file que importan) y
// nunca crear SandhouseInmobiliaria* ni nombres con sufijo doblado.
test("create-prs con AURUM main limpio reutiliza Sandhouse* sin duplicar ni doblar sufijos", async (t) => {
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
    `src/App.tsx`,
    `src/data/clientDemos/sandhouse.ts`,
    `src/SandhouseLanding.tsx`,
    `src/SandhouseWebCompleta.tsx`,
    `src/SandhouseVisualExperience.tsx`,
    `src/SandhouseBannerPack.tsx`,
    `src/SandhouseBannerVertical.tsx`,
    `src/SandhouseBannerHorizontal.tsx`,
    `vercel.json`,
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    // Intentionally only the 4 routes checked by checkAurumExisting — the
    // other 2 (bannerVertical/bannerHorizontal) still exist in src/App.tsx
    // below, exercising the "partial" -> still-reconcile path too.
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug,
      clientName: "Sandhouse Inmobiliaria",
      generatedBy: "immersphere-production-orchestrator-v0.2",
      routes: {
        landing: `/${slug}`,
        webCompleta: `/${slug}-web-completa`,
        visualExperience: `/visual-experience/${slug}`,
        bannerPack: `/banners/${slug}`,
      },
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = { audit: { digitalPresenceScore: 88 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
    "src/App.tsx": `
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
`,
    "src/SandhouseLanding.tsx": `import { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() { return null; }`,
    "src/SandhouseWebCompleta.tsx": `import { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseWebCompleta() { return null; }`,
    [`dynamic-motion-banner/${slug}/index.html`]: `<!doctype html><html><body>Banner</body></html>`,
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      payload.audit = { ...(payload.audit || {}), score: 56 };
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.equal(body.status, "existing_outputs_update_required");
      assert.ok(body.idempotencyNotes.includes("aurum_refresh_based_on_main"), "nota aurum_refresh_based_on_main presente");
      assert.ok(body.idempotencyNotes.includes("aurum_reused_existing_components"), "nota aurum_reused_existing_components presente");
      assert.ok(body.idempotencyNotes.includes("aurum_files_reconciled_with_existing_app_tsx"));

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const putPaths = filePuts.map(putPath);

      // Routed, client-facing components must never get a duplicate
      // SandhouseInmobiliaria* sibling — internal bookkeeping files
      // (src/generated/*ProductionPlan.ts, *ProposalPackage.ts) are not
      // routes/components and stay keyed by slug, which is fine.
      const routedComponentSuffixes = ["Landing.tsx", "WebCompleta.tsx", "VisualExperience.tsx", "BannerPack.tsx", "BannerVertical.tsx", "BannerHorizontal.tsx"];
      for (const p of putPaths) {
        if (!routedComponentSuffixes.some((suffix) => p.endsWith(suffix))) continue;
        assert.ok(!p.includes("SandhouseInmobiliaria"), `no escribe rutas SandhouseInmobiliaria*: ${p}`);
      }
      assert.ok(!putPaths.includes("src/data/clientDemos/sandhouseInmobiliaria.ts"), "no crea data file paralelo");
      assert.ok(putPaths.includes("src/data/clientDemos/sandhouse.ts"), "actualiza el data file existente");

      const landingPut = filePuts.find((c) => putPath(c) === "src/SandhouseLanding.tsx");
      assert.ok(landingPut, "escribe src/SandhouseLanding.tsx");
      const landingContent = Buffer.from(JSON.parse(landingPut.body).content, "base64").toString("utf8");
      assert.match(landingContent, /export function SandhouseLanding\(\)/);
      assert.doesNotMatch(landingContent, /LandingLanding/);

      const bannerPackPut = filePuts.find((c) => putPath(c) === "src/SandhouseBannerPack.tsx");
      assert.ok(bannerPackPut, "escribe src/SandhouseBannerPack.tsx");
      const bannerPackContent = Buffer.from(JSON.parse(bannerPackPut.body).content, "base64").toString("utf8");
      assert.match(bannerPackContent, /export function SandhouseBannerPack\(\)/);
      assert.doesNotMatch(bannerPackContent, /BannerPackBannerPack/);

      const dataFilePut = filePuts.find((c) => putPath(c) === "src/data/clientDemos/sandhouse.ts");
      const dataFileContent = Buffer.from(JSON.parse(dataFilePut.body).content, "base64").toString("utf8");
      assert.match(dataFileContent, /export const sandhouse:/);
      assert.match(dataFileContent, /digitalPresenceScore:\s*56/, "usa el score real del payload, no el 88 viejo");

      // Branches must be cut from the live main SHA the mock advertises.
      const aurumBranchCreate = calls.find((c) => c.url.includes("AURUM") && c.url.includes("/git/refs") && c.method === "POST");
      assert.ok(aurumBranchCreate, "crea rama AURUM");
      assert.equal(JSON.parse(aurumBranchCreate.body).sha, "mainsha123");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs bloquea con aurum_route_component_ambiguous y no escribe ni crea PR", async (t) => {
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
    `src/App.tsx`,
    `vercel.json`,
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({ slug, generatedBy: "immersphere-production-orchestrator-v0.2" }, null, 2),
    "src/App.tsx": `
      <Route path="/${slug}" element={<SandhouseLanding />} />
      <Route path="/${slug}-web-completa" element={<SandhouseWebCompleta />} />
      <Route path="/${slug}/web-completa" element={<LegacyWebCompletaDraft />} />
      <Route path="/visual-experience/${slug}" element={<SandhouseVisualExperience />} />
      <Route path="/banners/${slug}" element={<SandhouseBannerPack />} />
    `,
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.blocked, true);
      assert.ok(body.blockers.some((b) => b.startsWith("aurum_route_component_ambiguous")), "blocker presente");
      assert.equal(body.writeAttempted, false);

      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const prCreates = calls.filter((c) => c.url.includes("/pulls") && c.method === "POST");
      assert.equal(filePuts.length, 0, "no escribe nada");
      assert.equal(prCreates.length, 0, "no crea PRs");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs bloquea con aurum_main_sha_unconfirmed si no puede leer el SHA de main", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.includes("127.0.0.1") || u.includes("localhost")) return originalFetch(url, options);
    calls.push({ url: u, method: options.method || "GET" });
    function resp(payload, status = 200) {
      const body = JSON.stringify(payload);
      return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
    }
    if (u.includes("/repos/") && !u.includes("/git/") && !u.includes("/pulls") && !u.includes("/contents/")) {
      return resp({ default_branch: "main" });
    }
    if (u.includes("/pulls")) return resp([], 200);
    if (u.includes("/git/ref/heads/")) {
      // Simulate AURUM main ref lookup failing (e.g. transient GitHub API issue);
      // every other ref (Rubik's main, or any not-yet-created production branch)
      // resolves normally so the failure is isolated to the SHA confirmation gate.
      if (u.endsWith("/main") && u.includes("AURUM")) return resp({ message: "Not Found" }, 404);
      if (u.endsWith("/main")) return resp({ object: { sha: "mainsha123" } });
      return resp({ message: "Not Found" }, 404);
    }
    return resp({ message: "not mocked" }, 404);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug: "sandhouse-inmobiliaria" }));
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.blocked, true);
      assert.ok(body.blockers.includes("aurum_main_sha_unconfirmed"));
      assert.equal(body.writeAttempted, false);

      const branchCreates = calls.filter((c) => c.url.includes("/git/refs") && c.method === "POST");
      assert.equal(branchCreates.length, 0, "no crea ninguna rama");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs sanitiza publication flags del payload", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug: "clean-lead-qa" });
      payload.publicationStatus = "published";
      payload.publishedOutputCount = 4;
      payload.generatedReviewCount = 4;
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      // PR should still be created because flags are sanitized on the server.
      assert.equal(body.writeAttempted, true);
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("body de PR usa SERVICE_VERSION real", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const { calls } = installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug: "version-lead-qa" }));
      const prCreates = calls.filter((c) => c.url.includes("/pulls") && c.method === "POST");
      assert.equal(prCreates.length, 2);
      for (const prCall of prCreates) {
        const parsed = JSON.parse(prCall.body);
        assert.match(parsed.body, new RegExp(`v${SERVICE_VERSION}`), `PR body mentions v${SERVICE_VERSION}`);
        assert.doesNotMatch(parsed.body, /v0\.3\.0/, "PR body does not hardcode v0.3.0");
      }
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});
