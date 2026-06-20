import { sanitizeSlug } from "./security.ts";
import { buildPremiumFourHookSpecs } from "./fourHookSpecs.ts";

export function buildProposalPackage(payload, plan = {}) {
  const lead = payload.lead || {};
  const slug = sanitizeSlug(lead.slug);
  const clientName = lead.name || "Cliente";
  const sector = lead.sector || "Sector pendiente";
  const score = payload.audit?.signals?.score ?? payload.audit?.signals?.commercialScore ?? null;
  const opportunities = Array.isArray(payload.audit?.opportunities) ? payload.audit.opportunities : [];
  const weaknesses = Array.isArray(payload.audit?.weaknesses) ? payload.audit.weaknesses : [];
  const painDetected = weaknesses[0] || "Presencia digital con margen de mejora visual y comercial.";
  const opportunityDetected = opportunities[0] || "Crear un sistema visual premium con cuatro ganchos comerciales revisables.";
  const routes = payload.targetRoutes || {};

  const fourHooks = {
    visualExperience: {
      label: "Experiencia Visual de Propiedad",
      status: "planned",
      targetUrl: routes.visualExperience,
      purpose: "Primer impacto visual interactivo para captar atencion.",
    },
    landing: {
      label: "Landing Comercial Personalizada",
      status: "planned",
      targetUrl: routes.landing,
      purpose: "Pagina breve para explicar oportunidad, CTA y siguiente paso.",
    },
    webCompleta: {
      label: "Web Desarrollada Completa",
      status: "planned",
      targetUrl: routes.webCompleta,
      purpose: "Demo completa con narrativa, servicios, visual experience y CTA.",
    },
    bannerPack: {
      label: "Pack de Banners Personalizados",
      status: "planned",
      targetUrl: routes.bannerPack,
      verticalUrl: routes.bannerVertical,
      horizontalUrl: routes.bannerHorizontal,
      purpose: "Creatividades vertical/horizontal para campanas y remarketing.",
    },
  };

  const proposalSummary = `${clientName}: propuesta de 4 ganchos Immersphere para convertir auditoria y activos disponibles en una experiencia comercial revisable antes de produccion.`;
  const whatsappMessage = `Hola, ${clientName}. Hemos preparado una propuesta visual con 4 piezas: experiencia visual, landing, web completa y banners. La idea es revisar juntos el enfoque antes de publicar nada definitivo.`;
  const emailSubject = `Propuesta visual Immersphere para ${clientName}`;
  const emailBody = `Hola,\n\nHemos preparado un paquete de propuesta para ${clientName} basado en la auditoria y los activos disponibles.\n\nIncluye:\n- Experiencia Visual de Propiedad\n- Landing Comercial Personalizada\n- Web Desarrollada Completa\n- Pack de Banners vertical/horizontal\n\nTodo queda en revision humana antes de merge, deploy o envio final.\n\nUn saludo.`;
  const callScript = `Abrir con el dolor detectado: ${painDetected}. Presentar la oportunidad como showroom comercial revisable: ${opportunityDetected}. Cerrar proponiendo revisar los 4 ganchos antes de publicar.`;
  const followUpMessage = `Te dejo preparada la propuesta visual de ${clientName}. Cuando quieras, revisamos juntos que piezas priorizar para la primera version.`;

  const basePackage = {
    clientName,
    slug,
    sector,
    score,
    painDetected,
    opportunityDetected,
    fourHooks,
    proposalSummary,
    whatsappMessage,
    emailSubject,
    emailBody,
    callScript,
    followUpMessage,
    internalNotes: [
      "No enviar automaticamente desde v0.2.",
      "No marcar generated hasta validar URLs reales 200.",
      "No conectar CRM estatico con token server-side.",
    ],
    reviewChecklist: [
      "Validar derechos de assets.",
      "Confirmar copy sin contenido cruzado.",
      "Verificar PR Rubik.",
      "Verificar PR AURUM.",
      "Verificar que dispatch real sigue bloqueado.",
    ],
    plannedBranches: plan.branches || {},
    targetPRs: plan.targetPRs || {},
  };

  const premiumSpecs = buildPremiumFourHookSpecs(payload, basePackage, plan);

  return { ...basePackage, premiumSpecs };
}
