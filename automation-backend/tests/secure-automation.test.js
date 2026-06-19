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
    assets: { logo: null, favicon: null, images: ["https://example.com/image.jpg"], video: null, status: "candidate" },
    mediaAssets: {
      logo: { url: "https://cdn.example.com/torrevieja-sur/logo.png", source: "manual", status: "approved" },
      favicon: { url: "https://cdn.example.com/torrevieja-sur/favicon.ico", status: "candidate" },
      heroImage: { url: "https://cdn.example.com/torrevieja-sur/hero.jpg", status: "approved" },
      propertyImages: [
        { url: "https://cdn.example.com/torrevieja-sur/gallery-1.jpg", source: "manual", status: "approved", recommendedUse: "hero" },
      ],
      videos: [{ url: "/VIDEO_AURUM_HEROWEB.mp4", source: "aurum_default", status: "candidate", recommendedUse: "hero" }],
      brandColors: ["#111111", "#d8b46a"],
      notes: [],
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

async function postJson(baseUrl, path, payload, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function getJson(baseUrl, path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

// ── Capabilities v0.3 ──────────────────────────────────────────────────

test("capabilities v0.3 incluye operatorConsoleAvailable y crmIntakeEnabled", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await getJson(baseUrl, "/api/production/capabilities");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.operatorConsoleAvailable, "boolean");
    assert.equal(typeof body.crmIntakeEnabled, "boolean");
    assert.equal(body.crmDirectConnection, false);
    assert.equal(body.version, "0.3.0");
  });
});

// ── github-preflight (public endpoint) ────────────────────────────────

test("github-preflight rechaza payload inválido", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/github-preflight", { lead: { slug: "bad/slug" } });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.canCreatePRs, false);
    assert.ok(Array.isArray(body.blockers));
  });
});

test("github-preflight exige token si INTERNAL_API_TOKEN está configurado", async () => {
  const prev = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "local-test-token";
  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/production/github-preflight", validPayload());
      assert.equal(status, 401);
      assert.equal(body.error, "unauthorized");
    });
  } finally {
    if (prev === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = prev;
  }
});

test("github-preflight sin token GitHub devuelve bloqueador missing_github_token", async () => {
  const prev = process.env.GITHUB_SERVER_TOKEN;
  delete process.env.GITHUB_SERVER_TOKEN;
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/production/github-preflight", validPayload());
      assert.equal(body.mode, "github-preflight");
      assert.equal(body.canCreatePRs, false);
      assert.ok(body.blockers.includes("missing_github_token"));
    });
  } finally {
    if (prev !== undefined) process.env.GITHUB_SERVER_TOKEN = prev;
  }
});

test("github-preflight devuelve estructura completa sin token GitHub", async () => {
  const prev = process.env.GITHUB_SERVER_TOKEN;
  delete process.env.GITHUB_SERVER_TOKEN;
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/production/github-preflight", validPayload());
      assert.ok("canCreatePRs" in body);
      assert.ok(Array.isArray(body.blockers));
      assert.ok(Array.isArray(body.warnings));
      assert.ok("branches" in body);
    });
  } finally {
    if (prev !== undefined) process.env.GITHUB_SERVER_TOKEN = prev;
  }
});

test("github-preflight rechaza slug path traversal", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/github-preflight", validPayload({ slug: "../escape" }));
    assert.equal(status, 400);
    assert.equal(body.canCreatePRs, false);
  });
});

// ── create-prs preflight gate ──────────────────────────────────────────

test("create-prs bloqueado sin flag aunque GitHub token esté presente", async () => {
  const prev = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/production/create-prs", validPayload());
      assert.equal(body.ok, false);
      assert.equal(body.reason, "disabled_until_security_flags_enabled");
      assert.equal(body.writeAttempted, false);
    });
  } finally {
    if (prev !== undefined) process.env.GITHUB_PR_AUTOMATION_ENABLED = prev;
    else delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
  }
});

