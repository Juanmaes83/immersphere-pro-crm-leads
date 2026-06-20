// Lead Intelligence Profile + Production Package v5 — CRM-side end-to-end tests.
// Loads crm.html, evaluates the embedded <script> in a sandbox VM, and exercises
// the new pure functions: normalizeMapsProfile, normalizeExternalAuditProfile,
// buildLeadIntelligenceProfileFromLead, buildAuditSnapshotFromLead,
// buildTargetRoutesFromLead, buildProductionPackageFromLead.
//
// Golden leads: Casas y Mar, Costa Invest, Sandhouse Inmobiliaria.
// Plus: generic lead without audit, lead with invalid URL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CRM_HTML_PATH = resolve(__dirname, '..', '..', 'crm.html');

function loadCrmSandbox() {
  const html = readFileSync(CRM_HTML_PATH, 'utf8');
  // Extract every <script>…</script> block whose contents are CRM JS (no src attribute).
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html)) !== null) scripts.push(match[1]);
  const code = scripts.join('\n;\n');

  // Stub DOM and storage. We only need a non-crashing surface for module evaluation.
  const noopEl = { value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, click() {}, select() {} };
  const documentStub = {
    getElementById: () => noopEl,
    querySelector: () => noopEl,
    querySelectorAll: () => [],
    createElement: () => noopEl,
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
    execCommand: () => true,
    readyState: 'complete'
  };
  const localStorageStub = (() => {
    const store = new Map();
    return {
      getItem: (k) => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };
  })();
  const sandbox = {
    window: {},
    document: documentStub,
    localStorage: localStorageStub,
    location: { hash: '', pathname: '/', origin: 'https://example.test', search: '' },
    navigator: { clipboard: { writeText: async () => {} } },
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    URL,
    Blob: class { constructor() {} },
    crypto: { randomUUID: () => 'test-uuid', getRandomValues: (a) => a },
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}) }),
    alert: () => {},
    prompt: () => null,
    confirm: () => false
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: 'crm.html', timeout: 5000 });
  } catch (err) {
    // Surface init errors only if they prevent the pure functions from being defined.
    if (!sandbox.buildProductionPackageFromLead) throw err;
  }
  return sandbox;
}

const sandbox = loadCrmSandbox();

test('pure functions are exposed in CRM scope', () => {
  for (const fn of [
    'normalizeMapsProfile',
    'normalizeExternalAuditProfile',
    'buildAuditSnapshotFromLead',
    'buildLeadIntelligenceProfileFromLead',
    'buildTargetRoutesFromLead',
    'buildProductionPackageFromLead',
    'validateProductionPackageLocal',
    'fourHooksUrlIsValid'
  ]) {
    assert.equal(typeof sandbox[fn], 'function', `${fn} should be defined`);
  }
});

test('normalizeMapsProfile returns available:false when no data provided', () => {
  const out = sandbox.normalizeMapsProfile(null);
  assert.equal(out.available, false);
  assert.ok(Array.isArray(out.warnings) && out.warnings.includes('maps_profile_not_provided'));
});

test('normalizeMapsProfile normalizes a real-looking Maps payload', () => {
  const out = sandbox.normalizeMapsProfile({
    businessName: 'Inmobiliaria Sandhouse',
    address: 'Calle Mayor 12, Madrid',
    phone: '+34 600 000 000',
    website: 'https://sandhouse.es',
    rating: 4.7,
    reviewCount: 32,
    businessCategory: 'Inmobiliaria',
    openingHours: ['Lunes 09:00–18:00'],
    description: 'Servicios inmobiliarios premium en Madrid.'
  });
  assert.equal(out.available, true);
  assert.equal(out.businessName, 'Inmobiliaria Sandhouse');
  assert.equal(out.rating, 4.7);
  assert.equal(out.reviewCount, 32);
});

test('normalizeExternalAuditProfile handles missing/present states', () => {
  const empty = sandbox.normalizeExternalAuditProfile(null);
  assert.equal(empty.available, false);
  assert.ok(empty.warnings.includes('external_audit_not_provided'));
  const present = sandbox.normalizeExternalAuditProfile({
    source: 'Eigent',
    summary: 'Web auditada por Eigent con score 78',
    signals: [{ kind: 'performance', value: 78 }]
  });
  assert.equal(present.available, true);
  assert.equal(present.source, 'Eigent');
  assert.equal(present.signals.length, 1);
});

