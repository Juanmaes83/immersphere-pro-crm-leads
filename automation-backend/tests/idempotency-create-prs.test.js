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

function installGithubFetchMock(t, existingFiles = new Set(), existingRoutes = {}, fileContents = {}, existingBranches = {}) {
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
      const branchMatch = u.match(/\/git\/ref\/heads\/(.+)$/);
      const branchName = branchMatch ? decodeURIComponent(branchMatch[1]) : "";
      if (Object.prototype.hasOwnProperty.call(existingBranches, branchName)) {
        return resp({ object: { sha: existingBranches[branchName] } });
      }
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
    "src/data/clientDemos/sandhouse.ts": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport const sandhouse = { audit: { digitalPresenceScore: 88 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
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
    // These components carry the orchestrator's own auto-generated marker —
    // they were created by a *previous* create-prs run, so this run is a
    // legitimate, safe refresh (classifyExistingAurumComponent must return
    // "autogenerated_safe_to_replace", not premium/unknown).
    "src/SandhouseLanding.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() { return null; }`,
    "src/SandhouseWebCompleta.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseWebCompleta() { return null; }`,
    "src/SandhouseVisualExperience.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseVisualExperience() { return null; }`,
    "src/SandhouseBannerPack.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerPack() { return null; }`,
    "src/SandhouseBannerVertical.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerVertical() { return null; }`,
    "src/SandhouseBannerHorizontal.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerHorizontal() { return null; }`,
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
      assert.ok(!body.idempotencyNotes.includes("aurum_existing_premium_components_preserved"), "nada se clasifica como premium en este fixture");

      // Every critical file (manifest, App.tsx, reused Sandhouse* components,
      // data file, Rubik banners/wrappers) is actually updated in this run —
      // none of them may be reported as "skipped_existing_file", since that
      // would falsely imply they were left stale.
      const skippedNotes = body.idempotencyNotes.filter((n) => n.startsWith("skipped_existing_file:"));
      assert.deepEqual(skippedNotes, [], "no hay skipped_existing_file en modo stale/update");
      const skippedWarnings = body.responseBundle.warnings.filter((w) => String(w).startsWith("skipped_existing_file:"));
      assert.deepEqual(skippedWarnings, [], "responseBundle.warnings tampoco contiene skipped_existing_file");

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

      // The data file is patched surgically (score only), not regenerated
      // from a template — everything else (the embedUrl, the marker) must
      // survive byte-for-byte.
      const dataFilePut = filePuts.find((c) => putPath(c) === "src/data/clientDemos/sandhouse.ts");
      const dataFileContent = Buffer.from(JSON.parse(dataFilePut.body).content, "base64").toString("utf8");
      assert.match(dataFileContent, /digitalPresenceScore:\s*56/, "usa el score real del payload, no el 88 viejo");
      assert.match(dataFileContent, /export const sandhouse = \{/, "preserva la estructura original, no la regenera");
      assert.match(dataFileContent, /gesture-lab\/sandhouse-inmobiliaria-v1/, "preserva el resto del contenido sin tocar");

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

// ─── Rama vieja contaminada: el refresh debe partir de main, no de ella ───────
// AURUM main está limpio (Sandhouse* ya correctos), pero la rama
// production/sandhouse-inmobiliaria-public-pages de un run viejo sigue
// existiendo y está contaminada con SandhouseInmobiliaria*. create-prs en
// modo stale debe detectar que esa rama ya existe, cortar el refresh desde
// el SHA de main (no desde el tip contaminado) y el contenido generado no
// debe arrastrar ningún resto de la contaminación.
test("create-prs con rama vieja contaminada crea refresh desde main, no desde la rama vieja", async (t) => {
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
    "src/data/clientDemos/sandhouse.ts": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport const sandhouse = { audit: { digitalPresenceScore: 88 }, visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" } };`,
    // AURUM main: clean, canonical Sandhouse* components only.
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
    "src/SandhouseLanding.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() { return null; }`,
    "src/SandhouseWebCompleta.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseWebCompleta() { return null; }`,
    "src/SandhouseVisualExperience.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseVisualExperience() { return null; }`,
    "src/SandhouseBannerPack.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerPack() { return null; }`,
    "src/SandhouseBannerVertical.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerVertical() { return null; }`,
    "src/SandhouseBannerHorizontal.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerHorizontal() { return null; }`,
    [`dynamic-motion-banner/${slug}/index.html`]: `<!doctype html><html><body>Banner</body></html>`,
  };

  // The old production branch from a previous, contaminated run still
  // exists in AURUM with a tip SHA that is NOT main's — if the refresh ever
  // got cut from this instead of main, the contamination would leak back in.
  const contaminatedBranch = `production/${slug}-public-pages`;
  const existingBranches = { [contaminatedBranch]: "oldcontaminatedsha999" };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents, existingBranches);

  try {
    await withServer(async (baseUrl) => {
      const payload = validPayload({ slug });
      payload.audit = { ...(payload.audit || {}), score: 56 };
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", payload);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.equal(body.status, "existing_outputs_update_required");
      assert.ok(body.idempotencyNotes.includes("aurum_refresh_based_on_main"));
      assert.ok(body.idempotencyNotes.includes("aurum_reused_existing_components"));
      // All 6 routes already exist verbatim in the (clean) App.tsx on main —
      // there is nothing to add, so App.tsx must not be touched at all.
      assert.ok(body.idempotencyNotes.includes("aurum_app_tsx_unchanged_routes_already_present"));

      // The branch was refreshed (not reused) because it already existed,
      // and the refresh ref must be cut from main's SHA, never the old
      // branch's contaminated tip.
      const aurumRefreshedNote = body.idempotencyNotes.find((n) => n.startsWith(`branch_refreshed:${contaminatedBranch}->`));
      assert.ok(aurumRefreshedNote, "rama AURUM detectada como ya existente y refrescada");

      const aurumBranchCreate = calls.find((c) => c.url.includes("AURUM") && c.url.includes("/git/refs") && c.method === "POST");
      assert.ok(aurumBranchCreate, "crea rama de refresh para AURUM");
      const createdRef = JSON.parse(aurumBranchCreate.body);
      assert.equal(createdRef.sha, "mainsha123", "la rama de refresh se corta del SHA de main, no del viejo");
      assert.notEqual(createdRef.sha, "oldcontaminatedsha999");
      assert.match(createdRef.ref, new RegExp(`^refs/heads/${contaminatedBranch.replace(/\//g, "\\/")}-refresh-`));

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const allWrittenContent = filePuts.map((c) => Buffer.from(JSON.parse(c.body).content, "base64").toString("utf8")).join("\n---\n");
      const allWrittenPaths = filePuts.map(putPath);

      for (const forbidden of ["SandhouseInmobiliariaLanding", "SandhouseInmobiliariaWebCompleta", "SandhouseInmobiliariaVisualExperience", "BannerPackBannerPack"]) {
        assert.ok(!allWrittenContent.includes(forbidden), `contenido generado no contiene ${forbidden}`);
        assert.ok(!allWrittenPaths.some((p) => p.includes(forbidden)), `ninguna ruta escrita contiene ${forbidden}`);
      }

      const appTsxPut = filePuts.find((c) => putPath(c) === "src/App.tsx");
      assert.equal(appTsxPut, undefined, "App.tsx no se toca: todas las rutas ya existen en main limpio");

      // The clean App.tsx on main (the source of truth) has no duplicate
      // routes either, independent of whether we touched it.
      const routeMatches = [...fileContents["src/App.tsx"].matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
      const uniqueRoutes = new Set(routeMatches);
      assert.equal(routeMatches.length, uniqueRoutes.size, "App.tsx de main no tiene rutas duplicadas");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Test 1: premium components are preserved, never overwritten ─────────────
// "Reusing a component's name does not mean overwriting its content." AURUM
// main has hand-authored premium Landing/WebCompleta (Helmet, motion,
// CustomCursor, GridOverlay, useSmoothScroll) wired to the canonical routes.
// The other 4 route components are genuinely orchestrator-owned (carry the
// auto-generated marker), so this also proves preservation is selective —
// not a blanket "never touch anything reused" fallback.
test("Test 1 — create-prs preserva componentes premium existentes y no los sobrescribe", async (t) => {
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
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const premiumLanding = `import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { CustomCursor } from "./CustomCursor";
import { GridOverlay } from "./GridOverlay";
import { useSmoothScroll } from "./hooks/useSmoothScroll";
import { sandhouseDemo } from "./data/clientDemos/sandhouse";

export function SandhouseLanding() {
  useSmoothScroll();
  return (
    <>
      <Helmet><title>Sandhouse — Editorial Premium</title></Helmet>
      <CustomCursor />
      <GridOverlay />
      <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <section>{sandhouseDemo.hero.headline}</section>
      </motion.main>
    </>
  );
}`;
  const premiumWebCompleta = `import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { sandhouseDemo } from "./data/clientDemos/sandhouse";

export function SandhouseWebCompleta() {
  return (
    <>
      <Helmet><title>Sandhouse — Web Completa</title></Helmet>
      <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{sandhouseDemo.hero.headline}</motion.main>
    </>
  );
}`;
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
    "src/data/clientDemos/sandhouse.ts": `export const sandhouseDemo = {\n  audit: { digitalPresenceScore: 88 },\n  hero: { headline: "Sandhouse — Experiencia Premium" },\n  visualExperience: { embedUrl: "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1" },\n};\n`,
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
    "src/SandhouseLanding.tsx": premiumLanding,
    "src/SandhouseWebCompleta.tsx": premiumWebCompleta,
    // These 4 are genuinely orchestrator-owned — safe to refresh, proving
    // preservation only applies to the premium ones above.
    "src/SandhouseVisualExperience.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseVisualExperience() { return null; }`,
    "src/SandhouseBannerPack.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerPack() { return null; }`,
    "src/SandhouseBannerVertical.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerVertical() { return null; }`,
    "src/SandhouseBannerHorizontal.tsx": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function SandhouseBannerHorizontal() { return null; }`,
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
      assert.ok(body.idempotencyNotes.includes("aurum_existing_premium_components_preserved"));
      assert.ok(body.idempotencyNotes.includes("aurum_app_tsx_unchanged_routes_already_present"));
      assert.ok(body.idempotencyNotes.includes("aurum_manifest_updated"));
      assert.ok(body.idempotencyNotes.includes(`aurum_existing_data_file_detected:src/data/clientDemos/sandhouse.ts`));

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const putPaths = filePuts.map(putPath);

      // The premium components must not appear in the write set at all.
      assert.ok(!putPaths.includes("src/SandhouseLanding.tsx"), "no escribe src/SandhouseLanding.tsx (premium)");
      assert.ok(!putPaths.includes("src/SandhouseWebCompleta.tsx"), "no escribe src/SandhouseWebCompleta.tsx (premium)");

      // App.tsx is untouched (all routes already existed).
      assert.ok(!putPaths.includes("src/App.tsx"), "no toca src/App.tsx");

      // No parallel data file was created for the new slug.
      assert.ok(!putPaths.includes("src/data/clientDemos/sandhouseInmobiliaria.ts"), "no crea sandhouseInmobiliaria.ts");

      // Manifest IS updated.
      const manifestPut = filePuts.find((c) => c.url.includes("AURUM") && putPath(c) === `production-manifests/${slug}.json`);
      assert.ok(manifestPut, "actualiza el manifest AURUM");
      const manifestContent = Buffer.from(JSON.parse(manifestPut.body).content, "base64").toString("utf8");
      assert.match(manifestContent, /immersphere-production-orchestrator-v0\.4\.0/);
      assert.match(manifestContent, /"digitalPresenceScore":\s*56/);

      // Data file IS updated, but only the score — structure preserved.
      const dataFilePut = filePuts.find((c) => putPath(c) === "src/data/clientDemos/sandhouse.ts");
      assert.ok(dataFilePut, "actualiza src/data/clientDemos/sandhouse.ts");
      const dataFileContent = Buffer.from(JSON.parse(dataFilePut.body).content, "base64").toString("utf8");
      assert.match(dataFileContent, /digitalPresenceScore:\s*56/);
      assert.match(dataFileContent, /hero: \{ headline: "Sandhouse — Experiencia Premium" \}/, "preserva la estructura premium del data file");

      // The other 4, genuinely orchestrator-owned components, were safely refreshed.
      assert.ok(putPaths.includes("src/SandhouseVisualExperience.tsx"), "sí refresca el wrapper auto-generado");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Test 2: a genuinely auto-generated component can be safely replaced ─────
test("Test 2 — create-prs reemplaza un componente existente claramente auto-generado", async (t) => {
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
    `vercel.json`,
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`],
  };
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug, generatedBy: "immersphere-production-orchestrator-v0.2",
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport const sandhouse = { audit: { digitalPresenceScore: 35 } };\n`,
    "src/App.tsx": `import { SandhouseLanding } from "./SandhouseLanding";\n<Route path="/${slug}" element={<SandhouseLanding />} />`,
    // Clearly produced by orchestrator v0.4.0 — no premium signals at all.
    "src/SandhouseLanding.tsx": `// Auto-generated by immersphere-production-orchestrator v0.4.0\nimport React from "react";\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() {\n  const cfg = sandhouse;\n  return <main>{cfg.client?.name}</main>;\n}\n`,
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
      assert.ok(!body.idempotencyNotes.includes("aurum_existing_premium_components_preserved"), "nada se preserva como premium");

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const landingPut = filePuts.find((c) => putPath(c) === "src/SandhouseLanding.tsx");
      assert.ok(landingPut, "el componente auto-generado se reescribe");
      const landingContent = Buffer.from(JSON.parse(landingPut.body).content, "base64").toString("utf8");
      assert.match(landingContent, /export function SandhouseLanding\(\)/);
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Test 3: blocks instead of destroying an unparseable data file ───────────
test("Test 3 — create-prs bloquea con aurum_existing_data_file_requires_manual_review si no puede parchear el score con seguridad", async (t) => {
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
    `vercel.json`,
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`],
  };
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug, generatedBy: "immersphere-production-orchestrator-v0.2",
    }, null, 2),
    // No recognizable `digitalPresenceScore: <n>` field anywhere — a
    // surgical patch cannot safely locate what to update.
    "src/data/clientDemos/sandhouse.ts": `export const sandhouse = buildClientDemoFromCms({ slug: "${slug}" });\n`,
    "src/App.tsx": `import { SandhouseLanding } from "./SandhouseLanding";\n<Route path="/${slug}" element={<SandhouseLanding />} />`,
    "src/SandhouseLanding.tsx": `import { Helmet } from "react-helmet-async";\nimport { sandhouse } from "@/data/clientDemos/sandhouse";\nexport function SandhouseLanding() { return <Helmet />; }`,
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug }));
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.blocked, true);
      assert.ok(body.blockers.includes("aurum_existing_data_file_requires_manual_review:src/data/clientDemos/sandhouse.ts"));
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

// ─── Test 4: App.tsx no-op avoided when every route already exists ───────────
test("Test 4 — create-prs no toca App.tsx cuando todas las rutas ya existen", async (t) => {
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
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  const marker = (name) => `// Auto-generated by immersphere-production-orchestrator v0.3\nexport function ${name}() { return null; }`;
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug, generatedBy: "immersphere-production-orchestrator-v0.2",
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `// Auto-generated by immersphere-production-orchestrator v0.3\nexport const sandhouse = { audit: { digitalPresenceScore: 35 } };\n`,
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
    "src/SandhouseLanding.tsx": marker("SandhouseLanding"),
    "src/SandhouseWebCompleta.tsx": marker("SandhouseWebCompleta"),
    "src/SandhouseVisualExperience.tsx": marker("SandhouseVisualExperience"),
    "src/SandhouseBannerPack.tsx": marker("SandhouseBannerPack"),
    "src/SandhouseBannerVertical.tsx": marker("SandhouseBannerVertical"),
    "src/SandhouseBannerHorizontal.tsx": marker("SandhouseBannerHorizontal"),
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes, fileContents);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug }));
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, true);
      assert.ok(body.idempotencyNotes.includes("aurum_app_tsx_unchanged_routes_already_present"));

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      assert.ok(!filePuts.some((c) => putPath(c) === "src/App.tsx"), "writeFileToRepo nunca recibe src/App.tsx");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ─── Test 5: AURUM PR #11 regression — no mass replacement of premium ────────
// content with basic auto-generated wrappers. All 6 route components are
// premium/hand-authored this time (the worst case the real bug produced):
// the entire write set for components must come back empty.
test("Test 5 — regresión PR #11: ningún componente premium se sustituye por un wrapper básico", async (t) => {
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
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };
  // A realistic, sizeable premium landing — multiple editorial sections,
  // not a one-liner — exactly what AURUM PR #11 replaced with a basic
  // hero+iframe template.
  const premium = (name) => `import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { CustomCursor } from "./CustomCursor";
import { GridOverlay } from "./GridOverlay";
import { useSmoothScroll } from "./hooks/useSmoothScroll";
import gsap from "gsap";
import SplitType from "split-type";
import { ArrowRight } from "lucide-react";
import { sandhouseDemo } from "./data/clientDemos/sandhouse";

export function ${name}() {
  useSmoothScroll();
  return (
    <>
      <Helmet><title>Sandhouse — Editorial Premium</title></Helmet>
      <CustomCursor />
      <GridOverlay />
      <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <section className="hero-editorial">{sandhouseDemo.hero.headline}<ArrowRight /></section>
        <section className="gallery-cinematic">{sandhouseDemo.hero.propertyImages?.map((src) => src)}</section>
        <section className="closing-statement">Una experiencia inmobiliaria irrepetible.</section>
      </motion.main>
    </>
  );
}`;
  const fileContents = {
    [`production-manifests/${slug}.json`]: JSON.stringify({
      slug, generatedBy: "immersphere-production-orchestrator-v0.2",
    }, null, 2),
    "src/data/clientDemos/sandhouse.ts": `export const sandhouseDemo = {\n  audit: { digitalPresenceScore: 88 },\n  hero: { headline: "Sandhouse — Experiencia Premium" },\n};\n`,
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
    "src/SandhouseLanding.tsx": premium("SandhouseLanding"),
    "src/SandhouseWebCompleta.tsx": premium("SandhouseWebCompleta"),
    "src/SandhouseVisualExperience.tsx": premium("SandhouseVisualExperience"),
    "src/SandhouseBannerPack.tsx": premium("SandhouseBannerPack"),
    "src/SandhouseBannerVertical.tsx": premium("SandhouseBannerVertical"),
    "src/SandhouseBannerHorizontal.tsx": premium("SandhouseBannerHorizontal"),
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
      assert.ok(body.idempotencyNotes.includes("aurum_existing_premium_components_preserved"));

      const putPath = (c) => decodeURIComponent(c.url.match(/\/contents\/([^?]+)/)[1]);
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const putPaths = filePuts.map(putPath);

      for (const path of [
        "src/SandhouseLanding.tsx",
        "src/SandhouseWebCompleta.tsx",
        "src/SandhouseVisualExperience.tsx",
        "src/SandhouseBannerPack.tsx",
        "src/SandhouseBannerVertical.tsx",
        "src/SandhouseBannerHorizontal.tsx",
      ]) {
        assert.ok(!putPaths.includes(path), `${path} no se sustituye por un wrapper básico`);
      }

      // Only non-component, genuinely safe outputs were written.
      const componentSuffixes = ["Landing.tsx", "WebCompleta.tsx", "VisualExperience.tsx", "BannerPack.tsx", "BannerVertical.tsx", "BannerHorizontal.tsx"];
      const writtenAurumComponentPaths = putPaths.filter((p) => p.startsWith("src/") && componentSuffixes.some((s) => p.endsWith(s)));
      assert.deepEqual(writtenAurumComponentPaths, [], "ningún componente de ruta AURUM se escribe en este run");
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
