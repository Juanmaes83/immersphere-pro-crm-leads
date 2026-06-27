// Fase 9 — Pieza A.3: Prompt builder for G1-G4 hook auto-generation.
//
// v3 — Adds 2-step generation. New export: buildPromptForHookStep().
// G1: 1 step with simplified prompt (compact HTML, max 3000 chars).
// G2/G3: step 1 = data file only, step 2 = component (with data file as context).
// G4: step 1 = config.js + logo.svg, step 2 = engine + 3 HTMLs.

import { componentBaseFromSlug } from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
import {
  getExpectedFilePaths,
  getExpectedFilePathsForStep,
  camelBaseFromSlug,
} from "./hookPathPolicy.ts";

// ── Safe data extraction ──

interface LeadData {
  name: string;
  slug: string;
  sector: string;
  zone: string;
  website: string;
  primaryColor: string;
  accentColor: string;
  claim: string;
}

interface MediaAssets {
  logoUrl: string;
  heroImageUrl: string;
  propertyImageUrls: string[];
  videoUrl: string;
}

interface ContactData {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
}

interface AuditData {
  score: number;
  opportunities: string;
  weaknesses: string;
  hasWhatsApp: boolean;
  hasContactForm: boolean;
  hasTour360: boolean;
}

function extractLeadData(pkg: Record<string, any>): LeadData {
  const lead = pkg?.lead || pkg?.packagePayload?.lead || {};
  const intelligenceContact =
    pkg?.leadIntelligenceProfile?.contact ||
    pkg?.packagePayload?.leadIntelligenceProfile?.contact ||
    {};
  const slug = sanitizeSlug(lead.slug || pkg?.slug || "unknown-lead");
  return {
    name: String(lead.name || lead.businessName || pkg?.businessName || "Empresa"),
    slug,
    sector: String(lead.sector || lead.vertical || pkg?.vertical || "Inmobiliario"),
    zone: String(lead.zone || lead.city || pkg?.city || ""),
    website: String(lead.website || lead.web || intelligenceContact.website || pkg?.website || ""),
    primaryColor: String(lead.primaryColor || lead.brandColors?.primary || "#1a1a2e"),
    accentColor: String(lead.accentColor || lead.brandColors?.accent || "#d4af37"),
    claim: String(lead.claim || lead.tagline || ""),
  };
}

function extractMediaAssets(pkg: Record<string, any>): MediaAssets {
  const media = pkg?.mediaAssets || pkg?.packagePayload?.mediaAssets || {};
  return {
    logoUrl: String(media.logo?.url || ""),
    heroImageUrl: String(media.heroImage?.url || ""),
    propertyImageUrls: Array.isArray(media.propertyImages)
      ? media.propertyImages.map((img: any) => String(img?.url || "")).filter(Boolean)
      : [],
    videoUrl: String(media.videos?.[0]?.url || media.video?.url || ""),
  };
}

function extractContactData(pkg: Record<string, any>): ContactData {
  const lead = pkg?.lead || pkg?.packagePayload?.lead || {};
  const intelligenceContact =
    pkg?.leadIntelligenceProfile?.contact ||
    pkg?.packagePayload?.leadIntelligenceProfile?.contact ||
    {};
  const contact = pkg?.contact || pkg?.packagePayload?.contact || lead?.contact || intelligenceContact || {};
  return {
    phone: String(contact.phone || contact.tel || intelligenceContact.phone || lead.phone || lead.telefono || ""),
    whatsapp: String(contact.whatsapp || intelligenceContact.whatsapp || lead.whatsapp || contact.phone || ""),
    email: String(contact.email || intelligenceContact.email || lead.email || ""),
    address: String(contact.address || contact.direction || intelligenceContact.address || lead.address || lead.direccion || ""),
  };
}

