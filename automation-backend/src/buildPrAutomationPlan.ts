/**
 * buildPrAutomationPlan.ts — v0.3.0
 * Builds the PR automation plan and Response Bundle for a production package.
 * Orchestrates AURUM + Rubik file generation and validation.
 */

import { sanitizeBranchName, sanitizeSlug } from "./security.ts";
import { CLIENT_FACING_DOMAIN } from "./schemas.ts";
import { buildAurumFiles, buildRubikFiles, validateGeneratedFiles } from "./fileGenerators.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlannedPullRequest {
  repo: "aurum" | "rubik";
  branch: string;
  title: string;
  body: string;
  files: Array<{ path: string; content: string; encoding: "utf8" }>;
}

export interface ResponseBundle {
  schemaVersion: "operator-response-bundle/1.0";
  jobId: string;
  leadId: string;
  slug: string;
  status: "dry_run_ok" | "pr_created" | "needs_manual_merge" | "published" | "failed";
  source: "railway-operator-create-prs";
  pullRequests: {
    aurum: string | null;
    rubik: string | null;
    crm: null;
  };
  plannedPublicRoutes: {
    visualExperience: string;
    landing: string;
    webCompleta: string;
    bannerPack: string;
    bannerVertical: string;
    bannerHorizontal: string;
  };
  publicRoutes: Record<string, string>;
  assetMode: "client_real_asset" | "fallback_internal_library" | "mixed";
  warnings: string[];
  errors: string[];
  createdAt: string;
}

export interface PrAutomationPlan {
  ok: boolean;
  jobId: string;
  leadSlug: string;
  leadId: string;
  pullRequests: PlannedPullRequest[];
  responseBundle: ResponseBundle;
  validationResult: { ok: boolean; errors: string[]; warnings: string[] };
  generatorWarnings: string[];
  generatorErrors: string[];
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildPrAutomationPlan(
  payload: Record<string, unknown>,
  validation: { passed: boolean; errors: string[]; warnings: string[] },
): PrAutomationPlan {
  const lead = (payload.lead || {}) as Record<string, unknown>;
  const slug = sanitizeSlug(String(lead.slug || ""));
  const leadId = String(lead.id || slug);
  const leadName = String(lead.name || slug);
  const timestamp = Date.now();
  const jobId = `prod_${timestamp}_${slug || "invalid"}`;
  const branchSlug = sanitizeBranchName(slug);
  const createdAt = new Date().toISOString();

  const generatorWarnings: string[] = [];
  const generatorErrors: string[] = [];

  if (!validation.passed) {
    const responseBundle = buildResponseBundle({
      jobId,
      leadId,
      slug,
      status: "failed",
      aurumPrUrl: null,
      rubikPrUrl: null,
      assetMode: "fallback_internal_library",
      warnings: validation.warnings,
      errors: validation.errors,
      createdAt,
      targetRoutes: (payload.targetRoutes || {}) as Record<string, string>,
    });

    return {
      ok: false,
      jobId,
      leadSlug: slug,
      leadId,
      pullRequests: [],
      responseBundle,
      validationResult: { ok: false, errors: validation.errors, warnings: validation.warnings },
      generatorWarnings: [],
      generatorErrors: [],
    };
  }

  // Generate AURUM files
  const aurumResult = buildAurumFiles(payload);
  generatorWarnings.push(...aurumResult.warnings);
  generatorErrors.push(...aurumResult.errors);

  // Generate Rubik files
  const rubikResult = buildRubikFiles(payload);
  generatorWarnings.push(...rubikResult.warnings);
  generatorErrors.push(...rubikResult.errors);

  // Validate all generated files
  const allFiles = [...aurumResult.files, ...rubikResult.files];
  const validationResult = validateGeneratedFiles(allFiles);
  if (!validationResult.ok) {
    generatorErrors.push(...validationResult.errors);
  }
  generatorWarnings.push(...validationResult.warnings);

  // Determine asset mode (use AURUM result as primary)
  const assetMode = aurumResult.assetMode;

  // Build PR plans
  const aurumBranch = `production/${branchSlug}-public-pages`;
  const rubikBranch = `production/${branchSlug}-visual-assets`;

  const aurumPr: PlannedPullRequest = {
    repo: "aurum",
    branch: aurumBranch,
    title: `[Production] ${leadName} — Landing, Web Completa & wrappers`,
    body: buildAurumPrBody(leadName, slug, assetMode, aurumResult.warnings),
    files: aurumResult.files.map((f) => ({ path: f.path, content: f.content, encoding: f.encoding })),
  };

  const rubikPr: PlannedPullRequest = {
    repo: "rubik",
    branch: rubikBranch,
    title: `[Production] ${leadName} — Visual Experience & Banners`,
    body: buildRubikPrBody(leadName, slug, assetMode, rubikResult.warnings),
    files: rubikResult.files.map((f) => ({ path: f.path, content: f.content, encoding: f.encoding })),
  };

  const targetRoutes = (payload.targetRoutes || {}) as Record<string, string>;
  const overallOk = generatorErrors.length === 0;

  const responseBundle = buildResponseBundle({
    jobId,
    leadId,
    slug,
    status: overallOk ? "dry_run_ok" : "failed",
    aurumPrUrl: null, // Will be filled after actual PR creation
    rubikPrUrl: null, // Will be filled after actual PR creation
    assetMode,
    warnings: [...validation.warnings, ...generatorWarnings],
    errors: [...generatorErrors],
    createdAt,
    targetRoutes,
  });

  return {
    ok: overallOk,
    jobId,
    leadSlug: slug,
    leadId,
    pullRequests: [aurumPr, rubikPr],
    responseBundle,
    validationResult,
    generatorWarnings,
    generatorErrors,
  };
}

// ─── Response Bundle builder ──────────────────────────────────────────────────

interface ResponseBundleOptions {
  jobId: string;
  leadId: string;
  slug: string;
  status: ResponseBundle["status"];
  aurumPrUrl: string | null;
  rubikPrUrl: string | null;
  assetMode: ResponseBundle["assetMode"];
  warnings: string[];
  errors: string[];
  createdAt: string;
  targetRoutes: Record<string, string>;
}

export function buildResponseBundle(opts: ResponseBundleOptions): ResponseBundle {
  const { jobId, leadId, slug, status, aurumPrUrl, rubikPrUrl, assetMode, warnings, errors, createdAt } = opts;

  const plannedPublicRoutes = {
    visualExperience: `https://${CLIENT_FACING_DOMAIN}/visual-experience/${slug}`,
    landing: `https://${CLIENT_FACING_DOMAIN}/${slug}`,
    webCompleta: `https://${CLIENT_FACING_DOMAIN}/${slug}-web-completa`,
    bannerPack: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}`,
    bannerVertical: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}/vertical`,
    bannerHorizontal: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}/horizontal`,
  };

  // publicRoutes only populated after merge+deploy (not here)
  const publicRoutes: Record<string, string> = {};

  // publicRoutes stays empty until actual 200 confirmed after merge+deploy.
  // targetRoutes from the package are planned routes only — not yet public.

  return {
    schemaVersion: "operator-response-bundle/1.0",
    jobId,
    leadId,
    slug,
    status,
    source: "railway-operator-create-prs",
    pullRequests: {
      aurum: aurumPrUrl,
      rubik: rubikPrUrl,
      crm: null,
    },
    plannedPublicRoutes,
    publicRoutes,
    assetMode,
    warnings: [...new Set(warnings.filter(Boolean))],
    errors: [...new Set(errors.filter(Boolean))],
    createdAt,
  };
}

// ─── PR body builders ─────────────────────────────────────────────────────────

function buildAurumPrBody(name: string, slug: string, assetMode: string, warnings: string[]): string {
  const warningLines = warnings.length > 0
    ? `\n\n### ⚠️ Warnings\n${warnings.map((w) => `- ${w}`).join("\n")}`
    : "";

