import { getFileContent } from "./githubClient.ts";
import { AURUM_REPO, componentBaseFromSlug, RUBIK_REPO } from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
import { INTERNAL_ENGINE_DOMAIN, SERVICE_VERSION } from "./schemas.ts";
import type { ExistingOutputResult, IdempotencyPlan } from "./outputIdempotency.ts";

export interface ExistingOutputReview {
  passed: boolean;
  status: "current" | "stale" | "partial" | "missing" | "unsafe";
  mismatches: string[];
  criticalWarnings: string[];
  safeWarnings: string[];
  checkedFiles: string[];
  recommendedAction: string;
}

interface ReviewContext {
  payload: Record<string, unknown>;
  plan: Record<string, unknown>;
  slug: string;
  componentBase: string;
  camelBase: string;
}

const EXPECTED_GENERATED_BY = `immersphere-production-orchestrator-v${SERVICE_VERSION}`;

const STALE_MANIFEST_MARKERS = [
  "v0.2",
  "v0.3",
  "does not touch App.tsx",
  "does not create public routes",
  "planned",
  "review_required",
];

const DANGEROUS_CLIENT_FACING_STRINGS = [
  "Internal draft",
  "Borrador interno",
  "lorem",
  "planned",
  "v0.2",
  "v0.3",
  "do not touch",
  "review required",
];

const PLACEHOLDER_PROPERTY_NAMES = [
  "Apartamento Torrevieja Centro",
  "Villa Los Altos",
  "Piso Playa del Cura",
  "propiedades reales se integran",
  "placeholder editorial",
  "Acme Inmobiliaria",
  "Demo Cliente",
  "Cliente Ejemplo",
  "Sample Property",
  "Propiedad de ejemplo",
  "Inmobiliaria Ejemplo",
];

const GENERIC_PLACEHOLDER_PATTERNS = [
  /propiedad\s+de\s+ejemplo/i,
  /sample\s+property/i,
  /demo\s+client/i,
  /cliente\s+de\s+prueba/i,
  /acme\s+/i,
  /lorem\s+ipsum/i,
];

