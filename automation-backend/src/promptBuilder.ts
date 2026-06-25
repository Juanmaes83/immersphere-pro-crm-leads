// Fase 9 — Pieza A.3: Prompt builder for G1-G4 hook auto-generation.
//
// Transforms a production package (lead data, audit results, assets) into
// a detailed prompt for Claude API. Each hook type has its own builder
// function with specific instructions for what to generate.
//
// This module is the bridge between the CRM's data (what we KNOW about
// the lead) and Claude's code generation (what we WANT to build). The
// quality of the generated code depends entirely on the quality of
// these prompts.
//
// Dependencies:
// - hookPathPolicy.ts for getExpectedFilePaths (exact paths Claude must use)
// - pathSecurity.ts for componentBaseFromSlug (consistent naming)
// - security.ts for sanitizeSlug
 
import { componentBaseFromSlug } from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
import { getExpectedFilePaths } from "./hookPathPolicy.ts";
 
// ── Safe data extraction from production package ────────────────────────
// The production package structure may vary between leads (some fields
// missing, nested differently, etc.). These extractors always return
// a usable object with sensible defaults — never throw, never return null.
 
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
  hasWhatsApp: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
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
  const slug = sanitizeSlug(lead.slug || pkg?.slug || "unknown-lead");
  return {
    name: String(lead.name || lead.businessName || pkg?.businessName || "Empresa"),
    slug,
    sector: String(lead.sector || lead.vertical || pkg?.vertical || "Inmobiliario"),
    zone: String(lead.zone || lead.city || pkg?.city || ""),
    website: String(lead.website || lead.web || pkg?.website || ""),
    primaryColor: String(lead.primaryColor || lead.brandColors?.primary || "#1a1a2e"),
    accentColor: String(lead.accentColor || lead.brandColors?.accent || "#d4af37"),
    claim: String(lead.claim || lead.tagline || ""),
  };
}
 
function extractMediaAssets(pkg: Record<string, any>): MediaAssets {
  const media = pkg?.mediaAssets || pkg?.packagePayload?.mediaAssets || {};
  const approvedAssets = pkg?.approvedMediaAssets || {};
  return {
    logoUrl: String(media.logo?.url || approvedAssets.logoUrl || ""),
    heroImageUrl: String(media.heroImage?.url || approvedAssets.heroImageUrl || ""),
    propertyImageUrls: Array.isArray(media.propertyImages)
      ? media.propertyImages.map((img: any) => String(img?.url || "")).filter(Boolean)
      : [],
    videoUrl: String(
      media.videos?.[0]?.url || media.video?.url || approvedAssets.videoUrl || ""
    ),
  };
}
 
function extractContactData(pkg: Record<string, any>): ContactData {
  const contact = pkg?.contact || pkg?.packagePayload?.contact || pkg?.lead?.contact || {};
  const phone = String(contact.phone || contact.tel || "").trim();
  const whatsapp = String(contact.whatsapp || "").trim();
  const email = String(contact.email || "").trim();
  return {
    phone,
    whatsapp: whatsapp || phone, // fallback to phone if no specific WhatsApp
    email,
    address: String(contact.address || contact.direction || ""),
    hasWhatsApp: Boolean(whatsapp || phone), // true if we have ANY number
    hasPhone: Boolean(phone),
    hasEmail: Boolean(email),
  };
}
 
function extractAuditData(pkg: Record<string, any>): AuditData {
  const audit = pkg?.auditRun || pkg?.packagePayload?.auditRun || {};
  const analysis = audit.analysis || audit.auditAnalysis || {};
  return {
    score: Number(audit.score || audit.opportunityScore || 0),
    opportunities: String(
      analysis.opportunities?.join(". ") ||
      pkg?.opportunityDetected ||
      ""
    ),
    weaknesses: String(
      analysis.weaknesses?.join(". ") ||
      analysis.debilidadesDetectadas?.join(". ") ||
      ""
    ),
    hasWhatsApp: Boolean(analysis.hasWhatsapp || analysis.hasWhatsApp),
    hasContactForm: Boolean(analysis.hasContactForm),
    hasTour360: Boolean(analysis.hasTour360 || analysis.hasVideoSignals),
  };
}
 