  return `## [Production] ${name}

Auto-generated by immersphere-production-orchestrator v0.3.0

### Files
- \`src/data/clientDemos/${toCamelCase(slug)}.ts\` — Data file
- \`src/components/clientDemos/${toComponentName(slug)}Landing.tsx\` — Landing component
- \`src/components/clientDemos/${toComponentName(slug)}WebCompleta.tsx\` — Web Completa component (8 sections, hero video motion)
- \`src/components/clientDemos/${toComponentName(slug)}RouterPatch.md\` — Router registration instructions

### Asset Mode
\`${assetMode}\`

### Routes (after merge + deploy)
- Landing: \`/${slug}\`
- Web Completa: \`/${slug}-web-completa\`
- Visual Experience: \`/visual-experience/${slug}\`
- Banner Pack: \`/banners/${slug}\`${warningLines}

### Review Required
- [ ] Validate TypeScript compiles
- [ ] Register routes in App.tsx (see RouterPatch.md)
- [ ] Validate assets load correctly
- [ ] Do NOT merge until assets are approved

> Generated by Railway operator. Human review required before merge.`;
}

function buildRubikPrBody(name: string, slug: string, assetMode: string, warnings: string[]): string {
  const warningLines = warnings.length > 0
    ? `\n\n### ⚠️ Warnings\n${warnings.map((w) => `- ${w}`).join("\n")}`
    : "";

  return `## [Production] ${name}

Auto-generated by immersphere-production-orchestrator v0.3.0

### Files
- \`dynamic-motion-banner/${slug}/config.js\` — Client config
- \`dynamic-motion-banner/${slug}/banner-engine.js\` — Stable engine adapter
- \`dynamic-motion-banner/${slug}/banner-pack/index.html\` — Banner pack
- \`dynamic-motion-banner/${slug}/banner-vertical.html\` — Vertical banner
- \`dynamic-motion-banner/${slug}/banner-horizontal.html\` — Horizontal banner
- \`gesture-lab/${slug}-v1.html\` — Visual Experience
- \`dynamic-motion-banner/${slug}/vercel-rewrite-patch.md\` — Vercel rewrite instructions

### Asset Mode
\`${assetMode}\`

### Routes (after merge + deploy + vercel.json update)
- Visual Experience: \`/gesture-lab/${slug}-v1\`
- Banner Pack: \`/dynamic-motion-banner/${slug}/banner-pack\`
- Banner Vertical: \`/dynamic-motion-banner/${slug}/banner-vertical\`
- Banner Horizontal: \`/dynamic-motion-banner/${slug}/banner-horizontal\`${warningLines}

### Review Required
- [ ] Apply vercel.json rewrites (see vercel-rewrite-patch.md)
- [ ] Validate banners render correctly
- [ ] Validate Visual Experience loads
- [ ] Do NOT merge until assets are approved

> Generated by Railway operator. Human review required before merge.`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function toComponentName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