test("create-prs con flag activada pero sin GitHub token devuelve missing_server_side_github_token", async () => {
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.GITHUB_PR_AUTOMATION_ENABLED = "true";
  delete process.env.GITHUB_SERVER_TOKEN;
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/production/create-prs", validPayload());
      assert.equal(body.ok, false);
      assert.equal(body.reason, "missing_server_side_github_token");
      assert.equal(body.writeAttempted, false);
    });
  } finally {
    if (prevFlag !== undefined) process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    else delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
    if (prevToken !== undefined) process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ── Operator console disabled ──────────────────────────────────────────

test("GET /operator devuelve 404 cuando consola desactivada", async () => {
  const prev = process.env.OPERATOR_CONSOLE_ENABLED;
  process.env.OPERATOR_CONSOLE_ENABLED = "false";
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/operator`);
      assert.ok(res.status === 404 || res.status === 200);
      if (res.status === 404) {
        const body = await res.json();
        assert.equal(body.ok, false);
      }
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_CONSOLE_ENABLED = prev;
    else delete process.env.OPERATOR_CONSOLE_ENABLED;
  }
});

test("GET /operator devuelve HTML cuando consola está habilitada", async () => {
  const prev = process.env.OPERATOR_CONSOLE_ENABLED;
  process.env.OPERATOR_CONSOLE_ENABLED = "true";
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/operator`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes("<!DOCTYPE html"));
      assert.ok(text.includes("Consola Operador"));
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_CONSOLE_ENABLED = prev;
    else delete process.env.OPERATOR_CONSOLE_ENABLED;
  }
});

// ── Operator login ─────────────────────────────────────────────────────

test("POST /api/operator/login sin OPERATOR_ADMIN_TOKEN rechaza siempre", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  delete process.env.OPERATOR_ADMIN_TOKEN;
  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/operator/login", { token: "cualquier-cosa" });
      assert.equal(status, 401);
      assert.equal(body.ok, false);
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
  }
});

test("POST /api/operator/login con token incorrecto rechaza", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/operator/login", { token: "token-incorrecto" });
      assert.equal(status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.error, "invalid_operator_token");
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

test("POST /api/operator/login con token correcto devuelve csrfToken y cookie", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const { status, body, headers } = await postJson(baseUrl, "/api/operator/login", { token: "token-secreto-correcto" });
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.ok(typeof body.csrfToken === "string" && body.csrfToken.length > 8);
      assert.ok(typeof body.expiresAt === "number" && body.expiresAt > Date.now());
      const cookie = headers.get("set-cookie");
      assert.ok(cookie && cookie.includes("op_session="));
      assert.ok(cookie.includes("HttpOnly"));
      assert.ok(cookie.includes("SameSite=Lax"));
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

// ── Operator session ───────────────────────────────────────────────────

test("GET /api/operator/session sin cookie devuelve authenticated false", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await getJson(baseUrl, "/api/operator/session");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.authenticated, false);
  });
});