test('fourHooksUrlIsValid rejects localhost / gesture-lab / non-http', () => {
  assert.equal(sandbox.fourHooksUrlIsValid(''), false);
  assert.equal(sandbox.fourHooksUrlIsValid('http://localhost:3000'), false);
  assert.equal(sandbox.fourHooksUrlIsValid('https://127.0.0.1/foo'), false);
  assert.equal(sandbox.fourHooksUrlIsValid('file:///etc/passwd'), false);
  assert.equal(sandbox.fourHooksUrlIsValid('https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/x'), false);
  assert.equal(sandbox.fourHooksUrlIsValid('https://aurum-properties-boutique.vercel.app/casas-y-mar'), true);
  assert.equal(sandbox.fourHooksUrlIsValid('ftp://example.com'), false);
});

function makeLead(overrides) {
  return {
    id: 901,
    empresa: 'Lead Generico',
    sector: 'Inmobiliaria',
    zona: 'Madrid',
    web: 'https://lead-generico.example.com',
    email: 'hola@lead-generico.example.com',
    telefono: '+34 600 111 222',
    whatsapp: '+34 600 111 222',
    direccion: 'Calle Real 1, Madrid',
    score: 60,
    ...overrides
  };
}

function makeSuccessAudit(overrides) {
  return {
    auditVersion: '3.1',
    status: 'success',
    auditedAt: '2026-06-10T08:00:00.000Z',
    inputUrl: 'https://lead-generico.example.com',
    baseUrl: 'https://lead-generico.example.com/',
    website: 'https://lead-generico.example.com',
    finalUrl: 'https://lead-generico.example.com/',
    reachable: true,
    httpStatus: 200,
    usesHttps: true,
    loadTimeMs: 820,
    title: 'Inmobiliaria Premium',
    metaDescription: 'Servicios inmobiliarios',
    language: 'es',
    htmlSize: 24000,
    pagesAudited: 4,
    auditedUrls: ['https://lead-generico.example.com/', 'https://lead-generico.example.com/propiedades'],
    pageTypesAudited: ['home', 'listings'],
    pages: [],
    verticalProfile: 'real_estate',
    labels: {},
    signals: {
      hasTitle: true, hasMetaDescription: true, hasViewport: true,
      hasPhone: true, hasEmail: true, hasWhatsapp: true,
      hasContactForm: false, hasClearCTA: true,
      hasPropertyListings: true, hasVirtualTourSignals: false, hasVideoSignals: false,
      hasSocialLinks: true, hasGenericPortalSignals: false, hasPremiumSignals: false
    },
    verticalSignals: {},
    evidence: {},
    technologySignals: [],
    weaknesses: ['Sin tour 360 detectado en las fichas.', 'Sin video corto comercial.'],
    opportunities: ['Convertir cada ficha en experiencia interactiva con tour 360 y CTA premium.'],
    websiteOpportunityScore: 72,
    recommendedService: 'Tour 360 + Video corto + Landing premium',
    recommendedNextAction: 'Llamar y proponer pieza visual sobre una ficha real.',
    confidence: 'alta',
    ...overrides
  };
}

test('buildAuditSnapshotFromLead returns full snapshot when audit available', () => {
  const lead = makeLead({ websiteAudit: makeSuccessAudit() });
  const snap = sandbox.buildAuditSnapshotFromLead(lead);
  assert.equal(snap.available, true);
  assert.equal(snap.status, 'success');
  assert.equal(snap.https, true);
  assert.equal(snap.httpStatus, 200);
  assert.equal(snap.score, 72);
  assert.equal(snap.hasProperties, true);
  assert.equal(snap.hasTour360, false);
  assert.ok(snap.weaknesses.length >= 1);
  assert.ok(snap.opportunities.length >= 1);
  assert.equal(snap.lastAuditedAt, '2026-06-10T08:00:00.000Z');
});

test('buildAuditSnapshotFromLead returns available:false when no audit', () => {
  const lead = makeLead({ websiteAudit: null });
  const snap = sandbox.buildAuditSnapshotFromLead(lead);
  assert.equal(snap.available, false);
  assert.equal(snap.status, 'missing');
  assert.equal(snap.hasProperties, false);
});