function hasAny(text: string, needles: string[]): string | null {
  const lower = text.toLowerCase();
  for (const needle of needles) {
    if (lower.includes(needle.toLowerCase())) return needle;
  }
  return null;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function expectedAurumRoutes(slug: string): string[] {
  return [
    `/${slug}`,
    `/${slug}-web-completa`,
    `/visual-experience/${slug}`,
    `/banners/${slug}`,
  ];
}

function extractComponentNamesFromAppTsx(appContent: string, slug: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*['"]\\./([^'"]+)['"]`, "g");
  let m;
  while ((m = re.exec(appContent)) !== null) {
    const imported = m[1];
    const fromPath = m[2];
    if (fromPath.toLowerCase().includes(slug.toLowerCase()) || imported.toLowerCase().includes(slug.toLowerCase().replace(/-/g, ""))) {
      names.push(...imported.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return [...new Set(names)];
}

async function fetchText(repo: string, path: string, branch: string): Promise<{ exists: boolean; content: string }> {
  const info = await getFileContent(repo, path, branch);
  return { exists: info.exists, content: info.exists ? info.content || "" : "" };
}

async function reviewAurum(ctx: ReviewContext, existing: ExistingOutputResult, branch: string): Promise<ExistingOutputReview> {
  const { payload, plan, slug, componentBase } = ctx;
  const mismatches: string[] = [];
  const criticalWarnings: string[] = [];
  const safeWarnings: string[] = [];
  const checkedFiles: string[] = [];

  const manifestPath = `production-manifests/${slug}.json`;
  const manifestInfo = await fetchText(AURUM_REPO, manifestPath, branch);
  checkedFiles.push(manifestPath);

  if (manifestInfo.exists) {
    const staleMarker = hasAny(manifestInfo.content, STALE_MANIFEST_MARKERS);
    if (staleMarker) mismatches.push(`stale_manifest_version:${staleMarker}`);
    if (!manifestInfo.content.includes(EXPECTED_GENERATED_BY)) {
      mismatches.push(`stale_manifest_version:generated_by_does_not_match_v${SERVICE_VERSION}`);
    }

    const manifest = safeJson(manifestInfo.content);
    if (manifest && typeof manifest === "object") {
      const manifestRoutes = (manifest.routes || {}) as Record<string, string>;
      const expectedRoutes = expectedAurumRoutes(slug);
      for (const key of expectedRoutes) {
        if (!Object.values(manifestRoutes).some((r) => r === key)) {
          mismatches.push(`target_routes_mismatch:manifest_missing_${key}`);
        }
      }
    }
  }

  const appInfo = await fetchText(AURUM_REPO, "src/App.tsx", branch);
  checkedFiles.push("src/App.tsx");
  if (appInfo.exists) {
    const expectedRoutes = expectedAurumRoutes(slug);
    for (const route of expectedRoutes) {
      if (!appInfo.content.includes(`path="${route}"`)) {
        mismatches.push(`target_routes_mismatch:app_missing_${route}`);
      }
    }

    const dangerous = hasAny(appInfo.content, DANGEROUS_CLIENT_FACING_STRINGS);
    if (dangerous) criticalWarnings.push(`client_facing_dangerous_copy:App.tsx:${dangerous}`);

    const componentNames = extractComponentNamesFromAppTsx(appInfo.content, slug);
    const webCompletaName = componentNames.find((n) => n.toLowerCase().includes("webcompleta") || n.toLowerCase().includes("web-completa"));
    if (webCompletaName) {
      const webPath = `src/${webCompletaName}.tsx`;
      const webInfo = await fetchText(AURUM_REPO, webPath, branch);
      checkedFiles.push(webPath);
      if (webInfo.exists) {
        for (const placeholder of PLACEHOLDER_PROPERTY_NAMES) {
          if (webInfo.content.includes(placeholder)) mismatches.push(`placeholder_property_cards_detected:${placeholder}`);
        }
        for (const pattern of GENERIC_PLACEHOLDER_PATTERNS) {
          const match = webInfo.content.match(pattern);
          if (match) mismatches.push(`placeholder_property_pattern_detected:${match[0]}`);
        }
        const dangerousWeb = hasAny(webInfo.content, DANGEROUS_CLIENT_FACING_STRINGS);
        if (dangerousWeb) criticalWarnings.push(`client_facing_dangerous_copy:${webPath}:${dangerousWeb}`);
      }
    }

    const dataFileCandidates = [
      `src/data/clientDemos/${ctx.camelBase}.ts`,
      `src/data/clientDemos/sandhouse.ts`,
    ];
    for (const dataPath of dataFileCandidates) {
      const dataInfo = await fetchText(AURUM_REPO, dataPath, branch);
      if (dataInfo.exists) {
        checkedFiles.push(dataPath);
        const auditPayload = (payload.audit as Record<string, unknown>) || {};
        const payloadScore = Number(auditPayload.score ?? NaN);
        const scoreMatch = dataInfo.content.match(/score\s*[:=]\s*(\d+)/);
        const dataScore = scoreMatch ? Number(scoreMatch[1]) : NaN;
        const expectedScore = Number.isNaN(payloadScore) ? 35 : payloadScore;
        if (!Number.isNaN(dataScore) && expectedScore !== dataScore) {
          mismatches.push(`audit_score_mismatch:expected_${expectedScore}_vs_aurum_${dataScore}`);
        }

        const embedMatch = dataInfo.content.match(/embedUrl\s*:\s*["']([^"']+)["']/);
        if (embedMatch) {
          const embedUrl = embedMatch[1];
          if (embedUrl.includes("/gesture-lab/") && !embedUrl.includes(INTERNAL_ENGINE_DOMAIN)) {
            mismatches.push(`gesture_lab_url_mismatch:${embedUrl}`);
          }
        }
        break;
      }
    }
  }

  const hasOutputs = existing.existing.length > 0;
  if (!hasOutputs) {
    return {
      passed: true,
      status: "missing",
      mismatches: [],
      criticalWarnings: [],
      safeWarnings,
      checkedFiles,
      recommendedAction: "create_new_prs",
    };
  }

  const unsafe = criticalWarnings.some((w) => w.startsWith("client_facing_dangerous_copy") || w.includes("gesture_lab_url_mismatch"));
  const failed = mismatches.length > 0 || criticalWarnings.length > 0;

  return {
    passed: !failed,
    status: failed ? (unsafe ? "unsafe" : "stale") : "current",
    mismatches,
    criticalWarnings,
    safeWarnings,
    checkedFiles,
    recommendedAction: failed ? "create_update_prs" : "ready_to_validate_public_urls",
  };
}

async function reviewRubik(ctx: ReviewContext, existing: ExistingOutputResult, branch: string): Promise<ExistingOutputReview> {
  const { slug } = ctx;
  const mismatches: string[] = [];
  const criticalWarnings: string[] = [];
  const safeWarnings: string[] = [];
  const checkedFiles: string[] = [];

  const manifestPath = `production-manifests/${slug}.json`;
  const manifestInfo = await fetchText(RUBIK_REPO, manifestPath, branch);
  checkedFiles.push(manifestPath);
  if (manifestInfo.exists) {
    const staleMarker = hasAny(manifestInfo.content, STALE_MANIFEST_MARKERS);
    if (staleMarker) mismatches.push(`rubik_manifest_stale:${staleMarker}`);
    if (!manifestInfo.content.includes(EXPECTED_GENERATED_BY)) {
      mismatches.push(`rubik_manifest_stale:generated_by_does_not_match_v${SERVICE_VERSION}`);
    }
  }

  const indexPath = `dynamic-motion-banner/${slug}/index.html`;
  const indexInfo = await fetchText(RUBIK_REPO, indexPath, branch);
  checkedFiles.push(indexPath);
  if (indexInfo.exists) {
    const dangerous = hasAny(indexInfo.content, DANGEROUS_CLIENT_FACING_STRINGS);
    if (dangerous) criticalWarnings.push(`rubik_internal_draft_in_public_output:${indexPath}:${dangerous}`);
  }

  const bannerPaths = [
    `dynamic-motion-banner/${slug}/banner-vertical.html`,
    `dynamic-motion-banner/${slug}/banner-horizontal.html`,
  ];
  for (const bannerPath of bannerPaths) {
    const bannerInfo = await fetchText(RUBIK_REPO, bannerPath, branch);
    checkedFiles.push(bannerPath);
    if (bannerInfo.exists) {
      const dangerous = hasAny(bannerInfo.content, DANGEROUS_CLIENT_FACING_STRINGS);
      if (dangerous) criticalWarnings.push(`rubik_internal_draft_in_public_output:${bannerPath}:${dangerous}`);
    }
  }

  const vercelInfo = await fetchText(RUBIK_REPO, "vercel.json", branch);
  checkedFiles.push("vercel.json");
  if (vercelInfo.exists) {
    const vercel = safeJson(vercelInfo.content);
    const rewrites = Array.isArray(vercel?.rewrites) ? vercel.rewrites as Array<{ source: string }> : [];
    const sources = new Set(rewrites.map((r) => r.source));
    const required = [
      `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
      `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
    ];
    for (const s of required) {
      if (!sources.has(s) && !sources.has(s + "/")) {
        mismatches.push(`banner_routes_missing_or_incorrect:${s}`);
      }
    }
  }

  const hasOutputs = existing.existing.length > 0;
  if (!hasOutputs) {
    return {
      passed: true,
      status: "missing",
      mismatches: [],
      criticalWarnings: [],
      safeWarnings,
      checkedFiles,
      recommendedAction: "create_new_prs",
    };
  }

  const unsafe = criticalWarnings.some((w) => w.startsWith("rubik_internal_draft_in_public_output"));
  const failed = mismatches.length > 0 || criticalWarnings.length > 0;

  return {
    passed: !failed,
    status: failed ? (unsafe ? "unsafe" : "stale") : "current",
    mismatches,
    criticalWarnings,
    safeWarnings,
    checkedFiles,
    recommendedAction: failed ? "create_update_prs" : "ready_to_validate_public_urls",
  };
}

export async function reviewExistingOutputsAgainstProductionPackage(
  payload: Record<string, unknown>,
  plan: Record<string, unknown>,
  existingOutputs: IdempotencyPlan,
  baseBranch = "main",
): Promise<{ rubik: ExistingOutputReview; aurum: ExistingOutputReview; overall: ExistingOutputReview }> {
  const slug = sanitizeSlug(String(plan.leadSlug || payload.lead?.slug || ""));
  const componentBase = componentBaseFromSlug(slug);
  const camelBase = slug.split("-").filter(Boolean).map((p, i) =>
    i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
  ).join("");

  const ctx: ReviewContext = { payload, plan, slug, componentBase, camelBase };

  const [rubik, aurum] = await Promise.all([
    reviewRubik(ctx, existingOutputs.rubik, baseBranch),
    reviewAurum(ctx, existingOutputs.aurum, baseBranch),
  ]);

  const allMismatches = [...rubik.mismatches, ...aurum.mismatches];
  const allCritical = [...rubik.criticalWarnings, ...aurum.criticalWarnings];
  const allSafe = [...rubik.safeWarnings, ...aurum.safeWarnings];
  const allChecked = [...rubik.checkedFiles, ...aurum.checkedFiles];

  let status: ExistingOutputReview["status"] = "current";
  if (rubik.status === "unsafe" || aurum.status === "unsafe") status = "unsafe";
  else if (rubik.status === "stale" || aurum.status === "stale") status = "stale";
  else if (rubik.status === "partial" || aurum.status === "partial") status = "partial";
  else if (rubik.status === "missing" || aurum.status === "missing") status = "partial";

  const passed = rubik.passed && aurum.passed && status === "current";

  const overall: ExistingOutputReview = {
    passed,
    status,
    mismatches: allMismatches,
    criticalWarnings: allCritical,
    safeWarnings: allSafe,
    checkedFiles: allChecked,
    recommendedAction: passed ? "ready_to_validate_public_urls" : "create_update_prs",
  };

  return { rubik, aurum, overall };
}
