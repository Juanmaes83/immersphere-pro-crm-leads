import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "../src/server.ts";

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
      fullWebDemo: {},
      bannerPack: {},
    },
    rules: {
      clientFacingDomain: "aurum-properties-boutique.vercel.app",
      internalEngine: "rubik-sota-director-de-orquesta.vercel.app",
      noGeneratedWithout200: true,
    },
  };
  return merge(payload, overrides.patch || {});
}

function merge(base, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key]) {
      merge(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
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

async function postJson(baseUrl, path, payload) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

test("/health devuelve ok", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, "dry-run");
  });
});

test("dry-run acepta payload valido Torrevieja Sur", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.leadSlug, "torrevieja-sur");
    assert.equal(body.plannedRepos.crm.needed, false);
  });
});

test("rechaza slug con /", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({ slug: "bad/slug" }));
    assert.equal(status, 400);
    assert.equal(body.ok, false);
  });
});

test("rechaza localhost", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { targetRoutes: { landing: "https://localhost/torrevieja-sur" } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /localhost/);
  });
});

test("rechaza 127.0.0.1", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { targetRoutes: { landing: "https://127.0.0.1/torrevieja-sur" } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /localhost/);
  });
});

test("rechaza file://", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { targetRoutes: { landing: "file:///tmp/torrevieja-sur.html" } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /file_scheme/);
  });
});

test("rechaza /gesture-lab/ en URL publica", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { targetRoutes: { landing: "https://aurum-properties-boutique.vercel.app/gesture-lab/torrevieja-sur" } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /gesture_lab/);
  });
});

test("rechaza dominio distinto a AURUM", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { targetRoutes: { landing: "https://example.com/torrevieja-sur" } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /domain_not_allowed/);
  });
});

test("rechaza generated true", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { hooks: { landingPage: { generated: true } } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /generated_true/);
  });
});

test("dispatch-production devuelve disabled", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/github/dispatch-production", {});
    assert.equal(status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.reason, "disabled_in_v0_1_until_security_review");
  });
});

test("no hay secretos hardcodeados en fuentes del backend", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve("src");
  const files = ["schemas.ts", "security.ts", "logger.ts", "validateProductionPackage.ts", "buildDryRunPlan.ts", "server.ts", "index.ts"];
  const contents = await Promise.all(files.map((file) => fs.readFile(path.join(root, file), "utf8")));
  const joined = contents.join("\n");
  assert.doesNotMatch(joined, /=\s*["']ghp_[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /=\s*["']github_pat_[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /=\s*["']sk-[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /BEGIN PRIVATE KEY[\s\S]+END PRIVATE KEY/);
});