test('Lead with full audit → Production Package contains auditSnapshot + leadIntelligenceProfile', () => {
  const lead = makeLead({ websiteAudit: makeSuccessAudit() });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.schemaVersion, 'production-package/5.0');
  assert.ok(pkg.auditSnapshot, 'auditSnapshot must be present');
  assert.equal(pkg.auditSnapshot.available, true);
  assert.ok(pkg.leadIntelligenceProfile, 'leadIntelligenceProfile must be present');
  assert.equal(pkg.leadIntelligenceProfile.schemaVersion, 'lead-intelligence-profile/5.0');
  assert.ok(pkg.leadIntelligenceProfile.sourceTrace.clientName);
  assert.ok(Array.isArray(pkg.warnings));
  assert.ok(typeof pkg.readinessScore === 'number');
  assert.ok(pkg.readinessScore >= 0 && pkg.readinessScore <= 100);
});

test('Lead without audit → warnings include audit_missing, no invented data', () => {
  const lead = makeLead({ websiteAudit: null });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.auditSnapshot.available, false);
  const codes = (pkg.warnings || []).map(w => w.code);
  assert.ok(codes.includes('web_audit_missing_or_partial'));
  // No invented assets — all asset URLs should be null.
  assert.equal(pkg.leadIntelligenceProfile.assets.logo, null);
});

test('Casas y Mar golden lead → resolves to canonical AURUM + Rubik routes', () => {
  const lead = makeLead({
    id: 1,
    empresa: 'Casas y Mar',
    sector: 'Inmobiliaria',
    zona: 'Costa Blanca',
    web: 'https://casasymar.com',
    websiteAudit: makeSuccessAudit({ website: 'https://casasymar.com', finalUrl: 'https://casasymar.com/', baseUrl: 'https://casasymar.com/' })
  });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.lead.slug, 'casas-y-mar');
  // The visual experience should resolve to either the commercialHooks Rubik URL (if seeded) or known route.
  assert.ok(
    pkg.targetRoutes.visualExperience.startsWith('https://rubik-sota-director-de-orquesta.vercel.app/dynamic-motion-banner/casas-y-mar') ||
    pkg.targetRoutes.visualExperience === 'https://aurum-properties-boutique.vercel.app/visual-experience/casas-y-mar',
    `unexpected route: ${pkg.targetRoutes.visualExperience}`
  );
  assert.equal(pkg.targetRoutes.landing, 'https://aurum-properties-boutique.vercel.app/casas-y-mar');
  assert.equal(pkg.targetRoutes.webCompleta, 'https://aurum-properties-boutique.vercel.app/casas-y-mar');
  assert.ok(sandbox.fourHooksUrlIsValid(pkg.targetRoutes.landing));
});

test('Costa Invest golden lead → resolves to canonical Costa Invest routes', () => {
  const lead = makeLead({
    id: 2,
    empresa: 'Costa Invest',
    sector: 'Inmobiliaria',
    zona: 'Costa del Sol',
    web: 'https://costainvest.es',
    websiteAudit: makeSuccessAudit({ website: 'https://costainvest.es', finalUrl: 'https://costainvest.es/' })
  });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.lead.slug, 'costa-invest');
  assert.equal(pkg.targetRoutes.landing, 'https://aurum-properties-boutique.vercel.app/costa-invest');
  assert.equal(pkg.targetRoutes.webCompleta, 'https://aurum-properties-boutique.vercel.app/costa-invest-web-completa');
  assert.equal(pkg.targetRoutes.bannerPack, 'https://aurum-properties-boutique.vercel.app/banners/costa-invest');
  assert.equal(pkg.targetRoutes.bannerVertical, 'https://aurum-properties-boutique.vercel.app/banners/costa-invest/vertical');
  assert.equal(pkg.targetRoutes.bannerHorizontal, 'https://aurum-properties-boutique.vercel.app/banners/costa-invest/horizontal');
});

test('Sandhouse golden lead → resolves to canonical Sandhouse routes', () => {
  const lead = makeLead({
    id: 3,
    empresa: 'Sandhouse Inmobiliaria',
    sector: 'Inmobiliaria',
    zona: 'Madrid',
    web: 'https://sandhouse.es',
    email: 'info@sandhouse.es',
    telefono: '+34 911 000 000',
    websiteAudit: makeSuccessAudit({ website: 'https://sandhouse.es', finalUrl: 'https://sandhouse.es/' })
  });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.lead.slug, 'sandhouse-inmobiliaria');
  assert.equal(pkg.targetRoutes.landing, 'https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria');
  assert.equal(pkg.targetRoutes.webCompleta, 'https://aurum-properties-boutique.vercel.app/sandhouse-inmobiliaria-web-completa');
  assert.equal(pkg.targetRoutes.bannerPack, 'https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria');
  assert.equal(pkg.targetRoutes.bannerVertical, 'https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/vertical');
  assert.equal(pkg.targetRoutes.bannerHorizontal, 'https://aurum-properties-boutique.vercel.app/banners/sandhouse-inmobiliaria/horizontal');
});