function extractAuditData(pkg: Record<string, any>): AuditData {
  const audit = pkg?.auditRun || pkg?.packagePayload?.auditRun || {};
  const analysis = audit.analysis || {};
  return {
    score: Number(audit.score || 0),
    opportunities: String(analysis.opportunities?.join(". ") || pkg?.opportunityDetected || ""),
    weaknesses: String(analysis.weaknesses?.join(". ") || ""),
    hasWhatsApp: Boolean(analysis.hasWhatsapp || analysis.hasWhatsApp),
    hasContactForm: Boolean(analysis.hasContactForm),
    hasTour360: Boolean(analysis.hasTour360 || analysis.hasVideoSignals),
  };
}

// ── Shared context block ──

function buildContextBlock(
  lead: LeadData, media: MediaAssets, contact: ContactData, audit: AuditData
): string {
  const lines: string[] = [
    `=== DATOS DEL LEAD ===`,
    `Nombre: ${lead.name}`, `Slug: ${lead.slug}`, `Sector: ${lead.sector}`,
  ];
  if (lead.zone) lines.push(`Zona: ${lead.zone}`);
  if (lead.website) lines.push(`Web: ${lead.website}`);
  lines.push(`Color primario: ${lead.primaryColor}`, `Color acento: ${lead.accentColor}`);
  if (lead.claim) lines.push(`Claim: ${lead.claim}`);
  return lines.join("\n");
}

function buildContactCTABlock(contact: ContactData): string {
  const lines: string[] = [];
  const waNum = (contact.whatsapp || "").replace(/[^0-9]/g, "");
  if (waNum) lines.push(`- WhatsApp: https://wa.me/${waNum}`);
  if (contact.phone) lines.push(`- Llamar: tel:${contact.phone}`);
  if (contact.email) lines.push(`- Email: mailto:${contact.email}`);
  return lines.length > 0 ? lines.join("\n") : "- Sin datos de contacto disponibles";
}

// ══════════════════════════════════════════════════════════════════════
// G1 — Visual Experience (1 STEP, simplified)
// ══════════════════════════════════════════════════════════════════════

function buildG1Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, expectedPaths: string[]
): string {
  const ctaBlock = buildContactCTABlock(contact);

  return `Genera una pieza de Experiencia Visual (G1) para ${lead.name}.

=== DATOS ===
Slug: ${lead.slug} | Sector: ${lead.sector} | Zona: ${lead.zone}
Color primario: ${lead.primaryColor} | Acento: ${lead.accentColor}
Claim: "${lead.claim || "Tu inmobiliaria de confianza"}"

=== ARCHIVO A GENERAR ===
Genera EXACTAMENTE: ${expectedPaths[0]}

=== INSTRUCCIONES G1 (COMPACTAS) ===

HTML autonomo. Primer impacto visual para WhatsApp.
PRIORIDAD ABSOLUTA: que sea COMPACTO (maximo 3500 caracteres de HTML).

Contenido obligatorio:
- Fondo oscuro (${lead.primaryColor}) con gradiente sutil hacia negro
- Nombre "${lead.name}" centrado, grande, color ${lead.accentColor}
- Claim debajo, color blanco, font-size menor
- UN solo boton CTA visible (primer canal disponible):
${ctaBlock}
- div id="qr-placeholder" de 150x150px con borde
- Google Fonts: SOLO Inter (font-display: swap)

Estilo:
- 2 animaciones CSS max (fadeIn titulo, slideUp claim)
- Mobile-first, centrado vertical con flexbox
- Fondo: linear-gradient(135deg, ${lead.primaryColor}, #000)

Lo que NO incluir (mantener archivo compacto):
- NO galeria de imagenes
- NO formularios
- NO secciones multiples (es UNA sola pantalla)
- NO JavaScript
- NO mas de 1 fuente de Google Fonts
- NO mas de 3 @keyframes`.trim();
}

// ══════════════════════════════════════════════════════════════════════
// G2 — Landing (2 STEPS)
// ══════════════════════════════════════════════════════════════════════

