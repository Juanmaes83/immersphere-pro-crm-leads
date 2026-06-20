import { sanitizeSlug } from "./security.ts";
import { CLIENT_FACING_DOMAIN, INTERNAL_ENGINE_DOMAIN } from "./schemas.ts";

function safeStr(value, fallback = "") {
  return String(value || fallback)
    .replace(/<script/gi, "&lt;script")
    .replace(/<\/script/gi, "&lt;/script");
}

function firstOf(...values) {
  for (const v of values) {
    if (v && typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

function derivePrimaryPhone(lead) {
  return firstOf(lead.phone, lead.whatsapp, lead.phone2, lead.phone3);
}

function deriveWhatsAppHref(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

function deriveZoneLabel(lead) {
  const zone = safeStr(lead.zone);
  const city = safeStr(lead.city);
  const province = safeStr(lead.province);
  return firstOf(city, zone, province, "la zona");
}

function deriveClientLabel(lead) {
  return safeStr(lead.commercialName || lead.name, "el cliente");
}

function deriveServices(payload) {
  const sector = safeStr(payload.lead?.sector).toLowerCase();
  if (sector.includes("inmobiliaria") || sector.includes("real estate")) {
    return ["Compraventa de propiedades", "Alquiler vacacional y residencial", "Asesoramiento personalizado", "Valoracion de inmuebles"];
  }
  if (sector.includes("hosteleria") || sector.includes("restaurante")) {
    return ["Servicio de sala y terraza", "Menu del dia y carta", "Eventos y celebraciones", "Reservas online"];
  }
  return ["Servicio principal", "Atencion personalizada", "Asesoria especializada", "Seguimiento postventa"];
}

function deriveZonesList(payload) {
  const zone = safeStr(payload.lead?.zone);
  const city = safeStr(payload.lead?.city);
  const province = safeStr(payload.lead?.province);
  const zones = [];
  if (city && city !== zone) zones.push({ name: city, description: "Ciudad principal de operacion." });
  if (zone) zones.push({ name: zone, description: `Area comercial estrategica del cliente.` });
  if (province && province !== zone && province !== city) zones.push({ name: province, description: "Provincia de alcance." });
  if (zones.length === 0) zones.push({ name: "Zona principal", description: "Area de operacion del cliente." });
  return zones;
}

function deriveMethod(clientLabel) {
  return [
    { step: 1, title: "Primer contacto", description: `${clientLabel} recibe a cada cliente con atencion directa y sin intermediarios.` },
    { step: 2, title: "Diagnostico de necesidades", description: "Escucha activa para entender el objetivo real: compra, venta o alquiler." },
    { step: 3, title: "Propuesta personalizada", description: "Seleccion curada de opciones que encajan con el perfil del cliente." },
    { step: 4, title: "Acompanamiento en el proceso", description: "Gestion documental, negociacion y soporte hasta el cierre." },
    { step: 5, title: "Seguimiento postventa", description: "Relacion continua para garantizar la satisfaccion a largo plazo." },
  ];
}

export function buildPremiumFourHookSpecs(payload, proposalPackage, plan = {}) {
  const routes = payload.targetRoutes || {};
  const landingSpec = buildLandingSpec(payload, proposalPackage, routes);
  const visualExperienceSpec = buildVisualExperienceSpec(payload, proposalPackage, routes);
  const fullWebsiteSpec = buildFullWebsiteSpec(payload, proposalPackage, routes);
  const bannerPackSpec = buildBannerPackSpec(payload, proposalPackage, routes);
  const qualityReport = buildFourHooksQualityReport(
    { landingSpec, visualExperienceSpec, fullWebsiteSpec, bannerPackSpec },
    payload,
  );
  return { landingSpec, visualExperienceSpec, fullWebsiteSpec, bannerPackSpec, qualityReport };
}

export function buildLandingSpec(payload, proposalPackage, routes = {}) {
  const lead = payload.lead || {};
  const audit = payload.audit || {};
  const clientLabel = deriveClientLabel(lead);
  const zoneLabel = deriveZoneLabel(lead);
  const phone = derivePrimaryPhone(lead);
  const waHref = deriveWhatsAppHref(phone);
  const email = safeStr(lead.email);
  const weakness = firstOf(
    Array.isArray(audit.weaknesses) ? audit.weaknesses[0] : "",
    "Presencia digital con margen de mejora visual y comercial.",
  );
  const opportunity = firstOf(
    Array.isArray(audit.opportunities) ? audit.opportunities[0] : "",
    "Crear un sistema visual premium revisable antes de produccion.",
  );
  const tagline = safeStr(lead.tagline || lead.claim);

  return {
    hookId: "landing",
    hookName: "Landing Comercial Personalizada",
    commercialPurpose: "Primer punto de contacto directo con el cliente potencial. Explica quien es el negocio, que ofrece, y da el siguiente paso concreto.",
    targetAudience: "Comprador o arrendatario potencial que llega por campana, referido, o busqueda.",
    hero: {
      headline: tagline || `${clientLabel} — Tu aliado en ${zoneLabel}.`,
      subheadline: `Atencion personalizada en ${zoneLabel}. ${opportunity}`,
      primaryCta: {
        label: "Hablar por WhatsApp",
        href: waHref || `https://wa.me/34000000000`,
        channel: "whatsapp",
      },
      secondaryCta: {
        label: "Llamar ahora",
        href: phone ? `tel:${phone}` : "",
        channel: "phone",
      },
    },
    diagnosis: {
      painDetected: weakness,
      opportunityDetected: opportunity,
      marketContext: `${clientLabel} opera en ${zoneLabel}, un mercado donde la diferenciacion visual y el primer impacto digital son determinantes.`,
      recommendedAngle: `Posicionar a ${clientLabel} como la agencia local con mas presencia digital y atencion humana en ${zoneLabel}.`,
    },
    comparison: {
      currentSituation: `Web actual: ${weakness}`,
      proposedSituation: `Con Immersphere: experiencia visual completa, landing dedicada, demo de web y banners personalizados para campana.`,
      differentiators: [
        "Experiencia visual de propiedad en primera pantalla",
        "Web completa con GSAP y motion design desde el dia 1",
        "Pack de banners vertical y horizontal listo para publicar",
        "Atencion personalizada en cada paso",
      ],
    },
    fourHooksSummary: [
      { hook: "visualExperience", label: "Experiencia Visual", url: routes.visualExperience || "", purpose: "Primer impacto inmersivo." },
      { hook: "landing", label: "Landing Comercial", url: routes.landing || "", purpose: "Conversion directa." },
      { hook: "webCompleta", label: "Web Completa", url: routes.webCompleta || "", purpose: "Demo de presencia completa." },
      { hook: "bannerPack", label: "Pack de Banners", url: routes.bannerPack || "", purpose: "Creatividades para campana." },
    ],
    contact: {
      phone: phone || null,
      whatsapp: waHref || null,
      email: email || null,
      address: safeStr(lead.address) || null,
      schedule: safeStr(lead.schedule) || null,
      website: safeStr(lead.website) || null,
    },
    nextStep: `Revisar los cuatro ganchos en una llamada de 15 minutos con el equipo de ${clientLabel}.`,
    internalNotes: [
      "Headline y subheadline derivados de datos del lead — revisar antes de publicar.",
      "CTA WhatsApp usa numero primario verificado del CRM.",
      "No publicar sin validacion humana de copy y URLs.",
    ],
    route: routes.landing || "",
  };
}

export function buildVisualExperienceSpec(payload, proposalPackage, routes = {}) {
  const lead = payload.lead || {};
  const audit = payload.audit || {};
  const slug = sanitizeSlug(lead.slug);
  const clientLabel = deriveClientLabel(lead);
  const zoneLabel = deriveZoneLabel(lead);
  const phone = derivePrimaryPhone(lead);
  const waHref = deriveWhatsAppHref(phone);
  const opportunity = firstOf(
    Array.isArray(audit.opportunities) ? audit.opportunities[0] : "",
    "Crear un sistema visual de primera visita para cada propiedad.",
  );

  const rubikEmbedBase = `https://${INTERNAL_ENGINE_DOMAIN}/dynamic-motion-banner/${slug}`;
  const embedUrl = `${rubikEmbedBase}/?embed=1`;

  const rubikConfigSeed = {
    slug,
    clientName: clientLabel,
    zone: zoneLabel,
    sector: safeStr(lead.sector),
    claim: safeStr(lead.tagline || lead.claim) || `${clientLabel} — ${zoneLabel}`,
    cta: "Solicitar visita",
    palette: {
      primary: (Array.isArray(payload.mediaAssets?.brandColors) && payload.mediaAssets.brandColors[0]) || "#d8b46a",
      background: "#080604",
      text: "#f5f0e8",
    },
    logo: payload.mediaAssets?.logo?.url || null,
    heroImage: payload.mediaAssets?.heroImage?.url || null,
    internalNote: "Motor interno Rubik. URL publica: AURUM. No usar rubik-sota-director... como URL cliente-facing.",
  };

  return {
    hookId: "visualExperience",
    hookName: "Experiencia Visual de Propiedad",
    commercialPurpose: "Primer impacto visual interactivo. Convierte cada propiedad en una experiencia inmersiva que el comprador puede ver antes de la visita presencial.",
    targetAudience: "Comprador potencial, perfil digital activo. Tambien util para presentacion en oficina o en WhatsApp.",
    narrative: `El visitante entra en la experiencia de ${clientLabel} en ${zoneLabel} y ve la propiedad cobrar vida antes de la primera llamada.`,
    embedUrl,
    rubikEmbedUrl: embedUrl,
    rubikStandaloneUrl: `${rubikEmbedBase}/`,
    rubikConfigSeed,
    firstImpression: {
      headline: `Descubre ${clientLabel} en ${zoneLabel}.`,
      subheadline: opportunity,
      format: "fullscreen visual, motion on scroll",
    },
    journeyBlocks: [
      {
        moment: 1,
        title: "Primera imagen",
        description: `El comprador ve la propiedad en su mejor contexto visual. ${zoneLabel}, luz real, espacio en movimiento.`,
        visualCue: "Hero image o video de propiedad con transicion suave.",
      },
      {
        moment: 2,
        title: "El entorno",
        description: `${zoneLabel} como ventaja de vida. Playa, servicios, comunidad.`,
        visualCue: "Mapa o foto aerea del entorno cercano.",
      },
      {
        moment: 3,
        title: "Contacto directo",
        description: `${clientLabel} responde en minutos. WhatsApp o llamada directa.`,
        visualCue: "CTA prominente con numero y WhatsApp.",
      },
    ],
    CTA: {
      label: "Solicitar informacion",
      href: waHref || (phone ? `tel:${phone}` : ""),
      channel: "whatsapp",
    },
    fallbackPlan: {
      trigger: "Si no hay assets con derechos claros aprobados",
      action: "Usar composicion CSS editorial con paleta de marca y sin imagenes de cliente hasta validacion.",
      note: "El wrapper AURUM debe vender la experiencia incluso si el embed Rubik aun esta en draft.",
    },
    internalNotes: [
      `Rubik embed URL: ${embedUrl}`,
      "Rubik es motor interno. AURUM es la URL publica cliente-facing.",
      "Actualizar rubikConfigSeed cuando los assets esten aprobados.",
      "No activar como publicado hasta que la URL publica devuelva 200 real.",
    ],
    routes: {
      primary: routes.visualExperience || "",
      alias: routes.visualExperience?.replace("/visual-experience/", `/${slug}/visual-experience`) || "",
      rubikEmbed: embedUrl,
    },
  };
}

export function buildFullWebsiteSpec(payload, proposalPackage, routes = {}) {
  const lead = payload.lead || {};
  const audit = payload.audit || {};
  const clientLabel = deriveClientLabel(lead);
  const zoneLabel = deriveZoneLabel(lead);
  const phone = derivePrimaryPhone(lead);
  const waHref = deriveWhatsAppHref(phone);
  const email = safeStr(lead.email);
  const services = deriveServices(payload);
  const zones = deriveZonesList(payload);
  const method = deriveMethod(clientLabel);
  const weakness = firstOf(
    Array.isArray(audit.weaknesses) ? audit.weaknesses[0] : "",
    "Presencia digital con margen de mejora visual.",
  );
  const opportunity = firstOf(
    Array.isArray(audit.opportunities) ? audit.opportunities[0] : "",
    "Demostrar capacidad comercial con una web completa de alto impacto.",
  );
  const tagline = safeStr(lead.tagline || lead.claim);
  const heroVideoMotion = Boolean(payload.hooks?.fullWebDemo?.heroVideoMotion);

  return {
    hookId: "fullWebsite",
    hookName: "Web Desarrollada Completa",
    commercialPurpose: "Demostrar que el negocio merece una presencia digital completa. Convierte a visitantes en llamadas directas.",
    targetAudience: "Comprador, propietario o arrendatario que busca una agencia de confianza con presencia digital profesional.",
    heroVideoMotion,
    sections: [
      {
        id: "inicio",
        order: 1,
        type: "hero",
        headline: tagline || `${clientLabel} — Tu aliado inmobiliario en ${zoneLabel}.`,
        subheadline: `${opportunity} La mejor manera de encontrar tu propiedad en ${zoneLabel}.`,
        cta: { label: "Contactar ahora", href: waHref || "" },
        assets: {
          video: (Array.isArray(payload.mediaAssets?.videos) && payload.mediaAssets.videos.find(v => v.recommendedUse === "hero")?.url) || "/VIDEO_AURUM_HEROWEB.mp4",
          image: payload.mediaAssets?.heroImage?.url || null,
        },
        note: heroVideoMotion ? "GSAP + SplitType animation on h1. Hero video/motion obligatorio." : "Hero image. heroVideoMotion not confirmed — add when video asset approved.",
      },
      {
        id: "agencia",
        order: 2,
        type: "presentation",
        headline: `Quienes somos`,
        body: `${clientLabel} es una agencia inmobiliaria especializada en ${zoneLabel}. ${weakness.length > 20 ? "Sabemos que " + weakness.toLowerCase() + "." : ""} Nuestra propuesta es clara: atencion personal, conocimiento local y resultados verificables.`,
        trustSignals: [`Oficina en ${zoneLabel}`, "Atencion directa sin intermediarios", "Especialistas en la zona"],
      },
      {
        id: "zonas",
        order: 3,
        type: "zonesOrMarkets",
        headline: `Donde operamos`,
        zones,
      },
      {
        id: "servicios",
        order: 4,
        type: "services",
        headline: "Nuestros servicios",
        services: services.map((s, i) => ({ id: i + 1, label: s })),
      },
      {
        id: "propiedades",
        order: 5,
        type: "featuredEditorialItems",
        headline: "Propiedades destacadas",
        note: "Rellenar con fichas de propiedades reales antes de publicar. Placeholders de estructura solo.",
        items: [
          { id: "prop-1", label: "Propiedad 1", zone: zoneLabel, status: "placeholder_replace_before_publish" },
          { id: "prop-2", label: "Propiedad 2", zone: zoneLabel, status: "placeholder_replace_before_publish" },
          { id: "prop-3", label: "Propiedad 3", zone: zoneLabel, status: "placeholder_replace_before_publish" },
        ],
      },
      {
        id: "metodo",
        order: 6,
        type: "method",
        headline: "Como trabajamos",
        steps: method,
      },
      {
        id: "experiencia-visual",
        order: 7,
        type: "visualExperienceSection",
        headline: "Experiencia Visual",
        embedUrl: `https://${INTERNAL_ENGINE_DOMAIN}/dynamic-motion-banner/${sanitizeSlug(lead.slug)}/?embed=1`,
        publicUrl: routes.visualExperience || "",
        note: "AURUM es la URL publica. Rubik es motor interno. No usar rubik-sota-director... como URL cliente-facing.",
      },
      {
        id: "contacto",
        order: 8,
        type: "contact",
        headline: "Contacta con nosotros",
        contact: {
          phone: phone || null,
          whatsapp: waHref || null,
          email: email || null,
          address: safeStr(lead.address) || null,
          schedule: safeStr(lead.schedule) || null,
          website: safeStr(lead.website) || null,
        },
      },
    ],
    finalCTA: {
      headline: `Hablemos sobre tu propiedad en ${zoneLabel}.`,
      label: "Contactar ahora",
      href: waHref || (phone ? `tel:${phone}` : ""),
      channel: "whatsapp",
    },
    internalNotes: [
      "Seccion propiedades debe sustituir placeholders antes de publicar.",
      "Hero video: usar /VIDEO_AURUM_HEROWEB.mp4 si no hay video propio aprobado.",
      "GSAP + SplitType obligatorio en headline de inicio si heroVideoMotion: true.",
      "No publicar sin validacion humana de copy y assets.",
    ],
    routes: {
      primary: routes.webCompleta || "",
      alias: routes.webCompleta ? routes.webCompleta.replace("-web-completa", "/web-completa") : "",
    },
  };
}

export function buildBannerPackSpec(payload, proposalPackage, routes = {}) {
  const lead = payload.lead || {};
  const clientLabel = deriveClientLabel(lead);
  const zoneLabel = deriveZoneLabel(lead);
  const phone = derivePrimaryPhone(lead);
  const waHref = deriveWhatsAppHref(phone);
  const email = safeStr(lead.email);
  const address = safeStr(lead.address);
  const website = safeStr(lead.website);
  const schedule = safeStr(lead.schedule);
  const tagline = safeStr(lead.tagline || lead.claim);

  const primaryClaim = tagline || `${clientLabel} — Tu aliado en ${zoneLabel}.`;
  const claims = [
    primaryClaim,
    `Especialistas en ${zoneLabel}. Atencion personal desde el primer dia.`,
    `Compra, venta y alquiler. Tu propiedad en ${zoneLabel} con ${clientLabel}.`,
    `Empieza hoy. Contacta con ${clientLabel} directamente.`,
  ];

  return {
    hookId: "bannerPack",
    hookName: "Pack de Banners Personalizados",
    commercialPurpose: "Creatividades listas para publicar en redes sociales, Google Display, WhatsApp, YouTube y presentaciones. Cada formato tiene copy y composicion especifica.",
    targetAudience: "Comprador o arrendatario en redes sociales, Google, YouTube. Tambien para uso en presentacion de captacion a propietarios.",
    claims,
    formats: [
      { id: "vertical", ratio: "9:16", dimensions: "1080 × 1920 px", useCases: ["Instagram Stories", "Reels", "TikTok", "WhatsApp Status"] },
      { id: "horizontal", ratio: "16:9", dimensions: "1920 × 1080 px", useCases: ["YouTube ads", "Google Display", "Presentaciones", "LinkedIn"] },
      { id: "pack", ratio: "mixed", dimensions: "Pagina showcase", useCases: ["Revision interna", "Envio a cliente", "Presentacion comercial"] },
    ],
    formatSpecificCopy: {
      vertical: {
        headline: primaryClaim,
        subline: `Especialistas en ${zoneLabel}. Atencion personalizada desde el primer contacto.`,
        chips: ["Compra", "Venta", "Asesoramiento", zoneLabel].filter(Boolean),
        contact: {
          phone: phone || null,
          email: email || null,
          cta: "Ver propiedad",
        },
        address: address || null,
        schedule: schedule || null,
        format: "Composicion CSS 9:16. Top bar: branding. Centro: headline + subline + chips. Bottom: telefono + CTA.",
      },
      horizontal: {
        headline: primaryClaim,
        subline: `Agencia inmobiliaria con atencion personalizada en ${zoneLabel}.`,
        leftColumn: {
          brand: clientLabel,
          headline: primaryClaim,
          claim: `${zoneLabel}.`,
        },
        rightColumn: {
          chips: ["Compra", "Venta", "Asesoramiento"],
          contact: {
            address: address ? `${address}` : `${zoneLabel}`,
            phone: phone || null,
            email: email || null,
          },
          cta: website ? website.replace(/^https?:\/\//, "") : clientLabel.toLowerCase().replace(/\s+/g, "") + ".es",
          schedule: schedule || null,
        },
        format: "Composicion CSS 16:9. Divisor vertical al 55%. Izquierda: branding + headline. Derecha: chips + contacto + CTA.",
      },
    },
    CTA: {
      label: website ? website.replace(/^https?:\/\//, "") : "Contactar ahora",
      href: website || waHref || "",
      channel: website ? "website" : "whatsapp",
    },
    contact: {
      phone: phone || null,
      whatsapp: waHref || null,
      email: email || null,
      address: address || null,
      schedule: schedule || null,
      website: website || null,
    },
    visualDirection: "Composicion CSS editorial. Fondo oscuro (#080604). Acento dorado primario. Tipografia: font-serif para titular, font-mono para etiquetas. Sin imagenes de cliente hasta validacion de derechos.",
    internalNotes: [
      "Claims deben revisarse con el cliente antes de publicar en campana.",
      "Imagenes de propiedad: no incluir hasta que los derechos esten validados.",
      "El pack view debe mostrar composicion real, no solo enlaces.",
    ],
    routes: {
      pack: routes.bannerPack || "",
      vertical: routes.bannerVertical || "",
      horizontal: routes.bannerHorizontal || "",
    },
  };
}

export function buildFourHooksQualityReport(specs, payload) {
  const lead = payload.lead || {};
  const clientLabel = deriveClientLabel(lead);
  const zoneLabel = deriveZoneLabel(lead);
  const phone = derivePrimaryPhone(lead);

  const FORBIDDEN = [
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
    "Â",
    "Ã",
    "�",
  ];

  function collectStrings(value, out = []) {
    if (typeof value === "string") { out.push(value); return out; }
    if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return out; }
    if (value && typeof value === "object") { for (const v of Object.values(value)) collectStrings(v, out); }
    return out;
  }

  function checkForbidden(spec, specName) {
    const text = collectStrings(spec).join("\n");
    const hits = FORBIDDEN.filter(f => text.includes(f));
    return hits.map(h => `${specName}: forbidden string found — "${h}"`);
  }

  function checkPresence(spec, field, label, specName) {
    const val = spec?.[field];
    if (!val || (typeof val === "string" && val.trim().length === 0)) {
      return `${specName}: missing required field "${label}"`;
    }
    return null;
  }

  function checkContains(text, substring, label, specName) {
    if (!text || !text.toLowerCase().includes(substring.toLowerCase())) {
      return `${specName}: copy does not reference ${label}`;
    }
    return null;
  }

  const blockers = [];
  const warnings = [];
  const checks = [];

  // Anti-generic: client name must appear in each spec's copy
  for (const [specName, spec] of Object.entries(specs)) {
    const text = collectStrings(spec).join("\n");
    const hasForbidden = checkForbidden(spec, specName);
    if (hasForbidden.length) {
      blockers.push(...hasForbidden);
      checks.push({ spec: specName, check: "no_forbidden_strings", passed: false, detail: hasForbidden.join("; ") });
    } else {
      checks.push({ spec: specName, check: "no_forbidden_strings", passed: true });
    }

    // Client name check
    if (clientLabel && clientLabel !== "el cliente") {
      const nameInCopy = checkContains(text, clientLabel.split(" ")[0], `client name "${clientLabel}"`, specName);
      if (nameInCopy) {
        warnings.push(nameInCopy);
        checks.push({ spec: specName, check: "client_name_in_copy", passed: false, detail: nameInCopy });
      } else {
        checks.push({ spec: specName, check: "client_name_in_copy", passed: true });
      }
    }

    // Zone check
    if (zoneLabel && zoneLabel !== "la zona") {
      const zoneInCopy = checkContains(text, zoneLabel.split(" ")[0], `zone "${zoneLabel}"`, specName);
      if (zoneInCopy) {
        warnings.push(zoneInCopy);
        checks.push({ spec: specName, check: "zone_in_copy", passed: false, detail: zoneInCopy });
      } else {
        checks.push({ spec: specName, check: "zone_in_copy", passed: true });
      }
    }
  }

  // CTA presence per spec
  const ctaChecks = [
    { spec: "landingSpec", field: "hero.primaryCta.href", label: "primary CTA href" },
    { spec: "visualExperienceSpec", field: "CTA.href", label: "CTA href" },
    { spec: "fullWebsiteSpec", field: "finalCTA.href", label: "finalCTA href" },
    { spec: "bannerPackSpec", field: "CTA.href", label: "CTA href" },
  ];
  for (const { spec: specKey, label } of ctaChecks) {
    const spec = specs[specKey];
    const text = collectStrings(spec).join("\n");
    const hasWa = text.includes("wa.me") || text.includes("tel:") || text.includes("http");
    if (!hasWa) {
      warnings.push(`${specKey}: no CTA URL found (${label})`);
      checks.push({ spec: specKey, check: "cta_url_present", passed: false });
    } else {
      checks.push({ spec: specKey, check: "cta_url_present", passed: true });
    }
  }

  // Phone present in at least landing and banner
  if (!phone) {
    warnings.push("No verified phone in lead — CTAs may be missing contact.");
  }

  // Differentiation: landing vs fullWebsite
  const landingHeadline = specs.landingSpec?.hero?.headline || "";
  const webHeadline = specs.fullWebsiteSpec?.sections?.[0]?.headline || "";
  if (landingHeadline && webHeadline && landingHeadline === webHeadline) {
    warnings.push("landingSpec and fullWebsiteSpec share the same hero headline — ensure differentiation.");
  }

  // Banner format-specific copy differs
  const vertClaim = specs.bannerPackSpec?.formatSpecificCopy?.vertical?.subline || "";
  const horizClaim = specs.bannerPackSpec?.formatSpecificCopy?.horizontal?.subline || "";
  if (vertClaim && horizClaim && vertClaim === horizClaim) {
    warnings.push("bannerPackSpec: vertical and horizontal sublines are identical — differentiate per format.");
  }

  // Asset validation
  if (payload.mediaAssets?.logo?.status !== "approved") {
    warnings.push("mediaAssets.logo: not approved — visual experience and banners may use placeholder.");
  }
  if (payload.mediaAssets?.heroImage?.status !== "approved") {
    warnings.push("mediaAssets.heroImage: not approved — web completa hero may fall back to VIDEO_AURUM_HEROWEB.mp4.");
  }

  const passed = blockers.length === 0;

  return {
    passed,
    summary: passed
      ? `QA report: ${checks.length} checks, ${warnings.length} warnings, 0 blockers. Listo para revision humana.`
      : `QA report: ${blockers.length} blocker(s) found. No publicar hasta resolver.`,
    blockers,
    warnings,
    checks,
    internalNote: "Este reporte es de uso interno. No incluir en copy publico ni en componentes AURUM.",
  };
}
