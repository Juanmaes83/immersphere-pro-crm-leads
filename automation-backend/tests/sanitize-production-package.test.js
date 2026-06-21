import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeProductionPackageForPrAutomation } from "../src/sanitizeProductionPackage.ts";
import { validateProductionPackage } from "../src/validateProductionPackage.ts";
import { startServer } from "../src/server.ts";

const crmLikePayload = {
  schemaVersion: "production-package/5.0",
  lead: {
    id: "20",
    name: "Sandhouse Inmobiliaria",
    slug: "sandhouse-inmobiliaria",
    sector: "Inmobiliaria",
    zone: "Torrevieja",
    website: "https://www.sandhouse.es/contactos",
    email: "info@sandhouse.es",
    phone: "+34 655 187 116",
  },
  audit: {
    status: "complete",
    pagesReviewed: ["https://www.sandhouse.es/contactos"],
    signals: { responsive: true },
    opportunities: ["Experiencia visual"],
    weaknesses: ["Sin tour"],
  },
  auditSnapshot: {
    available: true,
    status: "success",
    score: 56,
  },
  leadIntelligenceProfile: {
    schemaVersion: "lead-intelligence-profile/5.0",
    leadId: "20",
    slug: "sandhouse-inmobiliaria",
    clientName: "Sandhouse Inmobiliaria",
    warnings: [],
    readinessScore: 64,
    sourceTrace: { crm: true },
  },
  commercialDiagnosis: {
    painDetected: "No se detectan tours virtuales/360.",
    opportunityDetected: "Convertir propiedades destacadas en experiencias inmersivas.",
    score: 56,
  },
  fourHooks: {
    visualExperience: {},
    landingPage: {},
    fullWebDemo: { heroVideoMotion: true },
    bannerPack: {},
  },
  hooks: {
    visualExperience: {},
    landingPage: {},
    fullWebDemo: { heroVideoMotion: true },
    bannerPack: {},
  },
  assets: {
    logo: null,
    favicon: null,
    images: ["https://example.com/image.jpg"],
    video: null,
    status: "candidate",
  },
  mediaAssets: {
    logo: { url: "https://example.com/logo.png", source: "manual", status: "approved" },
    favicon: { url: "https://example.com/favicon.ico", status: "candidate" },
    heroImage: { url: "https://example.com/hero.jpg", status: "approved" },
    propertyImages: [
      { url: "https://example.com/g1.jpg", source: "manual", status: "approved", recommendedUse: "hero" },
      { url: "https://example.com/g2.jpg", source: "manual", status: "approved", recommendedUse: "gallery" },
    ],
    videos: [{ url: "/VIDEO_AURUM_HEROWEB.mp4", source: "aurum_default", status: "candidate", recommendedUse: "hero" }],
    brandColors: ["#111", "#d4af37"],
    notes: ["Assets pendientes de validar derechos."],
  },
  targetRoutes: {
    visualExperience: "https://aurum-properties-boutique.vercel.app/visual-experience/sandhouse-inmobiliaria",
    landing: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria",
    webCompleta: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria-web-completa",
    bannerPack: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria",
    bannerVertical: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/vertical",
    bannerHorizontal: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/horizontal",
  },
  candidateRoutes: {},
  publicRoutes: {
    visualExperience: "https://aurum-properties-boutique.vercel.app/visual-experience/sandhouse-inmobiliaria",
    landing: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria",
    webCompleta: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria-web-completa",
    bannerPack: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria",
    bannerVertical: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/vertical",
    bannerHorizontal: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/horizontal",
  },
  reviewableFourHooks: [
    {
      hookId: "visual-experience",
      generated: true,
      published: true,
      publicationStatus: "published",
      publicUrl: "https://aurum-properties-boutique.vercel.app/visual-experience/sandhouse-inmobiliaria",
      title: "Experiencia Visual",
      description: "Demo inmersivo",
      proposal: "Motion design",
      cta: "Ver propiedad",
    },
    {
      hookId: "landing",
      generated: true,
      published: true,
      publicationStatus: "published",
      publicUrl: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria",
      title: "Landing",
      description: "Página comercial",
      proposal: "Headline + CTA",
      cta: "Solicitar propuesta",
    },
    {
      hookId: "web-completa",
      generated: true,
      published: true,
      publicationStatus: "published",
      publicUrl: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria-web-completa",
      title: "Web Completa",
      description: "Web premium",
      proposal: "8 secciones",
      cta: "Ver demo",
    },
    {
      hookId: "banner-pack",
      generated: true,
      published: true,
      publicationStatus: "published",
      publicUrl: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria",
      title: "Banner Pack",
      description: "Banners",
      proposal: "Vertical + horizontal",
      cta: "Ver banners",
    },
  ],
  generatedReviewCount: 4,
  publishedOutputCount: 4,
  publicationStatus: "published",
  publicationWarnings: [],
  outreachMessages: {},
  sourceTrace: { crm: true },
  warnings: [],
  readinessScore: 64,
  generatedAt: new Date().toISOString(),
  source: "crm-four-hooks-generation-flow-v5",
  rules: {
    clientFacingDomain: "aurum-properties-boutique.vercel.app",
    internalEngine: "rubik-sota-director-de-orquesta.vercel.app",
    noGeneratedWithout200: true,
  },
};