test('Production Package validation passes for a golden lead', () => {
  const lead = makeLead({ id: 2, empresa: 'Costa Invest', websiteAudit: makeSuccessAudit() });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  const validation = sandbox.validateProductionPackageLocal(pkg);
  assert.equal(validation.errors.length, 0, `unexpected errors: ${JSON.stringify(validation.errors)}`);
});

test('Production Package validation rejects an invalid route', () => {
  const lead = makeLead({ websiteAudit: makeSuccessAudit() });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  pkg.targetRoutes.landing = 'http://localhost:3000/foo';
  const validation = sandbox.validateProductionPackageLocal(pkg);
  assert.ok(validation.errors.some(e => e.includes('landing: invalid_url')));
});

test('Generic lead without contact data → readinessScore lower, warnings raised', () => {
  const pkg = sandbox.buildProductionPackageFromLead({ id: 999, empresa: 'Empresa Sin Datos' });
  assert.ok(pkg.readinessScore < 70);
  const codes = (pkg.warnings || []).map(w => w.code);
  assert.ok(codes.includes('lead_website_missing'));
  assert.ok(codes.includes('lead_phone_missing'));
});

test('outreach messages include real AURUM URLs for golden lead', () => {
  const lead = makeLead({ id: 2, empresa: 'Costa Invest', websiteAudit: makeSuccessAudit() });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.ok(pkg.outreachMessages.whatsappMessage.includes('aurum-properties-boutique.vercel.app/costa-invest'));
  assert.ok(pkg.outreachMessages.emailBody.includes('aurum-properties-boutique.vercel.app/costa-invest'));
});

// ── FASE 5.1 — reviewable four hooks contract ─────────────────────────────────

test('new v5.1 pure functions are exposed in CRM scope', () => {
  for (const fn of ['classifyFourHookRoutes', 'buildReviewableFourHooksFromProductionPackage', 'isFourHookRoutePublished']) {
    assert.equal(typeof sandbox[fn], 'function', `${fn} should be defined`);
  }
});

test('Embassy Levante generates reviewableFourHooks.length = 4', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.ok(Array.isArray(pkg.reviewableFourHooks), 'reviewableFourHooks must be array');
  assert.equal(pkg.reviewableFourHooks.length, 4, 'must have 4 reviewable hooks');
});

test('Embassy Levante generatedReviewCount = 4', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.generatedReviewCount, 4);
});

test('Embassy Levante publishedOutputCount = 4 (all public routes registered)', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.publishedOutputCount, 4, 'Embassy Levante is fully registered with 4 public routes');
});

test('Embassy Levante publicationStatus = published (routes registered)', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.publicationStatus, 'published');
});

test('Embassy Levante publicRoutes all populated with real AURUM URLs', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  // publicRoutes: all populated (registered in FOUR_HOOKS_KNOWN_ROUTES_V5)
  const pubKeys = ['visualExperience', 'landing', 'webCompleta', 'bannerPack', 'bannerVertical', 'bannerHorizontal'];
  for (const k of pubKeys) {
    assert.ok(pkg.publicRoutes[k] && pkg.publicRoutes[k].includes('embassy-levante'), `publicRoutes.${k} must contain embassy-levante URL`);
  }
  assert.ok(pkg.publicRoutes.landing.includes('aurum-properties-boutique.vercel.app/embassy-levante'), 'landing route must be AURUM');
  assert.ok(pkg.publicRoutes.visualExperience.includes('embassy-levante'), 'visualExperience route populated');
});

test('Embassy Levante reviewableFourHooks: each hook published=true, status=published', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  for (const hook of pkg.reviewableFourHooks) {
    assert.equal(hook.generated, true, `hook ${hook.hookId} must be generated`);
    assert.equal(hook.published, true, `hook ${hook.hookId} must be published`);
    assert.ok(hook.publicUrl && hook.publicUrl.length > 0, `hook ${hook.hookId} publicUrl must be non-empty`);
    assert.equal(hook.publicationStatus, 'published', `hook ${hook.hookId} status must be published`);
  }
});