function buildG2Step1Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[], camelBase: string
): string {
  return `Genera el archivo de datos para la Landing Comercial (G2) de ${lead.name}.

=== ARCHIVO A GENERAR ===
Genera EXACTAMENTE: ${stepPaths[0]}

=== INSTRUCCIONES ===
Exporta una constante llamada "${camelBase}" con TODA la info del lead:

export const ${camelBase} = {
  name: "${lead.name}",
  slug: "${lead.slug}",
  sector: "${lead.sector}",
  zone: "${lead.zone}",
  website: "${lead.website}",
  colors: { primary: "${lead.primaryColor}", accent: "${lead.accentColor}" },
  claim: "${lead.claim || lead.name + " — Tu inmobiliaria de confianza"}",
  contact: {
    phone: "${contact.phone}",
    whatsapp: "${contact.whatsapp}",
    email: "${contact.email}",
    address: "${contact.address}"
  },
  assets: {
    logo: "${media.logoUrl}",
    heroImage: "${media.heroImageUrl}",
    video: "${media.videoUrl}",
    propertyImages: ${JSON.stringify(media.propertyImageUrls.slice(0, 6))}
  },
  score: ${audit.score}
};

Genera SOLO este archivo, nada mas.`.trim();
}

function buildG2Step2Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[], componentBase: string,
  camelBase: string, step1Content: string
): string {
  const ctaBlock = buildContactCTABlock(contact);

  return `Genera el componente Landing (G2) para ${lead.name}.

=== ARCHIVO YA GENERADO (contexto, NO lo regeneres) ===
El archivo de datos ya existe con este contenido:
\`\`\`
${step1Content}
\`\`\`

=== ARCHIVO A GENERAR ===
Genera EXACTAMENTE: ${stepPaths[0]}

=== INSTRUCCIONES ===
Componente React funcional con export default.
Import: import { ${camelBase} } from "./data/clientDemos/${camelBase}";

Secciones (en orden):
1. HERO: fondo oscuro, nombre grande, claim, CTA "Contactar"
2. PROPUESTA VALOR: 3 tarjetas con beneficios del servicio
3. GALERIA: grid de imagenes (URLs de assets o placeholders color)
4. FORMULARIO: nombre, email, telefono, mensaje (solo e.preventDefault + alert)
5. CTA FINAL:
${ctaBlock}
6. FOOTER: datos contacto, copyright

Tecnico:
- Estilos inline JS (style={{ }}) — NO CSS modules, NO Tailwind
- Sin dependencias externas mas alla de React
- Paleta: ${lead.primaryColor} fondo, ${lead.accentColor} acentos, texto blanco
- Responsive con flexbox`.trim();
}

// ══════════════════════════════════════════════════════════════════════
// G3 — Web Completa (2 STEPS)
// ══════════════════════════════════════════════════════════════════════

function buildG3Step1Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[], camelBase: string
): string {
  // Same data file as G2 — identical structure
  return buildG2Step1Prompt(lead, media, contact, audit, stepPaths, camelBase);
}

