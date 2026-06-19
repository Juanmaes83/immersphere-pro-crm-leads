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

async function postJsonWithHeaders(baseUrl, path, payload, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
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

test("POST exige token si INTERNAL_API_TOKEN esta configurado", async () => {
  const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "local-test-token";
  try {
    await withServer(async (baseUrl) => {
      const denied = await postJsonWithHeaders(baseUrl, "/api/production/dry-run", validPayload());
      assert.equal(denied.status, 401);
      assert.equal(denied.body.error, "unauthorized");

      const allowed = await postJsonWithHeaders(baseUrl, "/api/production/dry-run", validPayload(), {
        "x-internal-api-token": "local-test-token",
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.ok, true);
    });
  } finally {
    if (previous === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
    } else {
      process.env.INTERNAL_API_TOKEN = previous;
    }
  }
});

test("acepta payload completo con mediaAssets", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    assert.equal(body.ok, true);
    assert.equal(body.mediaPlan.logo.status, "approved");
    assert.equal(body.mediaPlan.heroImage.status, "approved");
  });
});

test("devuelve warnings si falta logo", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { mediaAssets: { logo: { url: null, source: "placeholder", status: "missing" } } },
    }));
    assert.equal(body.ok, true);
    assert.match(body.mediaPlan.warnings.join(" "), /logo: missing/);
  });
});

test("devuelve warnings si falta heroImage", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { mediaAssets: { heroImage: { url: null, status: "missing" } } },
    }));
    assert.equal(body.ok, true);
    assert.match(body.mediaPlan.warnings.join(" "), /heroImage: missing/);
  });
});

test("devuelve warning si usa VIDEO_AURUM_HEROWEB.mp4 como fallback", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    assert.equal(body.ok, true);
    assert.match(body.mediaPlan.warnings.join(" "), /VIDEO_AURUM_HEROWEB/);
  });
});

test("devuelve error si webCompleta no contempla hero video motion", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { hooks: { fullWebDemo: { heroVideoMotion: false } } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /heroVideoMotion/);
  });
});

test("planifica template dynamic-motion-banner para G1", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    assert.equal(body.plannedTemplates.visualExperience, "dynamic-motion-banner");
    assert.ok(body.plannedFiles.some((file) => file.template === "dynamic-motion-banner"));
  });
});

test("planifica banner-vertical.html y banner-horizontal.html para G4", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    const files = body.plannedFiles.map((file) => file.path).join(" ");
    assert.match(files, /banner-vertical\.html/);
    assert.match(files, /banner-horizontal\.html/);
  });
});

test("plannedFiles contiene Rubik y AURUM", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    const repos = new Set(body.plannedFiles.map((file) => file.repo));
    assert.equal(repos.has("Rubik"), true);
    assert.equal(repos.has("AURUM"), true);
  });
});

test("plannedTemplates contiene los 4 ganchos", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload());
    assert.deepEqual(Object.keys(body.plannedTemplates).sort(), ["bannerPack", "landing", "visualExperience", "webCompleta"].sort());
  });
});

test("rechaza media URL con localhost", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { mediaAssets: { heroImage: { url: "https://localhost/hero.jpg", status: "candidate" } } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /media_url_localhost/);
  });
});

test("rechaza media URL con file://", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { mediaAssets: { heroImage: { url: "file:///tmp/hero.jpg", status: "candidate" } } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /media_url_file_scheme/);
  });
});

test("rechaza media URL con /gesture-lab/ si se propone como cliente-facing", async () => {
  await withServer(async (baseUrl) => {
    const { body } = await postJson(baseUrl, "/api/production/dry-run", validPayload({
      patch: { mediaAssets: { heroImage: { url: "https://aurum-properties-boutique.vercel.app/gesture-lab/torrevieja-sur/hero.jpg", status: "candidate" } } },
    }));
    assert.equal(body.ok, false);
    assert.match(body.validation.errors.join(" "), /media_url_gesture_lab/);
  });
});