// ── camelBase (same logic as pathSecurity.ts line 48-50) ─────────────────
 
function camelBaseFromSlug(slug: string): string {
  return sanitizeSlug(slug)
    .split("-")
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}
 
// ── WhatsApp link builder (safe, returns empty string if no number) ─────
 
function buildWhatsAppUrl(whatsapp: string): string {
  const digits = whatsapp.replace(/[^0-9]/g, "");
  if (!digits || digits.length < 6) return "";
  return `https://wa.me/${digits}`;
}
 
// ── Contact CTA block builder (conditional per channel) ─────────────────
// Only includes CTAs for channels where we have real data.
 
function buildContactCTABlock(contact: ContactData): string {
  const lines: string[] = [];
 
  if (contact.hasWhatsApp) {
    const waUrl = buildWhatsAppUrl(contact.whatsapp);
    if (waUrl) lines.push(`- Botón WhatsApp → ${waUrl}`);
  }
  if (contact.hasPhone) {
    lines.push(`- Botón Llamar → tel:${contact.phone}`);
  }
  if (contact.hasEmail) {
    lines.push(`- Botón Email → mailto:${contact.email}`);
  }
 
  if (lines.length === 0) {
    lines.push(`- Botón genérico "Contactar" sin link (los datos de contacto no están disponibles)`);
  }
 
  return lines.join("\n");
}
 
// ── Shared context block (included in every hook prompt) ────────────────
 
function buildContextBlock(lead: LeadData, media: MediaAssets, contact: ContactData, audit: AuditData): string {
  const lines: string[] = [
    `=== DATOS DEL LEAD ===`,
    `Nombre empresa: ${lead.name}`,
    `Slug: ${lead.slug}`,
    `Sector: ${lead.sector}`,
  ];
  if (lead.zone) lines.push(`Zona: ${lead.zone}`);
  if (lead.website) lines.push(`Web actual: ${lead.website}`);
  lines.push(`Color primario: ${lead.primaryColor}`);
  lines.push(`Color acento: ${lead.accentColor}`);
  if (lead.claim) lines.push(`Claim/tagline: ${lead.claim}`);
 
  lines.push("", `=== CONTACTO ===`);
  if (contact.hasPhone) lines.push(`Teléfono: ${contact.phone}`);
  if (contact.hasWhatsApp) lines.push(`WhatsApp: ${contact.whatsapp}`);
  if (contact.hasEmail) lines.push(`Email: ${contact.email}`);
  if (contact.address) lines.push(`Dirección: ${contact.address}`);
  if (!contact.hasPhone && !contact.hasWhatsApp && !contact.hasEmail) {
    lines.push(`(Sin datos de contacto disponibles — omite CTAs de contacto directo)`);
  }
 
  lines.push("", `=== ASSETS DISPONIBLES ===`);
  lines.push(`Logo: ${media.logoUrl || "NO DISPONIBLE — usa el nombre de empresa como texto"}`);
  lines.push(`Hero image: ${media.heroImageUrl || "NO DISPONIBLE — usa un fondo de color sólido con gradiente"}`);
  if (media.propertyImageUrls.length > 0) {
    lines.push(`Imágenes de propiedad (${media.propertyImageUrls.length}):`);
    media.propertyImageUrls.slice(0, 6).forEach((url, i) => lines.push(`  ${i + 1}. ${url}`));
  } else {
    lines.push(`Imágenes de propiedad: NO DISPONIBLES — usa placeholders con fondo de color`);
  }
  lines.push(`Video: ${media.videoUrl || "NO DISPONIBLE — omite secciones de video"}`);
 
  if (audit.score > 0 || audit.opportunities || audit.weaknesses) {
    lines.push("", `=== AUDITORÍA WEB ===`);
    if (audit.score > 0) lines.push(`Score oportunidad: ${audit.score}/100`);
    if (audit.opportunities) lines.push(`Oportunidades detectadas: ${audit.opportunities}`);
    if (audit.weaknesses) lines.push(`Debilidades detectadas: ${audit.weaknesses}`);
    lines.push(`Tour 360 en web actual: ${audit.hasTour360 ? "Sí" : "No"}`);
    lines.push(`WhatsApp en web actual: ${audit.hasWhatsApp ? "Sí" : "No"}`);
  }
 
  return lines.join("\n");
}
 
