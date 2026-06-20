import { componentBaseFromSlug, RUBIK_REPO, AURUM_REPO } from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";

function json(value) {
  return JSON.stringify(value, null, 2);
}

function tsString(value) {
  return JSON.stringify(value, null, 2);
}

function safeText(value, fallback = "") {
  return String(value || fallback)
    .replace(/<script/gi, "&lt;script")
    .replace(/<\/script/gi, "&lt;/script");
}

export function buildRubikFiles(payload, proposalPackage) {
  const slug = sanitizeSlug(payload.lead?.slug);
  const clientName = safeText(payload.lead?.name, slug);
  const claim = proposalPackage.opportunityDetected;
  const cta = "Solicitar revision de propuesta";
  const config = {
    clientName,
    slug,
    sector: payload.lead?.sector,
    zone: payload.lead?.zone,
    assets: payload.mediaAssets || payload.assets || {},
    targetRoutes: payload.targetRoutes,
    internalEngine: "Rubik SOTA",
    note: "Motor interno. No usar como URL cliente-facing.",
    copy: { claim, cta },
    qa: ["Validar assets", "Revisar responsive", "Confirmar que AURUM sera URL publica"],
  };
  const manifest = {
    slug,
    clientName,
    generatedBy: "immersphere-production-orchestrator-v0.2",
    fourHooks: proposalPackage.fourHooks,
    files: [
      `dynamic-motion-banner/${slug}/index.html`,
      `dynamic-motion-banner/${slug}/banner-vertical.html`,
      `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    ],
  };
  return [
    {
      repo: RUBIK_REPO,
      path: `production-manifests/${slug}.json`,
      content: json({ ...manifest, config }),
      message: `Add ${clientName} production manifest`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/README.md`,
      content: `# ${clientName} Dynamic Motion Banner\n\nInternal Rubik engine draft for ${clientName}.\n\n- Slug: ${slug}\n- Sector: ${safeText(payload.lead?.sector, "pending")}\n- Public URL layer: AURUM\n- Status: review required\n\nDo not use /gesture-lab/ as client-facing URL.\n`,
      message: `Add ${clientName} dynamic motion README`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/config.json`,
      content: json(config),
      message: `Add ${clientName} dynamic motion config`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/assets-manifest.json`,
      content: json({
        logo: payload.mediaAssets?.logo || null,
        heroImage: payload.mediaAssets?.heroImage || null,
        propertyImages: payload.mediaAssets?.propertyImages || [],
        videos: payload.mediaAssets?.videos || [],
        rightsReviewRequired: true,
      }),
      message: `Add ${clientName} assets manifest`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/index.html`,
      content: buildRubikHtml({ clientName, slug, claim, cta, format: "experience" }),
      message: `Add ${clientName} visual experience draft`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/banner-vertical.html`,
      content: buildRubikHtml({ clientName, slug, claim, cta, format: "vertical" }),
      message: `Add ${clientName} vertical banner draft`,
    },
    {
      repo: RUBIK_REPO,
      path: `dynamic-motion-banner/${slug}/banner-horizontal.html`,
      content: buildRubikHtml({ clientName, slug, claim, cta, format: "horizontal" }),
      message: `Add ${clientName} horizontal banner draft`,
    },
  ];
}

export function buildAurumFiles(payload, proposalPackage, prLinks = {}) {
  const slug = sanitizeSlug(payload.lead?.slug);
  const componentBase = componentBaseFromSlug(slug);
  const productionPlan = {
    slug,
    clientName: proposalPackage.clientName,
    targetRoutes: payload.targetRoutes,
    branches: proposalPackage.plannedBranches,
    pullRequests: prLinks,
    fourHooks: proposalPackage.fourHooks,
    qaChecklist: proposalPackage.reviewChecklist,
    status: "review_required",
    note: "v0.2 does not touch App.tsx or create public routes yet.",
  };
  const files = [
    {
      repo: AURUM_REPO,
      path: `production-manifests/${slug}.json`,
      content: json({ productionPlan, proposalPackage }),
      message: `Add ${proposalPackage.clientName} AURUM production manifest`,
    },
    {
      repo: AURUM_REPO,
      path: `src/generated/${componentBase}ProductionPlan.ts`,
      content: `export const productionPlan = ${tsString(productionPlan)} as const;\n`,
      message: `Add ${proposalPackage.clientName} production plan`,
    },
    {
      repo: AURUM_REPO,
      path: `src/generated/${componentBase}ProposalPackage.ts`,
      content: `export const proposalPackage = ${tsString(proposalPackage)} as const;\n`,
      message: `Add ${proposalPackage.clientName} proposal package`,
    },
  ];

  if (proposalPackage.premiumSpecs) {
    files.push(
      {
        repo: AURUM_REPO,
        path: `src/generated/${componentBase}FourHookSpecs.ts`,
        content: `export const fourHookSpecs = ${tsString(proposalPackage.premiumSpecs)} as const;\n`,
        message: `Add ${proposalPackage.clientName} premium four hook specs`,
      },
      {
        repo: AURUM_REPO,
        path: `production-manifests/${slug}-premium-specs.json`,
        content: json(proposalPackage.premiumSpecs),
        message: `Add ${proposalPackage.clientName} premium specs manifest`,
      },
    );
  }

  return files;
}

function buildRubikHtml({ clientName, slug, claim, cta, format }) {
  const isVertical = format === "vertical";
  const isHorizontal = format === "horizontal";
  const aspect = isVertical ? "min-height: 900px; max-width: 520px;" : isHorizontal ? "min-height: 420px; max-width: 1100px;" : "min-height: 720px; max-width: 980px;";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(clientName)} - ${format}</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#111;color:#fff;display:grid;place-items:center;min-height:100vh}
    main{${aspect} width:100%;padding:48px;box-sizing:border-box;background:linear-gradient(135deg,#151515,#3a2f1d 55%,#0f0f0f);display:flex;flex-direction:column;justify-content:space-between}
    .eyebrow{letter-spacing:.18em;text-transform:uppercase;color:#d8b46a;font-size:12px}
    h1{font-size:clamp(36px,8vw,92px);line-height:.95;margin:24px 0}
    p{font-size:clamp(18px,3vw,28px);max-width:760px;color:#f1e7d0}
    a{display:inline-block;color:#111;background:#d8b46a;padding:14px 22px;text-decoration:none;font-weight:700}
    small{color:#b9b9b9}
  </style>
</head>
<body>
  <main data-client-slug="${safeText(slug)}" data-format="${safeText(format)}">
    <section>
      <div class="eyebrow">Rubik internal engine - review draft</div>
      <h1>${safeText(clientName)}</h1>
      <p>${safeText(claim)}</p>
    </section>
    <section>
      <a href="#" aria-label="${safeText(cta)}">${safeText(cta)}</a>
      <br><br>
      <small>Internal draft. AURUM must be the public client-facing layer. Replace placeholder visuals after media validation.</small>
    </section>
  </main>
</body>
</html>
`;
}