function buildG3Step2Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[], componentBase: string,
  camelBase: string, _step1Content: string
): string {
  const ctaBlock = buildContactCTABlock(contact);

  return `Genera el componente Web Completa premium (G3) para ${lead.name}.

=== ARCHIVO YA GENERADO (NO lo regeneres) ===
Ya existe src/data/clientDemos/${camelBase}.ts y exporta ${camelBase}.
Usa solo este import:
import { ${camelBase} } from "./data/clientDemos/${camelBase}";

=== ARCHIVO A GENERAR ===
Genera EXACTAMENTE: ${stepPaths[0]}

=== INSTRUCCIONES ===
Componente React funcional con export default. Web profesional completa, compacta y robusta.
No pegues datos del lead en bruto: lee desde ${camelBase} con optional chaining y fallbacks.

=== ESQUEMA EXACTO DEL DATA FILE ===
${camelBase} tiene esta forma. Usa estos campos, no inventes otros:
- ${camelBase}.name
- ${camelBase}.slug
- ${camelBase}.sector
- ${camelBase}.zone
- ${camelBase}.website
- ${camelBase}.colors.primary
- ${camelBase}.colors.accent
- ${camelBase}.claim
- ${camelBase}.contact.phone
- ${camelBase}.contact.whatsapp
- ${camelBase}.contact.email
- ${camelBase}.contact.address
- ${camelBase}.assets.logo
- ${camelBase}.assets.heroImage
- ${camelBase}.assets.video
- ${camelBase}.assets.propertyImages
- ${camelBase}.score

REGLAS DE DATOS:
- NO uses campos que no existen como companyName, tagline, phone, email o whatsapp en raiz.
- NO inventes telefonos, emails, webs, direcciones, precios ni propiedades reales.
- Si un dato viene vacio, muestra un fallback generico tipo "Contacto pendiente" o "Imagen pendiente".
- Para WhatsApp, si ${camelBase}.contact.whatsapp no existe, no crees un enlace wa.me falso.
- Evita emojis y caracteres raros; usa texto o SVG inline simple para iconos.

MINIMO 8 SECCIONES:
1. HERO: fondo ${lead.primaryColor}, titulo grande con animacion CSS ligera. Claim + CTA.
2. SOBRE NOSOTROS: texto descriptivo sector ${lead.sector}, zona ${lead.zone}
3. SERVICIOS: grid 3-4 servicios con iconos SVG inline
4. PROPIEDADES: galeria con imagenes o tarjetas placeholder
5. EXPERIENCIA INMERSIVA: ${audit.hasTour360 ? "referencia tour 360 existente" : "presenta tour 360 como oportunidad"}
6. TESTIMONIOS: 2-3 testimonios ficticios realistas para ${lead.zone || "Costa Blanca"}
7. CONTACTO: formulario completo + botones:
${ctaBlock}
8. FOOTER: nombre, enlaces, copyright ${new Date().getFullYear()}

Tecnico:
- Estilos INLINE JS — NO CSS modules, NO Tailwind
- Animaciones: CSS transitions/keyframes simples (NO importar GSAP)
- Responsive con flexbox/grid
- Sin imports externos mas alla de React
- Paleta premium: oscuro/claro alterno, acentos ${lead.accentColor}
- Objetivo de tamaño: 450-750 lineas como maximo.
- Puedes definir arrays locales compactos para secciones, servicios y testimonios.
- Evita codigo repetitivo; usa .map() para cards, secciones y galerias.`.trim();
}

// ══════════════════════════════════════════════════════════════════════
// G4 — Banners (2 STEPS)
// ══════════════════════════════════════════════════════════════════════

function buildG4Step1Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[]
): string {
  const safeSlug = sanitizeSlug(lead.slug);
  const waNum = (contact.whatsapp || "").replace(/[^0-9]/g, "");

  return `Genera la configuracion y logo para el Pack de Banners (G4) de ${lead.name}.

=== ARCHIVOS A GENERAR ===
${stepPaths.map((p) => `- ${p}`).join("\n")}

=== INSTRUCCIONES ===

1. ${stepPaths[0]} (config.js):
window.BANNER_CONFIG = {
  slug: "${safeSlug}",
  name: "${lead.name}",
  claim: "${lead.claim || lead.name}",
  colors: { primary: "${lead.primaryColor}", accent: "${lead.accentColor}" },
  contact: { phone: "${contact.phone}", whatsapp: "${contact.whatsapp}", email: "${contact.email}" },
  logo: "${media.logoUrl}",
  heroImage: "${media.heroImageUrl}",
  ctaUrl: "https://wa.me/${waNum}"
};

2. ${stepPaths[1]} (logo.svg):
SVG simple con texto "${lead.name}" sobre rect de color ${lead.primaryColor}.
Si no hay logo URL: iniciales de la empresa en circulo.
Viewbox: 0 0 200 60. Fuente: sans-serif.`.trim();
}