// ── Per-hook prompt builders ────────────────────────────────────────────
 
function buildG1Prompt(
  lead: LeadData,
  media: MediaAssets,
  contact: ContactData,
  audit: AuditData,
  expectedPaths: string[]
): string {
  const context = buildContextBlock(lead, media, contact, audit);
  const ctaBlock = buildContactCTABlock(contact);
 
  return `Genera una pieza de Experiencia Visual (G1) para ${lead.name}.
 
${context}
 
=== ARCHIVOS A GENERAR ===
Genera EXACTAMENTE este archivo:
${expectedPaths.map((p) => `- ${p}`).join("\n")}
 
=== INSTRUCCIONES ESPECÍFICAS PARA G1 ===
 
El archivo es una página HTML autónoma y completa que funciona como una
"tela visual" animada — el primer impacto visual que el comercial envía
al lead por WhatsApp o email para abrir conversación.
 
Requisitos de contenido:
- Hero section a pantalla completa con el nombre de la empresa y su claim
- Animaciones CSS (keyframes) suaves: fade-in, slide-up, scale en elementos clave
- CTAs disponibles:
${ctaBlock}
- Si hay logo disponible, mostrarlo. Si no, usar texto estilizado con el nombre
- Paleta de colores basada en los colores del lead (primario + acento)
- Un div con id="qr-placeholder" para QR code (200x200px, borde redondeado)
- Tipografía premium: importar de Google Fonts (Playfair Display + Inter o similar)
- Diseño mobile-first, responsive
 
Requisitos técnicos:
- HTML completo con DOCTYPE, <head> con meta viewport, <body>
- TODO el CSS dentro de <style> en el <head>
- TODO el JS dentro de <script> antes de </body>
- Sin dependencias externas excepto Google Fonts (CDN)
- Debe renderizar correctamente sin servidor (abrir como archivo local)
 
Estilo visual de referencia:
Diseño oscuro premium (#0a0a0f fondo con acentos dorados), similar a una
invitación digital de lujo. Elementos flotantes con sombras suaves.
Transiciones fluidas. Sensación de exclusividad.`.trim();
}
 
