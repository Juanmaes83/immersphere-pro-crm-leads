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

function installGithubFetchMock(t, existingFiles = new Set(), existingRoutes = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];

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
      if (filePath === "vercel.json") {
        const rewrites = (existingRoutes.rubikRewrites || []).map((r) => ({ source: r, destination: `/dynamic-motion-banner/${existingRoutes.slug}/banner-vertical.html` }));
        return resp({ content: Buffer.from(JSON.stringify({ rewrites }, null, 2)).toString("base64"), sha: "vercelsha" });
      }
      if (filePath === "src/App.tsx") {
        const routes = (existingRoutes.aurumRoutes || []).map((r) => `<Route path="${r}" element={<div />} />`);
        return resp({ content: Buffer.from(routes.join("\n")).toString("base64"), sha: "appsha" });
      }
      if (existingFiles.has(filePath)) {
        return resp({ content: Buffer.from("existing").toString("base64"), sha: "filesha" });
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

test("create-prs para Sandhouse con outputs existentes no crea PRs", async (t) => {
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
    `production-manifests/${slug}.json`,
  ]);
  const existingRoutes = {
    slug,
    rubikRewrites: [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ],
    aurumRoutes: [`/${slug}`, `/${slug}-web-completa`, `/visual-experience/${slug}`, `/banners/${slug}`],
  };

  const { calls } = installGithubFetchMock(t, existingFiles, existingRoutes);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload({ slug }));
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.writeAttempted, false);
      assert.equal(body.status, "existing_outputs_found");
      assert.deepEqual(body.pullRequests, {});
      assert.equal(body.responseBundle.status, "needs_existing_output_review");
      assert.ok(body.responseBundle.warnings.some((w) => w.includes("existing_outputs_detected")), "warning de outputs existentes");

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