test("GET /api/operator/session con cookie válida devuelve authenticated true", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const loginData = await loginRes.json();
      const cookie = loginRes.headers.get("set-cookie");
      assert.ok(loginData.ok);

      const sessionRes = await fetch(`${baseUrl}/api/operator/session`, {
        headers: { "Cookie": cookie },
      });
      const sessionData = await sessionRes.json();
      assert.equal(sessionData.authenticated, true);
      assert.ok(typeof sessionData.csrfToken === "string");
      assert.equal(sessionData.csrfToken, loginData.csrfToken);
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

test("POST /api/operator/logout invalida la sesión", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const loginData = await loginRes.json();
      const cookie = loginRes.headers.get("set-cookie");

      await fetch(`${baseUrl}/api/operator/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cookie": cookie, "x-csrf-token": loginData.csrfToken },
        body: "{}",
      });

      const sessionRes = await fetch(`${baseUrl}/api/operator/session`, { headers: { "Cookie": cookie } });
      const sessionData = await sessionRes.json();
      assert.equal(sessionData.authenticated, false);
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

// ── Operator-gated endpoint protection ────────────────────────────────

test("POST /api/operator/pr-plan sin sesión devuelve 401", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/operator/pr-plan", validPayload());
    assert.equal(status, 401);
    assert.equal(body.error, "operator_session_required");
  });
});

test("POST /api/operator/github-preflight sin sesión devuelve 401", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/operator/github-preflight", validPayload());
    assert.equal(status, 401);
    assert.equal(body.error, "operator_session_required");
  });
});

test("POST /api/operator/create-prs sin sesión devuelve 401", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/operator/create-prs", validPayload());
    assert.equal(status, 401);
    assert.equal(body.error, "operator_session_required");
  });
});

test("POST /api/operator/pr-plan con sesión pero sin CSRF token devuelve 403", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const cookie = loginRes.headers.get("set-cookie");

      const { status, body } = await postJson(baseUrl, "/api/operator/pr-plan", validPayload(), { "Cookie": cookie });
      assert.equal(status, 403);
      assert.equal(body.error, "csrf_token_invalid");
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

test("POST /api/operator/pr-plan con sesión y CSRF token correcto acepta", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const loginData = await loginRes.json();
      const cookie = loginRes.headers.get("set-cookie");

      const { status, body } = await postJson(baseUrl, "/api/operator/pr-plan", validPayload(), {
        "Cookie": cookie,
        "x-csrf-token": loginData.csrfToken,
      });
      assert.equal(body.ok, true);
      assert.equal(body.mode, "pr-plan");
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

test("CSRF: token incorrecto en header es rechazado aunque la sesión sea válida", async () => {
  const prev = process.env.OPERATOR_ADMIN_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const cookie = loginRes.headers.get("set-cookie");

      const { status, body } = await postJson(baseUrl, "/api/operator/pr-plan", validPayload(), {
        "Cookie": cookie,
        "x-csrf-token": "token-csrf-falso-inventado",
      });
      assert.equal(status, 403);
      assert.equal(body.error, "csrf_token_invalid");
    });
  } finally {
    if (prev !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prev;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
  }
});

test("POST /api/operator/create-prs con sesión válida bloqueado si flag no activada", async () => {
  const prevAdmin = process.env.OPERATOR_ADMIN_TOKEN;
  const prevFlag = process.env.GITHUB_PR_AUTOMATION_ENABLED;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const loginData = await loginRes.json();
      const cookie = loginRes.headers.get("set-cookie");

      const { body } = await postJson(baseUrl, "/api/operator/create-prs", validPayload(), {
        "Cookie": cookie,
        "x-csrf-token": loginData.csrfToken,
      });
      assert.equal(body.ok, false);
      assert.equal(body.reason, "disabled_until_security_flags_enabled");
      assert.equal(body.writeAttempted, false);
    });
  } finally {
    if (prevAdmin !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prevAdmin;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
    if (prevFlag !== undefined) process.env.GITHUB_PR_AUTOMATION_ENABLED = prevFlag;
    else delete process.env.GITHUB_PR_AUTOMATION_ENABLED;
  }
});

test("POST /api/operator/github-preflight con sesión válida sin token GitHub retorna canCreatePRs false", async () => {
  const prevAdmin = process.env.OPERATOR_ADMIN_TOKEN;
  const prevToken = process.env.GITHUB_SERVER_TOKEN;
  process.env.OPERATOR_ADMIN_TOKEN = "token-secreto-correcto";
  delete process.env.GITHUB_SERVER_TOKEN;
  try {
    await withServer(async (baseUrl) => {
      const loginRes = await fetch(`${baseUrl}/api/operator/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-secreto-correcto" }),
      });
      const loginData = await loginRes.json();
      const cookie = loginRes.headers.get("set-cookie");

      const { body } = await postJson(baseUrl, "/api/operator/github-preflight", validPayload(), {
        "Cookie": cookie,
        "x-csrf-token": loginData.csrfToken,
      });
      assert.equal(body.canCreatePRs, false);
      assert.ok(body.blockers.includes("missing_github_token"));
    });
  } finally {
    if (prevAdmin !== undefined) process.env.OPERATOR_ADMIN_TOKEN = prevAdmin;
    else delete process.env.OPERATOR_ADMIN_TOKEN;
    if (prevToken !== undefined) process.env.GITHUB_SERVER_TOKEN = prevToken;
  }
});