function buildG2Prompt(
  lead: LeadData,
  media: MediaAssets,
  contact: ContactData,
  audit: AuditData,
  expectedPaths: string[],
  componentBase: string,
  camelBase: string
): string {
  const context = buildContextBlock(lead, media, contact, audit);
  const ctaBlock = buildContactCTABlock(contact);
 
  return `Genera una Landing Comercial (G2) para ${lead.name}.
 
${context}
 
=== ARCHIVOS A GENERAR ===
Genera EXACTAMENTE estos archivos:
${expectedPaths.map((p) => `- ${p}`).join("\n")}
 
=== INSTRUCCIONES PARA EL ARCHIVO DE DATOS ===
Archivo: src/data/clientDemos/${camelBase}.ts
 
Exporta una constante llamada "${camelBase}" con esta estructura:
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
 
=== INSTRUCCIONES PARA EL COMPONENTE LANDING ===
Archivo: src/${componentBase}Landing.tsx
 
Componente React funcional con export default.
Import del archivo de datos: import { ${camelBase} } from "./data/clientDemos/${camelBase}";
 
Secciones obligatorias (en este orden):
1. HERO: imagen/video de fondo, nombre empresa grande, claim, CTA "Contactar"
2. PROPUESTA DE VALOR: 3-4 tarjetas con iconos y beneficios clave del servicio
3. GALERÍA: grid de imágenes de propiedades (usar las URLs de assets o placeholders)
4. FORMULARIO: campos nombre, email, teléfono, mensaje + botón enviar
5. CTA FINAL:
${ctaBlock}
6. FOOTER: datos de contacto, dirección, copyright ${new Date().getFullYear()}
 
Requisitos técnicos:
- React funcional, con hooks si necesitas estado (useState para el formulario)
- Estilos inline con objetos JS (style={{ ... }}) — no CSS modules, no Tailwind
- El formulario no necesita lógica de envío real (solo e.preventDefault + alert)
- Sin dependencias externas más allá de React
- Responsive: flexbox/grid, media queries via window.innerWidth o condicionales
- Paleta: fondo oscuro (${lead.primaryColor}), acentos (${lead.accentColor}), texto blanco`.trim();
}
 
function buildG3Prompt(
  lead: LeadData,
  media: MediaAssets,
  contact: ContactData,
  audit: AuditData,
  expectedPaths: string[],
  componentBase: string,
  camelBase: string
): string {
  const context = buildContextBlock(lead, media, contact, audit);
  const ctaBlock = buildContactCTABlock(contact);
 
  return `Genera una Web Completa premium (G3) para ${lead.name}.
 
${context}
 
=== ARCHIVOS A GENERAR ===
Genera EXACTAMENTE estos archivos:
${expectedPaths.map((p) => `- ${p}`).join("\n")}
 
=== INSTRUCCIONES PARA EL ARCHIVO DE DATOS ===
Archivo: src/data/clientDemos/${camelBase}.ts
 
(Misma estructura que en G2 — si el archivo ya existe de una generación
anterior de G2, genera una versión idéntica. No cambies la estructura.)
 
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
 
=== INSTRUCCIONES PARA EL COMPONENTE WEB COMPLETA ===
Archivo: src/${componentBase}WebCompleta.tsx
 
Este es el componente más completo y premium del sistema — equivale a una
web profesional completa de la inmobiliaria, presentada como demo para
convencer al lead de contratar el servicio.
 
Componente React funcional con export default.
Import del archivo de datos: import { ${camelBase} } from "./data/clientDemos/${camelBase}";
 
MÍNIMO 8 SECCIONES (en este orden):
1. HERO PREMIUM: fondo oscuro (${lead.primaryColor}), título grande del
   nombre de la empresa, claim debajo, CTA "Descubre más". Si hay video
   disponible (${media.videoUrl ? "SÍ HAY VIDEO" : "NO hay video — usa imagen o gradiente"}),
   úsalo como fondo del hero.
   Anima el título con una aparición letra por letra (simulando SplitType):
   usa un useEffect con setTimeout por cada carácter, opacity 0→1.
 
2. SOBRE NOSOTROS: texto descriptivo del negocio, basado en el sector
   (${lead.sector}) y zona (${lead.zone}).
 
3. SERVICIOS: grid de 3-4 servicios con iconos SVG inline, título y descripción.
 
4. PROPIEDADES DESTACADAS: galería con las imágenes disponibles.
   ${media.propertyImageUrls.length > 0
    ? `Usa estas URLs reales: ${media.propertyImageUrls.slice(0, 4).join(", ")}`
    : "No hay imágenes — genera tarjetas con fondo de color y texto descriptivo"
   }
   Cada propiedad: imagen, título, zona, precio indicativo, CTA "Ver más".
 
5. EXPERIENCIA INMERSIVA: sección que describe el tour 360 / experiencia
   visual. ${audit.hasTour360
    ? "El lead YA tiene tour 360 — referencia esta capacidad."
    : "El lead NO tiene tour 360 — presenta esto como la oportunidad de mejora."
   }
 
6. TESTIMONIOS: 2-3 testimonios ficticios pero realistas para el sector
   inmobiliario en ${lead.zone || "la Costa Blanca"}.
 
7. CONTACTO: formulario completo (nombre, email, teléfono, mensaje,
   tipo de inmueble dropdown) + mapa placeholder + datos de contacto.
   CTAs disponibles:
${ctaBlock}
 
8. FOOTER: logo/nombre, enlaces rápidos, datos legales, copyright ${new Date().getFullYear()}.
 
Requisitos técnicos:
- React funcional con useState (formulario, animaciones)
- Estilos INLINE con objetos JS — NO CSS modules, NO Tailwind
- Animaciones: useEffect + IntersectionObserver para fade-in al scroll
  (NO importar GSAP ni SplitType — simular los efectos con CSS transitions
  y JS nativo para evitar dependencias externas)
- Responsive con flexbox/grid + condicionales de ancho
- Paleta premium: fondo principal oscuro, secciones alternas light/dark,
  acentos dorados, tipografía limpia
- El componente debe funcionar SIN props (todo viene del archivo de datos)
- Sin imports externos más allá de React`.trim();
}
 
