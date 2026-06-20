import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPremiumFourHookSpecs,
  buildLandingSpec,
  buildVisualExperienceSpec,
  buildFullWebsiteSpec,
  buildBannerPackSpec,
  buildFourHooksQualityReport,
} from "../src/fourHookSpecs.ts";

const FORBIDDEN_STRINGS = [
  "url_pendiente_confirmar",
  "experiencia_visual_premium",
  "Internal draft",
  "Rubik Internal Engine",
  "pending",
  "pendiente de confirmar",
  "lorem",
  "planned",
  "generated",
  "GITHUB_SERVER_TOKEN",
  "ghp_",
  "github_pat_",
];

function collectStrings(value, out = []) {
  if (typeof value === "string") { out.push(value); return out; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return out; }
  if (value && typeof value === "object") { for (const v of Object.values(value)) collectStrings(v, out); }
  return out;
}

function hasForbidden(obj) {
  const text = collectStrings(obj).join("\n");
  return FORBIDDEN_STRINGS.filter(f => text.includes(f));
}

function sandhousePayload() {
  return {
    lead: {
      id: "lead_sandhouse",
      name: "Sandhouse Inmobiliaria",
      slug: "sandhouse-inmobiliaria",
      sector: "Inmobiliaria residencial",
      zone: "Torrevieja",
      city: "Torrevieja",
      province: "Alicante",
      website: "https://www.sandhouse.es/",
      email: "info@sandhouse.es",
      phone: "+34 655 187 116",
      phone2: "+34 646 65 97 20",
      address: "C/ Lanzarote 21 bajo, 03183 Torrevieja, Alicante",
      schedule: "Lun-Vie 9h-14h y 17h-20h / Sab 9h-14h",
      tagline: "La mejor manera de encontrar tu hogar en Torrevieja y en la costa levantina.",
    },
    audit: {
      status: "complete",
      pagesReviewed: ["https://www.sandhouse.es/"],
      signals: { score: 88, responsive: true },
      opportunities: ["Crear un sistema visual premium con cuatro ganchos comerciales revisables."],
      weaknesses: ["Presencia digital con margen de mejora visual y comercial."],
    },
    assets: { logo: null, favicon: null, images: [], video: null, status: "candidate" },
    mediaAssets: {
      logo: { url: null, source: "placeholder", status: "missing" },
      favicon: { url: null, status: "missing" },
      heroImage: { url: null, status: "missing" },
      propertyImages: [],
      videos: [{ url: "/VIDEO_AURUM_HEROWEB.mp4", source: "aurum_default", status: "candidate", recommendedUse: "hero" }],
      brandColors: ["#c4a96a", "#060504"],
      notes: ["Assets pendientes de validacion."],
    },
    targetRoutes: {
      visualExperience: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria/visual-experience",
      landing: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria",
      webCompleta: "https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria-web-completa",
      bannerPack: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria",
      bannerVertical: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/vertical",
      bannerHorizontal: "https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/horizontal",
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
}

function genericPayload() {
  return {
    lead: {
      id: "lead_generico",
      name: "Agencia Levante",
      slug: "agencia-levante",
      sector: "Inmobiliaria",
      zone: "Valencia",
      city: "Valencia",
      website: "https://agencia-levante-example.com",
      email: "hola@agencia-levante-example.com",
      phone: "+34 600 000 001",
    },
    audit: {
      status: "partial",
      pagesReviewed: ["https://agencia-levante-example.com"],
      signals: { score: 70 },
      opportunities: ["Mejorar presencia digital con experiencia visual."],
      weaknesses: ["Web sin imagen de marca consolidada."],
    },
    assets: { logo: null, favicon: null, images: [], video: null, status: "candidate" },
    mediaAssets: {
      logo: { url: "https://cdn.example.com/agencia-levante/logo.png", source: "manual", status: "candidate" },
      favicon: { url: null, status: "missing" },
      heroImage: { url: "https://cdn.example.com/agencia-levante/hero.jpg", status: "candidate" },
      propertyImages: [
        { url: "https://cdn.example.com/agencia-levante/img1.jpg", source: "manual", status: "candidate", recommendedUse: "hero" },
      ],
      videos: [{ url: "/VIDEO_AURUM_HEROWEB.mp4", source: "aurum_default", status: "candidate", recommendedUse: "hero" }],
      brandColors: ["#2244aa", "#ffffff"],
      notes: [],
    },
    targetRoutes: {
      visualExperience: "https://aurum-properties-boutique.vercel.app/agencia-levante/visual-experience",
      landing: "https://aurum-properties-boutique.vercel.app/agencia-levante",
      webCompleta: "https://aurum-properties-boutique.vercel.app/agencia-levante-web-completa",
      bannerPack: "https://aurum-properties-boutique.vercel.app/banners/agencia-levante",
      bannerVertical: "https://aurum-properties-boutique.vercel.app/banners/agencia-levante/vertical",
      bannerHorizontal: "https://aurum-properties-boutique.vercel.app/banners/agencia-levante/horizontal",
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
}

const emptyProposalPackage = { fourHooks: {}, internalNotes: [], reviewChecklist: [] };

// ---- LandingSpec ----

test("buildLandingSpec devuelve campos requeridos por contrato", () => {
  const payload = sandhousePayload();
  const spec = buildLandingSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.equal(spec.hookId, "landing");
  assert.ok(spec.hero?.headline, "hero.headline requerido");
  assert.ok(spec.hero?.primaryCta?.href, "hero.primaryCta.href requerido");
  assert.ok(spec.diagnosis?.painDetected, "diagnosis.painDetected requerido");
  assert.ok(spec.comparison, "comparison requerido");
  assert.ok(Array.isArray(spec.fourHooksSummary) && spec.fourHooksSummary.length === 4, "fourHooksSummary: 4 hooks");
  assert.ok(spec.contact, "contact requerido");
  assert.ok(spec.route, "route requerido");
});

test("buildLandingSpec: headline y CTA contienen datos del lead (Sandhouse)", () => {
  const payload = sandhousePayload();
  const spec = buildLandingSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.ok(spec.hero.headline.includes("Torrevieja") || spec.hero.headline.includes("Sandhouse"), "headline debe referenciar el cliente o zona");
  assert.ok(spec.hero.primaryCta.href.includes("655187116") || spec.hero.primaryCta.href.includes("wa.me"), "CTA href debe incluir telefono verificado");
  assert.ok(spec.contact.email === "info@sandhouse.es", "email del lead en contacto");
});

test("buildLandingSpec: sin strings prohibidas (Sandhouse)", () => {
  const payload = sandhousePayload();
  const spec = buildLandingSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const hits = hasForbidden(spec);
  assert.deepEqual(hits, [], `strings prohibidas en landingSpec: ${hits.join(", ")}`);
});

// ---- VisualExperienceSpec ----

test("buildVisualExperienceSpec devuelve campos requeridos por contrato", () => {
  const payload = sandhousePayload();
  const spec = buildVisualExperienceSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.equal(spec.hookId, "visualExperience");
  assert.ok(spec.narrative, "narrative requerido");
  assert.ok(spec.embedUrl, "embedUrl requerido");
  assert.ok(spec.rubikConfigSeed, "rubikConfigSeed requerido");
  assert.ok(Array.isArray(spec.journeyBlocks) && spec.journeyBlocks.length >= 3, "journeyBlocks: min 3");
  assert.ok(spec.CTA?.href, "CTA.href requerido");
  assert.ok(spec.fallbackPlan, "fallbackPlan requerido");
});

test("buildVisualExperienceSpec: embedUrl apunta a Rubik interno, route AURUM es la publica", () => {
  const payload = sandhousePayload();
  const spec = buildVisualExperienceSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.ok(spec.embedUrl.includes("rubik-sota-director-de-orquesta.vercel.app"), "embedUrl debe ser Rubik interno");
  assert.ok(spec.routes.primary.includes("aurum-properties-boutique.vercel.app"), "route primary debe ser AURUM");
});

test("buildVisualExperienceSpec: sin strings prohibidas (Sandhouse)", () => {
  const payload = sandhousePayload();
  const spec = buildVisualExperienceSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const hits = hasForbidden(spec);
  assert.deepEqual(hits, [], `strings prohibidas en visualExperienceSpec: ${hits.join(", ")}`);
});

// ---- FullWebsiteSpec ----

test("buildFullWebsiteSpec devuelve minimo 8 secciones y campos de contrato", () => {
  const payload = sandhousePayload();
  const spec = buildFullWebsiteSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.equal(spec.hookId, "fullWebsite");
  assert.ok(Array.isArray(spec.sections) && spec.sections.length >= 8, `fullWebsiteSpec debe tener >=8 secciones, tiene ${spec.sections?.length}`);
  assert.ok(spec.finalCTA?.href, "finalCTA.href requerido");
  assert.equal(spec.heroVideoMotion, true, "heroVideoMotion debe ser true cuando el payload lo indica");
  const sectionIds = spec.sections.map(s => s.id);
  assert.ok(sectionIds.includes("inicio"), "seccion inicio requerida");
  assert.ok(sectionIds.includes("contacto"), "seccion contacto requerida");
  assert.ok(sectionIds.includes("experiencia-visual"), "seccion experiencia-visual requerida");
});

test("buildFullWebsiteSpec: sin strings prohibidas (lead generico)", () => {
  const payload = genericPayload();
  const spec = buildFullWebsiteSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const hits = hasForbidden(spec);
  assert.deepEqual(hits, [], `strings prohibidas en fullWebsiteSpec generico: ${hits.join(", ")}`);
});

// ---- BannerPackSpec ----

test("buildBannerPackSpec devuelve campos requeridos y 3 formatos", () => {
  const payload = sandhousePayload();
  const spec = buildBannerPackSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.equal(spec.hookId, "bannerPack");
  assert.ok(Array.isArray(spec.claims) && spec.claims.length >= 3, "claims: minimo 3");
  assert.ok(Array.isArray(spec.formats) && spec.formats.length >= 2, "formats: minimo 2 (vertical + horizontal)");
  assert.ok(spec.formatSpecificCopy?.vertical?.headline, "formatSpecificCopy.vertical.headline requerido");
  assert.ok(spec.formatSpecificCopy?.horizontal?.headline, "formatSpecificCopy.horizontal.headline requerido");
  assert.ok(spec.CTA, "CTA requerido");
  assert.ok(spec.routes?.pack, "routes.pack requerido");
  assert.ok(spec.routes?.vertical, "routes.vertical requerido");
  assert.ok(spec.routes?.horizontal, "routes.horizontal requerido");
});

test("buildBannerPackSpec: vertical y horizontal tienen copy diferenciado", () => {
  const payload = sandhousePayload();
  const spec = buildBannerPackSpec(payload, emptyProposalPackage, payload.targetRoutes);
  assert.notEqual(
    spec.formatSpecificCopy.vertical.subline,
    spec.formatSpecificCopy.horizontal.subline,
    "vertical y horizontal deben tener sublines diferentes",
  );
  assert.ok(spec.formatSpecificCopy.vertical.format, "vertical debe describir su composicion");
  assert.ok(spec.formatSpecificCopy.horizontal.format, "horizontal debe describir su composicion");
});

test("buildBannerPackSpec: sin strings prohibidas (Sandhouse)", () => {
  const payload = sandhousePayload();
  const spec = buildBannerPackSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const hits = hasForbidden(spec);
  assert.deepEqual(hits, [], `strings prohibidas en bannerPackSpec: ${hits.join(", ")}`);
});

// ---- QualityReport ----

test("buildFourHooksQualityReport: passed=true con specs limpias de Sandhouse", () => {
  const payload = sandhousePayload();
  const landing = buildLandingSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const visual = buildVisualExperienceSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const web = buildFullWebsiteSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const banner = buildBannerPackSpec(payload, emptyProposalPackage, payload.targetRoutes);
  const report = buildFourHooksQualityReport(
    { landingSpec: landing, visualExperienceSpec: visual, fullWebsiteSpec: web, bannerPackSpec: banner },
    payload,
  );
  assert.equal(report.passed, true, `QA report debe pasar para Sandhouse. Blockers: ${report.blockers.join("; ")}`);
  assert.ok(Array.isArray(report.checks) && report.checks.length > 0, "checks array debe tener entradas");
  assert.ok(typeof report.summary === "string", "summary requerido");
});

test("buildFourHooksQualityReport: detecta string prohibido y falla", () => {
  const payload = sandhousePayload();
  const badSpec = {
    landingSpec: { headline: "url_pendiente_confirmar", body: "Internal draft for the lead" },
    visualExperienceSpec: { narrative: "ok" },
    fullWebsiteSpec: { sections: [] },
    bannerPackSpec: { claims: ["Rubik Internal Engine"] },
  };
  const report = buildFourHooksQualityReport(badSpec, payload);
  assert.equal(report.passed, false, "QA report debe fallar con strings prohibidas");
  assert.ok(report.blockers.length > 0, "debe haber blockers");
});

// ---- buildPremiumFourHookSpecs (integración) ----

test("buildPremiumFourHookSpecs: devuelve los 5 campos esperados para lead generico", () => {
  const payload = genericPayload();
  const result = buildPremiumFourHookSpecs(payload, emptyProposalPackage, {});
  assert.ok(result.landingSpec, "landingSpec requerido");
  assert.ok(result.visualExperienceSpec, "visualExperienceSpec requerido");
  assert.ok(result.fullWebsiteSpec, "fullWebsiteSpec requerido");
  assert.ok(result.bannerPackSpec, "bannerPackSpec requerido");
  assert.ok(result.qualityReport, "qualityReport requerido");
  assert.equal(typeof result.qualityReport.passed, "boolean", "qualityReport.passed debe ser boolean");
});

test("buildPremiumFourHookSpecs: cuatro hooks con hookId distintos", () => {
  const payload = sandhousePayload();
  const result = buildPremiumFourHookSpecs(payload, emptyProposalPackage, {});
  const ids = [
    result.landingSpec.hookId,
    result.visualExperienceSpec.hookId,
    result.fullWebsiteSpec.hookId,
    result.bannerPackSpec.hookId,
  ];
  const unique = new Set(ids);
  assert.equal(unique.size, 4, "los cuatro hooks deben tener hookIds distintos");
});