test('Embassy Levante WhatsApp message includes real AURUM paths (now registered)', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  const wa = pkg.outreachMessages.whatsappMessage;
  assert.ok(wa.includes('embassy-levante'), 'WhatsApp must include real embassy-levante AURUM URL');
});

test('Embassy Levante email body includes real AURUM paths (now registered)', () => {
  const lead = { id: 22, empresa: 'Embassy Levante', sector: 'Inmobiliaria', zona: 'Torrevieja', web: 'https://www.embassylevante.com/', telefono: '+34 691 502 743', whatsapp: '+34 691 502 743', email: 'luisiglesias@embassylevante.com' };
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  const body = pkg.outreachMessages.emailBody;
  assert.ok(body.includes('embassy-levante'), 'Email body must include real embassy-levante AURUM URL');
});

test('Generic new lead without known routes generates 4 hooks and 0 published', () => {
  const lead = makeLead({ id: 999, empresa: 'Nuevo Lead Sin Publicar', zona: 'Valencia' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.generatedReviewCount, 4);
  assert.equal(pkg.publishedOutputCount, 0);
  assert.equal(pkg.publicationStatus, 'ready_for_review_pending_publication');
  assert.equal(pkg.reviewableFourHooks.length, 4);
  const pubKeys = ['visualExperience', 'landing', 'webCompleta', 'bannerPack'];
  for (const k of pubKeys) {
    assert.equal(pkg.publicRoutes[k], '', `publicRoutes.${k} must be empty for unregistered lead`);
  }
});

test('Casas y Mar → partially_published (3 hooks public, banner pack not registered)', () => {
  const lead = makeLead({ id: 1, empresa: 'Casas y Mar', zona: 'Costa Blanca' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.generatedReviewCount, 4);
  assert.equal(pkg.publishedOutputCount, 3, 'casas-y-mar: EV + landing + webCompleta are registered; bannerPack is not');
  assert.equal(pkg.publicationStatus, 'partially_published');
  assert.ok(pkg.publicRoutes.visualExperience.includes('casas-y-mar'), 'EV should be public');
  assert.equal(pkg.publicRoutes.bannerPack, '', 'bannerPack not registered for casas-y-mar');
});

test('Costa Invest → fully published (4/4 hooks)', () => {
  const lead = makeLead({ id: 2, empresa: 'Costa Invest', zona: 'Alicante' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.generatedReviewCount, 4);
  assert.equal(pkg.publishedOutputCount, 4);
  assert.equal(pkg.publicationStatus, 'published');
  assert.ok(pkg.publicRoutes.visualExperience.includes('costa-invest'));
  assert.ok(pkg.publicRoutes.bannerPack.includes('costa-invest'));
  assert.equal(pkg.publicationWarnings.length, 0, 'no publication warnings for fully registered lead');
});

test('Sandhouse Inmobiliaria → fully published (4/4 hooks)', () => {
  const lead = makeLead({ id: 3, empresa: 'Sandhouse Inmobiliaria', zona: 'Torrevieja' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  assert.equal(pkg.generatedReviewCount, 4);
  assert.equal(pkg.publishedOutputCount, 4);
  assert.equal(pkg.publicationStatus, 'published');
  assert.ok(pkg.publicRoutes.landing.includes('sandhouse-inmobiliaria'));
  assert.equal(pkg.publicationWarnings.length, 0);
});

test('validateProductionPackageLocal: no errors for package with 0 published routes', () => {
  const lead = makeLead({ id: 999, empresa: 'Lead Sin Publicar', zona: 'Murcia' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  const v = sandbox.validateProductionPackageLocal(pkg);
  assert.equal(v.errors.length, 0, 'publishedOutputCount=0 must not be an error, only a warning');
  assert.ok(v.warnings.some(w => w.includes('zero_public_outputs')), 'must warn about zero public outputs');
});

test('validateProductionPackageLocal: accepts reviewableFourHooks array length=4', () => {
  const lead = makeLead({ id: 1, empresa: 'Casas y Mar' });
  const pkg = sandbox.buildProductionPackageFromLead(lead);
  const v = sandbox.validateProductionPackageLocal(pkg);
  assert.ok(!v.errors.some(e => e.includes('reviewableFourHooks')), 'no errors for valid reviewableFourHooks');
});