test("sanitizeProductionPackage neutraliza flags UI sin perder datos comerciales", () => {
  const clean = sanitizeProductionPackageForPrAutomation(crmLikePayload);

  assert.equal(clean.publicationStatus, undefined);
  assert.equal(clean.publishedOutputCount, undefined);
  assert.equal(clean.generatedReviewCount, undefined);
  assert.equal(clean.publicationWarnings, undefined);

  assert.equal(clean.reviewableFourHooks.length, 4);
  for (const hook of clean.reviewableFourHooks) {
    assert.equal(hook.generated, undefined);
    assert.equal(hook.published, undefined);
    assert.equal(hook.publicationStatus, undefined);
    assert.ok(hook.publicUrl, "conserva publicUrl");
    assert.ok(hook.title, "conserva title");
    assert.ok(hook.cta, "conserva cta");
  }

  assert.equal(clean.lead.name, "Sandhouse Inmobiliaria");
  assert.equal(clean.targetRoutes.landing, "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria");
  assert.equal(clean.publicRoutes.landing, "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria");
  assert.ok(clean.commercialDiagnosis);
  assert.ok(clean.fourHooks);
});

test("validateProductionPackage(payload sin sanitizar) bloquea por generated_true", () => {
  const result = validateProductionPackage(crmLikePayload);
  assert.equal(result.passed, false);
  assert.ok(result.errors.includes("payload: generated_true_blocked"));
});

test("validateProductionPackage(sanitizeProductionPackage(payload)) NO bloquea por generated_true", () => {
  const clean = sanitizeProductionPackageForPrAutomation(crmLikePayload);
  const result = validateProductionPackage(clean);
  assert.equal(result.errors.includes("payload: generated_true_blocked"), false);
});

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

test("POST /api/production/dry-run con payload CRM-like no falla por generated_true_blocked", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/dry-run", crmLikePayload);
    assert.ok(!body.errors?.includes("payload: generated_true_blocked"), "no generated_true_blocked error");
    assert.equal(body.ok, true);
    assert.equal(status, 200);
  });
});

test("POST /api/production/pr-plan con payload CRM-like no falla por generated_true_blocked", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/pr-plan", crmLikePayload);
    assert.ok(!body.errors?.includes("payload: generated_true_blocked"), "no generated_true_blocked error");
    assert.equal(body.ok, true);
    assert.equal(status, 200);
  });
});

test("POST /api/production/github-preflight con payload CRM-like no falla por generated_true_blocked", async () => {
  await withServer(async (baseUrl) => {
    const { status, body } = await postJson(baseUrl, "/api/production/github-preflight", crmLikePayload);
    assert.equal(body.blockers?.includes("payload: generated_true_blocked"), false);
    assert.equal(status, 200);
  });
});