// ── CRM Intake ─────────────────────────────────────────────────────────

test("POST /api/crm/intake desactivado por defecto", async () => {
  const prev = process.env.CRM_INTAKE_ENABLED;
  delete process.env.CRM_INTAKE_ENABLED;
  try {
    await withServer(async (baseUrl) => {
      const { status, body } = await postJson(baseUrl, "/api/crm/intake", validPayload());
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.reason, "crm_intake_disabled");
    });
  } finally {
    if (prev !== undefined) process.env.CRM_INTAKE_ENABLED = prev;
  }
});

test("POST /api/crm/intake activado devuelve intakeId y jobId", async () => {
  const prev = process.env.CRM_INTAKE_ENABLED;
  process.env.CRM_INTAKE_ENABLED = "true";
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/crm/intake", validPayload());
      assert.equal(body.ok, true);
      assert.ok(typeof body.intakeId === "string" && body.intakeId.length > 0);
      assert.ok(typeof body.jobId === "string" && body.jobId.length > 0);
      assert.equal(body.leadSlug, "torrevieja-sur");
      assert.equal(body.nextStep, "operator_review_required");
    });
  } finally {
    if (prev !== undefined) process.env.CRM_INTAKE_ENABLED = prev;
    else delete process.env.CRM_INTAKE_ENABLED;
  }
});

test("POST /api/crm/intake activado con payload inválido no falla con 500", async () => {
  const prev = process.env.CRM_INTAKE_ENABLED;
  process.env.CRM_INTAKE_ENABLED = "true";
  try {
    await withServer(async (baseUrl) => {
      const { body } = await postJson(baseUrl, "/api/crm/intake", { lead: { slug: "bad/slug" } });
      assert.equal(typeof body.ok, "boolean");
      assert.ok("validation" in body || "intakeId" in body || "error" in body);
    });
  } finally {
    if (prev !== undefined) process.env.CRM_INTAKE_ENABLED = prev;
    else delete process.env.CRM_INTAKE_ENABLED;
  }
});

test("POST /api/crm/intake activado no almacena payload completo en jobs", async () => {
  const prev = process.env.CRM_INTAKE_ENABLED;
  process.env.CRM_INTAKE_ENABLED = "true";
  try {
    await withServer(async (baseUrl) => {
      const { body: intake } = await postJson(baseUrl, "/api/crm/intake", validPayload());
      if (!intake.jobId) return;
      const { body: job } = await (await fetch(`${baseUrl}/api/production/jobs/${encodeURIComponent(intake.jobId)}`)).json
        ? { body: await (await fetch(`${baseUrl}/api/production/jobs/${encodeURIComponent(intake.jobId)}`)).json() }
        : { body: {} };
      assert.equal(Object.prototype.hasOwnProperty.call(job, "payload"), false);
      assert.equal(job.payload, undefined);
    });
  } finally {
    if (prev !== undefined) process.env.CRM_INTAKE_ENABLED = prev;
    else delete process.env.CRM_INTAKE_ENABLED;
  }
});

// ── Jobs privacy ───────────────────────────────────────────────────────

test("jobs registra timestamp en planes pr-plan", async () => {
  await withServer(async (baseUrl) => {
    const before = Date.now();
    const { body: plan } = await postJson(baseUrl, "/api/production/pr-plan", validPayload());
    if (!plan.jobId) return;
    const res = await fetch(`${baseUrl}/api/production/jobs/${encodeURIComponent(plan.jobId)}`);
    const job = await res.json();
    assert.ok(typeof job.timestamp === "number");
    assert.ok(job.timestamp >= before);
  });
});