function buildG4Prompt(
  lead: LeadData,
  media: MediaAssets,
  contact: ContactData,
  audit: AuditData,
  expectedPaths: string[]
): string {
  const context = buildContextBlock(lead, media, contact, audit);
  const safeSlug = sanitizeSlug(lead.slug);
  const ctaBlock = buildContactCTABlock(contact);
  const whatsAppUrl = buildWhatsAppUrl(contact.whatsapp);
 
  return `Genera un Pack de Banners (G4) para ${lead.name}.
 
${context}
 
=== ARCHIVOS A GENERAR ===
Genera EXACTAMENTE estos archivos:
${expectedPaths.map((p) => `- ${p}`).join("\n")}
 
=== INSTRUCCIONES POR ARCHIVO ===
 
1. dynamic-motion-banner/${safeSlug}/config.js
   Exporta un objeto de configuración con los datos del lead:
   window.BANNER_CONFIG = {
     slug: "${safeSlug}",
     name: "${lead.name}",
     claim: "${lead.claim || lead.name}",
     colors: { primary: "${lead.primaryColor}", accent: "${lead.accentColor}" },
     contact: { phone: "${contact.phone}", whatsapp: "${contact.whatsapp}", email: "${contact.email}" },
     logo: "${media.logoUrl}",
     heroImage: "${media.heroImageUrl}",
     ctaUrl: "${whatsAppUrl || `tel:${contact.phone}` || "#contacto"}"
   };
 
2. dynamic-motion-banner/${safeSlug}/banner-engine.js
   Motor de renderizado del banner. Lee window.BANNER_CONFIG y:
   - Aplica colores dinámicamente
   - Gestiona animaciones (CSS keyframes via JS)
   - Adapta el contenido al formato (vertical/horizontal/pack)
   Debe funcionar sin dependencias externas.
 
3. dynamic-motion-banner/${safeSlug}/banner-vertical.html
   Banner formato VERTICAL (9:16, 1080x1920 conceptual).
   Diseñado para Stories de Instagram/Facebook.
   - Nombre empresa arriba, claim en medio, CTA abajo
   - Fondo con imagen hero o gradiente de colores
   - Animaciones CSS: fade-in secuencial de elementos
   - Importa config.js y banner-engine.js con <script>
 
4. dynamic-motion-banner/${safeSlug}/banner-horizontal.html
   Banner formato HORIZONTAL (16:9, 1920x1080 conceptual).
   Diseñado para web/email headers.
   - Layout lado a lado: imagen izquierda, texto derecha
   - Misma paleta y estilo que el vertical
   - Importa config.js y banner-engine.js con <script>
 
5. dynamic-motion-banner/${safeSlug}/banner-pack/index.html
   Página de overview que muestra AMBOS formatos en miniatura.
   - Título: "Pack de Banners — ${lead.name}"
   - Preview del vertical (iframe o imagen) + botón "Ver vertical"
   - Preview del horizontal (iframe o imagen) + botón "Ver horizontal"
   - Datos del lead y CTAs:
${ctaBlock}
   - Importa config.js con <script src="../config.js">
 
6. dynamic-motion-banner/${safeSlug}/assets/logo.svg
   Si hay logo URL disponible: genera un SVG placeholder simple con el
   texto "${lead.name}" estilizado (rect de fondo + text centrado).
   Si no hay logo: genera un SVG con las iniciales de la empresa en un
   círculo con el color primario.
 
Requisitos técnicos para TODOS los archivos HTML:
- HTML completo con DOCTYPE
- TODO el CSS en <style> dentro del <head>
- Los scripts banner-engine.js y config.js se importan con rutas relativas
- Sin dependencias externas excepto Google Fonts (CDN)
- Los archivos deben funcionar abiertos como archivo local
- Paleta: fondo oscuro, acentos del lead, texto blanco/claro`.trim();
}
 
