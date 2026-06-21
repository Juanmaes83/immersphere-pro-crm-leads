import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../src/server.ts";
import { validateProductionPackage } from "../src/validateProductionPackage.ts";
import { AURUM_REPO, RUBIK_REPO } from "../src/pathSecurity.ts";

function validPayload(overrides = {}) {
  const slug = overrides.slug || "torrevieja-sur";
  const payload = {
    lead: {
      id: "lead_torrevieja_sur",
      name: "Torrevieja Sur",
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
      logo: {
        url: "https://cdn.example.com/torrevieja-sur/logo.png",
        source: "manual",
        status: "approved",
      },
      favicon: {
        url: "https://cdn.example.com/torrevieja-sur/favicon.ico",
        status: "candidate",
      },
      heroImage: {
        url: "https://cdn.example.com/torrevieja-sur/hero.jpg",
        status: "approved",
      },
      propertyImages: [
        {
          url: "https://cdn.example.com/torrevieja-sur/gallery-1.jpg",
          source: "manual",
          status: "approved",
          recommendedUse: "hero",
        },
        {
          url: "https://cdn.example.com/torrevieja-sur/banner-1.jpg",
          source: "manual",
          status: "candidate",
          recommendedUse: "banner",
        },
      ],
      videos: [
        {
          url: "/VIDEO_AURUM_HEROWEB.mp4",
          source: "aurum_default",
          status: "candidate",
          recommendedUse: "hero",
        },
      ],
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
    hooks: {
      visualExperience: {},
      landingPage: {},
      fullWebDemo: { heroVideoMotion: true },
      bannerPack: {},
    },
    rules: {
      clientFacingDomain: "aurum-properties-boutique.vercel.app",
      internalEngine: "rubik-sota-director-de-orquesta.vercel.app",
      noGeneratedWithout200: true,
    },
  };
  if (overrides.patch) {
    for (const [key, value] of Object.entries(overrides.patch)) {
      if (value && typeof value === "object" && !Array.isArray(value) && payload[key]) {
        Object.assign(payload[key], value);
      } else {
        payload[key] = value;
      }
    }
  }
  return payload;
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

function installGithubFetchMock(t) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    // Let internal test server calls pass through to the real fetch
    if (u.includes("127.0.0.1") || u.includes("localhost")) {
      return originalFetch(url, options);
    }
    calls.push({ url: u, method: options.method || "GET", body: options.body });

    function resp(payload, status = 200) {
      const body = JSON.stringify(payload);
      return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
    }

    // get default branch
    if (u.includes("/repos/") && !u.includes("/git/") && !u.includes("/pulls") && !u.includes("/contents/")) {
      return resp({ default_branch: "main" });
    }

    // branch head sha / branch exists
    if (u.includes("/git/ref/heads/")) {
      // default branch (main) exists and has a sha
      if (u.endsWith("/main")) {
        return resp({ object: { sha: "mainsha123" } });
      }
      // production branches do not exist yet
      return resp({ message: "Not Found" }, 404);
    }

    // create branch
    if (u.includes("/git/refs") && options.method === "POST") {
      return resp({ ref: "refs/heads/production/torrevieja-sur" }, 201);
    }

    // get file info / contents
    if (u.includes("/contents/") && (!options.method || options.method === "GET")) {
      return resp({ message: "Not Found" }, 404);
    }

    // create or update file
    if (u.includes("/contents/") && options.method === "PUT") {
      return resp({ content: { sha: "filesha" } }, 201);
    }

    // list open PRs (preflight) — pretend none exist
    if (u.includes("/pulls") && (!options.method || options.method === "GET")) {
      return resp([], 200);
    }

    // create PR
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

test("create-prs real con mocks crea ramas, archivos y PRs reales", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const { calls } = installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload());
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.mode, "create-prs");
      assert.equal(body.writeAttempted, true);
      assert.ok(body.jobId, "jobId present");
      assert.ok(body.pullRequests, "pullRequests present");

      const aurumPr = body.pullRequests[AURUM_REPO];
      const rubikPr = body.pullRequests[RUBIK_REPO];
      assert.ok(aurumPr, "aurum PR present");
      assert.ok(rubikPr, "rubik PR present");
      assert.match(aurumPr.url, /github\.com\/.*AURUM.*\/pull\/42/);
      assert.match(rubikPr.url, /github\.com\/.*Rubik.*\/pull\/43/);
      assert.equal(aurumPr.branch, "production/torrevieja-sur-public-pages");
      assert.equal(rubikPr.branch, "production/torrevieja-sur-visual-assets");

      // Verify GitHub API calls
      const branchCreates = calls.filter((c) => c.url.includes("/git/refs") && c.method === "POST");
      const filePuts = calls.filter((c) => c.url.includes("/contents/") && c.method === "PUT");
      const prCreates = calls.filter((c) => c.url.includes("/pulls") && c.method === "POST");
      assert.equal(branchCreates.length, 2, "created two branches");
      assert.ok(filePuts.length >= 6, "wrote several files");
      assert.equal(prCreates.length, 2, "created two PRs");

      // Response Bundle checks
      const bundle = body.responseBundle;
      assert.ok(bundle, "responseBundle present");
      assert.equal(bundle.schemaVersion, "operator-response-bundle/1.0");
      assert.equal(bundle.status, "pr_created");
      assert.equal(bundle.assetMode, "client_real_asset");
      assert.deepEqual(bundle.publicRoutes, {});
      assert.ok(bundle.plannedPublicRoutes.landing, "planned landing route");
      assert.ok(bundle.plannedPublicRoutes.visualExperience, "planned visualExperience route");
      assert.ok(bundle.plannedPublicRoutes.webCompleta, "planned webCompleta route");
      assert.ok(bundle.plannedPublicRoutes.bannerPack, "planned bannerPack route");
      assert.equal(bundle.pullRequests.aurum.url, aurumPr.url);
      assert.equal(bundle.pullRequests.rubik.url, rubikPr.url);
      assert.equal(bundle.pullRequests.crm, null);
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("create-prs real con mocks aplica patch de App.tsx y vercel.json", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const { calls } = installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/create-prs", validPayload());
      assert.equal(status, 200);
      assert.equal(body.ok, true);

      const appTsxPuts = calls.filter(
        (c) => c.url.includes("/contents/src/App.tsx") && c.method === "PUT",
      );
      const vercelPuts = calls.filter(
        (c) => c.url.includes("/contents/vercel.json") && c.method === "PUT",
      );
      assert.equal(appTsxPuts.length, 1, "patched App.tsx once");
      assert.equal(vercelPuts.length, 1, "patched vercel.json once");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

test("POST /api/crm/import-response-bundle valida schema y devuelve publication_pending", async (t) => {
  await withServer(async (baseUrl) => {
    const bundle = {
      schemaVersion: "operator-response-bundle/1.0",
      jobId: "pr_1234567890_torrevieja-sur",
      leadId: "lead_torrevieja_sur",
      slug: "torrevieja-sur",
      status: "pr_created",
      source: "railway-operator-create-prs",
      pullRequests: {
        aurum: { url: "https://github.com/Juanmaes83/AURUM_PROPERTIES_BOUTIQUE/pull/42", number: 42, branch: "production/torrevieja-sur-public-pages" },
        rubik: { url: "https://github.com/Juanmaes83/Rubik-Sota-Director-de-Orquesta/pull/43", number: 43, branch: "production/torrevieja-sur-visual-assets" },
        crm: null,
      },
      plannedPublicRoutes: {
        landing: "https://aurum-properties-boutique.vercel.app/torrevieja-sur",
        webCompleta: "https://aurum-properties-boutique.vercel.app/torrevieja-sur-web-completa",
        visualExperience: "https://aurum-properties-boutique.vercel.app/visual-experience/torrevieja-sur",
        bannerPack: "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur",
        bannerVertical: "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur/vertical",
        bannerHorizontal: "https://aurum-properties-boutique.vercel.app/banners/torrevieja-sur/horizontal",
      },
      publicRoutes: {},
      assetMode: "client_real_asset",
      warnings: [],
      errors: [],
      createdAt: new Date().toISOString(),
    };

    const { status, body } = await postJson(baseUrl, "/api/crm/import-response-bundle", {
      leadId: "lead_torrevieja_sur",
      responseBundle: bundle,
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.imported, true);
    assert.equal(body.status, "publication_pending");
    assert.equal(body.jobId, bundle.jobId);
  });
});

test("POST /api/crm/import-response-bundle rechaza schemaVersion inválido", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/crm/import-response-bundle", {
      leadId: "lead_torrevieja_sur",
      responseBundle: { schemaVersion: "wrong", status: "pr_created" },
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_schema_version");
  });
});

test("POST /api/crm/import-response-bundle rechaza status inválido", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/crm/import-response-bundle", {
      leadId: "lead_torrevieja_sur",
      responseBundle: { schemaVersion: "operator-response-bundle/1.0", status: "published_fake" },
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_status");
  });
});

test("pr-plan no crea PRs ni ramas", async (t) => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  process.env.GITHUB_SERVER_TOKEN = "fake-test-token";

  const { calls } = installGithubFetchMock(t);

  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/pr-plan", validPayload());
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.mode, "pr-plan");
      assert.equal(body.blockedWrite, true);
      assert.equal(body.nextStep, "review_required");
      const githubCalls = calls.filter((c) => c.url.includes("api.github.com"));
      assert.equal(githubCalls.length, 0, "pr-plan no debe llamar a GitHub");
    });
  } finally {
    if (prevFlag === undefined) delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    else process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    if (prevToken === undefined) delete process.env.GITHUB_SERVER_TOKEN;
    else process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});