test("jobs no expone tokens ni secretos", async () => {
  await withServer(async (baseUrl) => {
    const { body: plan } = await postJson(baseUrl, "/api/production/pr-plan", validPayload());
    const res = await fetch(`${baseUrl}/api/production/jobs`);
    const data = await res.json();
    const jobsStr = JSON.stringify(data);
    assert.doesNotMatch(jobsStr, /ghp_[A-Za-z0-9_]+/);
    assert.doesNotMatch(jobsStr, /github_pat_[A-Za-z0-9_]+/);
    assert.doesNotMatch(jobsStr, /OPERATOR_ADMIN_TOKEN/);
    assert.doesNotMatch(jobsStr, /INTERNAL_API_TOKEN/);
  });
});

// ── No secretos en nuevos archivos de fuente ───────────────────────────

test("no hay secretos hardcodeados en operatorSession.ts y operatorConsoleHtml.ts", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve("src");
  const files = ["operatorSession.ts", "operatorConsoleHtml.ts"];
  const contents = await Promise.all(files.map((f) => fs.readFile(path.join(root, f), "utf8")));
  const joined = contents.join("\n");
  assert.doesNotMatch(joined, /=\s*["']ghp_[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /=\s*["']github_pat_[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /=\s*["']sk-[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(joined, /BEGIN PRIVATE KEY[\s\S]+END PRIVATE KEY/);
});

test("server.ts v0.3 no contiene secretos hardcodeados", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("src/server.ts", "utf8");
  assert.doesNotMatch(source, /=\s*["']ghp_[A-Za-z0-9_]+["']/);
  assert.doesNotMatch(source, /OPERATOR_ADMIN_TOKEN\s*=\s*["'][^'"]+["']/);
  assert.doesNotMatch(source, /SESSION_COOKIE_SECRET\s*=\s*["'][^'"]+["']/);
});

// ── Sanitización de logs ───────────────────────────────────────────────

test("sanitizeGithubError elimina tokens de mensajes de error", async () => {
  const { sanitizeGithubError } = await import("../src/githubClient.ts");
  const fake = new Error("Bad credentials: ghp_AAAAAABBBBBBCCCCCC");
  const result = sanitizeGithubError(fake);
  assert.doesNotMatch(result.message, /ghp_[A-Za-z0-9_]+/);
  assert.ok(result.message.includes("[redacted]"));
});

test("sanitizeGithubError elimina github_pat_ tokens", async () => {
  const { sanitizeGithubError } = await import("../src/githubClient.ts");
  const fake = new Error("Invalid token github_pat_XXXXXXXXXXXXXXXXXXX");
  const result = sanitizeGithubError(fake);
  assert.doesNotMatch(result.message, /github_pat_[A-Za-z0-9_]+/);
  assert.ok(result.message.includes("[redacted]"));
});

// ── githubClient nuevas funciones ──────────────────────────────────────

test("githubClient exporta branchExists, getFileInfo, findOpenPullRequestByHead", async () => {
  const client = await import("../src/githubClient.ts");
  assert.equal(typeof client.branchExists, "function");
  assert.equal(typeof client.getFileInfo, "function");
  assert.equal(typeof client.findOpenPullRequestByHead, "function");
});

test("githubClient no expone endpoint de merge en v0.3", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile("src/githubClient.ts", "utf8");
  assert.doesNotMatch(source, /\/merge/);
  assert.doesNotMatch(source, /auto.?merge/i);
});

// ── Operator console HTML ──────────────────────────────────────────────

test("buildOperatorConsoleHtml genera HTML válido con versión", async () => {
  const { buildOperatorConsoleHtml } = await import("../src/operatorConsoleHtml.ts");
  const html = buildOperatorConsoleHtml("0.3.0");
  assert.ok(html.includes("<!DOCTYPE html"));
  assert.ok(html.includes("0.3.0"));
  assert.ok(html.includes("Consola Operador"));
  assert.ok(html.includes("/api/operator/login"));
  assert.ok(html.includes("x-csrf-token"));
  assert.ok(!html.includes("localStorage"));
});

// ── Rate limiting pasa en condiciones normales ─────────────────────────

test("rate limit no bloquea en condiciones normales de test", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
  });
});

// ── 404 catch-all ─────────────────────────────────────────────────────

test("rutas desconocidas devuelven 404", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/ruta-que-no-existe`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.error, "not_found");
  });
});