// ── Main export ─────────────────────────────────────────────────────────
 
/**
 * Builds the complete user prompt for Claude API based on the hook type
 * and the production package data. The returned string is passed directly
 * to anthropicClient.generateHookCode().
 *
 * @param hookType - Which hook to generate (G1, G2, G3, G4)
 * @param packagePayload - The raw production package payload from the CRM.
 *   Can be the full persistence record (with packagePayload nested) or
 *   the inner payload directly — the extractors handle both cases.
 *   MUST NOT be null or undefined.
 *
 * @returns The complete user prompt string, ready for Claude API.
 * @throws Error if packagePayload is null/undefined/empty or hookType is invalid.
 */
export function buildPromptForHook(
  hookType: "G1" | "G2" | "G3" | "G4",
  packagePayload: Record<string, any>
): string {
  // ── Fail-fast on missing/empty payload ──
  if (!packagePayload || typeof packagePayload !== "object") {
    throw new Error(
      "buildPromptForHook: packagePayload es null, undefined o no es un objeto. " +
      "Asegúrate de pasar el resultado de getLatestProductionPackage(), no un valor vacío."
    );
  }
 
  // Check that we have at minimum a slug (without it, the prompt is useless)
  const testSlug = packagePayload?.lead?.slug ||
    packagePayload?.packagePayload?.lead?.slug ||
    packagePayload?.slug || "";
  if (!testSlug) {
    throw new Error(
      "buildPromptForHook: no se encontró un slug de lead en el packagePayload. " +
      "El payload debe contener lead.slug o packagePayload.lead.slug."
    );
  }
 
  const lead = extractLeadData(packagePayload);
  const media = extractMediaAssets(packagePayload);
  const contact = extractContactData(packagePayload);
  const audit = extractAuditData(packagePayload);
  const expectedPaths = getExpectedFilePaths(hookType, lead.slug);
  const componentBase = componentBaseFromSlug(lead.slug);
  const camelBase = camelBaseFromSlug(lead.slug);
 
  switch (hookType) {
    case "G1":
      return buildG1Prompt(lead, media, contact, audit, expectedPaths);
    case "G2":
      return buildG2Prompt(lead, media, contact, audit, expectedPaths, componentBase, camelBase);
    case "G3":
      return buildG3Prompt(lead, media, contact, audit, expectedPaths, componentBase, camelBase);
    case "G4":
      return buildG4Prompt(lead, media, contact, audit, expectedPaths);
    default:
      throw new Error(`Hook type no soportado: ${hookType}`);
  }
}