function buildG4Step2Prompt(
  lead: LeadData, media: MediaAssets, contact: ContactData,
  audit: AuditData, stepPaths: string[], step1Content: string
): string {
  const safeSlug = sanitizeSlug(lead.slug);

  return `Genera los archivos HTML y el motor del Pack de Banners (G4) para ${lead.name}.

=== ARCHIVOS YA GENERADOS (contexto) ===
config.js ya existe con este contenido:
\`\`\`
${step1Content}
\`\`\`

=== ARCHIVOS A GENERAR ===
${stepPaths.map((p) => `- ${p}`).join("\n")}

=== INSTRUCCIONES ===

1. banner-engine.js:
   Lee window.BANNER_CONFIG. Aplica colores, gestiona animaciones CSS via JS.
   Sin dependencias externas.

2. banner-vertical.html (9:16, Stories):
   Nombre arriba, claim centro, CTA abajo. Fondo gradiente ${lead.primaryColor}.
   Importa config.js y banner-engine.js con <script src="./...">

3. banner-horizontal.html (16:9, web/email):
   Layout lado a lado: imagen izquierda, texto derecha.
   Importa config.js y banner-engine.js.

4. banner-pack/index.html:
   Overview con previews de ambos formatos (iframes).
   Titulo: "Pack de Banners — ${lead.name}". Importa config.js.

Todos los HTML: DOCTYPE completo, CSS en <style>, Google Fonts Inter.
Paleta oscura, acentos ${lead.accentColor}, texto blanco.`.trim();
}

// ══════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════

/**
 * Original single-step prompt builder (kept for backward compatibility).
 */
export function buildPromptForHook(
  hookType: "G1" | "G2" | "G3" | "G4",
  packagePayload: Record<string, any>
): string {
  return buildPromptForHookStep(hookType, 1, packagePayload);
}

/**
 * Step-aware prompt builder for 2-step generation.
 *
 * @param hookType - G1, G2, G3, or G4
 * @param step - 1 or 2 (G1 only has step 1)
 * @param packagePayload - Raw production package from CRM
 * @param previousStepFiles - Files generated in step 1 (required for step 2)
 */
export function buildPromptForHookStep(
  hookType: "G1" | "G2" | "G3" | "G4",
  step: 1 | 2,
  packagePayload: Record<string, any>,
  previousStepFiles?: Array<{ path: string; content: string }>
): string {
  if (!packagePayload) {
    throw new Error("packagePayload is null/undefined — cannot build prompt");
  }

  const lead = extractLeadData(packagePayload);
  const media = extractMediaAssets(packagePayload);
  const contact = extractContactData(packagePayload);
  const audit = extractAuditData(packagePayload);
  const componentBase = componentBaseFromSlug(lead.slug);
  const camelBase = camelBaseFromSlug(lead.slug);

  const stepPaths = getExpectedFilePathsForStep(hookType, lead.slug, step);

  // For step 2, extract the content of the first file from step 1 as context
  const step1Content = previousStepFiles?.[0]?.content || "";

  // G1: always 1 step
  if (hookType === "G1") {
    return buildG1Prompt(lead, media, contact, audit, stepPaths);
  }

  // G2
  if (hookType === "G2") {
    return step === 1
      ? buildG2Step1Prompt(lead, media, contact, audit, stepPaths, camelBase)
      : buildG2Step2Prompt(lead, media, contact, audit, stepPaths, componentBase, camelBase, step1Content);
  }

  // G3
  if (hookType === "G3") {
    return step === 1
      ? buildG3Step1Prompt(lead, media, contact, audit, stepPaths, camelBase)
      : buildG3Step2Prompt(lead, media, contact, audit, stepPaths, componentBase, camelBase, step1Content);
  }

  // G4
  if (hookType === "G4") {
    return step === 1
      ? buildG4Step1Prompt(lead, media, contact, audit, stepPaths)
      : buildG4Step2Prompt(lead, media, contact, audit, stepPaths, step1Content);
  }

  throw new Error(`Hook type no soportado: ${hookType}`);
}
