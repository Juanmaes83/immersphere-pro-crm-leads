import { getFileContent } from "./githubClient.ts";
import { AURUM_REPO, componentBaseFromSlug, RUBIK_REPO } from "./pathSecurity.ts";
import { resolveProductionScore } from "./productionScore.ts";
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

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extracts every <Route .../> tag as a (path, component) pair without assuming
// attribute order, quote style, or single-line formatting. We locate each
// "<Route" tag start, then independently search for the nearest path= and
// element=<Component within that tag's span (up to the next "<Route" or EOF).
// This avoids the pitfall of a naive [^>]*> regex, which breaks because the
// nested `<Component />` inside element={...} contains its own literal ">".
export function extractAllRouteComponentPairs(appContent: string): Array<{ path: string; component: string }> {
  const routeStarts: number[] = [];
  const routeTagRe = /<Route\b/g;
  let m: RegExpExecArray | null;
  while ((m = routeTagRe.exec(appContent)) !== null) routeStarts.push(m.index);

  const pathRe = /path\s*=\s*(["'])(.*?)\1/g;
  const pathMatches: Array<{ index: number; value: string }> = [];
  while ((m = pathRe.exec(appContent)) !== null) pathMatches.push({ index: m.index, value: m[2] });

  const elementRe = /element\s*=\s*\{\s*<\s*([A-Za-z0-9_.]+)/g;
  const elementMatches: Array<{ index: number; value: string }> = [];
  while ((m = elementRe.exec(appContent)) !== null) elementMatches.push({ index: m.index, value: m[1] });

  const pairs: Array<{ path: string; component: string }> = [];
  for (let i = 0; i < routeStarts.length; i++) {
    const start = routeStarts[i];
    const end = i + 1 < routeStarts.length ? routeStarts[i + 1] : appContent.length;
    const path = pathMatches.find((p) => p.index > start && p.index < end);
    const element = elementMatches.find((e) => e.index > start && e.index < end);
    if (path && element) pairs.push({ path: path.value, component: element.value });
  }
  return pairs;
}

export function extractRouteComponentMap(appContent: string, slug: string): Record<string, string> {
  const relevantRoutes = new Set([
    `/${slug}`,
    `/${slug}-web-completa`,
    `/visual-experience/${slug}`,
    `/banners/${slug}`,
    `/banners/${slug}/vertical`,
    `/banners/${slug}/horizontal`,
  ]);
  const map: Record<string, string> = {};
  for (const { path, component } of extractAllRouteComponentPairs(appContent)) {
    if (relevantRoutes.has(path) && !(path in map)) map[path] = component;
  }
  return map;
}

export function findDuplicateRoutePaths(appContent: string): string[] {
  const counts = new Map<string, number>();
  for (const { path } of extractAllRouteComponentPairs(appContent)) {
    counts.set(path, (counts.get(path) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([p]) => p);
}

// Routes that are functionally equivalent to a canonical route but use a
// different URL shape. AURUM main may have grown these organically before
// the generator's canonical scheme was finalized; we must reuse whatever
// component they already point to rather than creating a duplicate.
const ALIAS_ROUTE_TEMPLATES: Record<string, (slug: string) => string> = {
  webCompleta: (slug) => `/${slug}/web-completa`,
  visualExperience: (slug) => `/${slug}/visual-experience`,
  bannerPack: (slug) => `/${slug}/banners`,
};

export interface AurumRouteResolution {
  componentByCanonicalRoute: Record<string, string>;
  reusedTypes: string[];
  ambiguousTypes: string[];
}

// Resolves which existing component (if any) already serves each canonical
// AURUM route, checking both the canonical path and any known alias path.
// If the canonical and alias paths exist but point to two *different*
// components, that is a genuine ambiguity — we cannot safely guess which one
// is the "real" one, so the caller must block and ask for human review
// instead of picking one and silently dropping the other.
export function resolveAurumRouteComponents(appContent: string, slug: string): AurumRouteResolution {
  const componentByPath: Record<string, string> = {};
  for (const { path, component } of extractAllRouteComponentPairs(appContent)) {
    if (!(path in componentByPath)) componentByPath[path] = component;
  }

  const canonicalRouteByType: Record<string, string> = {
    landing: `/${slug}`,
    webCompleta: `/${slug}-web-completa`,
    visualExperience: `/visual-experience/${slug}`,
    bannerPack: `/banners/${slug}`,
    bannerVertical: `/banners/${slug}/vertical`,
    bannerHorizontal: `/banners/${slug}/horizontal`,
  };

  const componentByCanonicalRoute: Record<string, string> = {};
  const reusedTypes: string[] = [];
  const ambiguousTypes: string[] = [];

  for (const type of Object.keys(canonicalRouteByType)) {
    const canonicalPath = canonicalRouteByType[type];
    const canonicalComponent = componentByPath[canonicalPath];
    const aliasPath = ALIAS_ROUTE_TEMPLATES[type]?.(slug);
    const aliasComponent = aliasPath ? componentByPath[aliasPath] : undefined;

    if (canonicalComponent && aliasComponent && canonicalComponent !== aliasComponent) {
      ambiguousTypes.push(type);
      continue;
    }
    const resolved = canonicalComponent || aliasComponent;
    if (resolved) {
      componentByCanonicalRoute[canonicalPath] = resolved;
      reusedTypes.push(type);
    }
  }

  return { componentByCanonicalRoute, reusedTypes, ambiguousTypes };
}

// Pulls the data-file import out of an existing AURUM component, e.g.
// `import { sandhouse } from "@/data/clientDemos/sandhouse";` ->
// { path: "src/data/clientDemos/sandhouse.ts", exportName: "sandhouse" }.
// Returns null when the component doesn't import from clientDemos at all.
export function extractExistingDataFileRef(componentContent: string): { path: string; exportName: string } | null {
  const m = componentContent.match(
    /import\s*\{\s*([A-Za-z0-9_]+)\s*\}\s*from\s*["']@\/data\/clientDemos\/([A-Za-z0-9_]+)["']/,
  );
  if (!m) return null;
  return { path: `src/data/clientDemos/${m[2]}.ts`, exportName: m[1] };
}

const FORBIDDEN_DOUBLED_NAME_PATTERNS = [
  /LandingLanding/,
  /WebCompletaWebCompleta/,
  /VisualExperienceVisualExperience/,
  /BannerPackBannerPack/,
  /BannerVerticalBannerVertical/,
  /BannerHorizontalBannerHorizontal/,
];

function hasUnsafeGestureLabReference(content: string): boolean {
  const idxRe = /\/gesture-lab\//g;
  let m: RegExpExecArray | null;
  while ((m = idxRe.exec(content)) !== null) {
    const windowStart = Math.max(0, m.index - 80);
    if (!content.slice(windowStart, m.index).includes(INTERNAL_ENGINE_DOMAIN)) return true;
  }
  return false;
}

// Hard gate: scans freshly generated/patched AURUM file content for the
// known failure signatures (doubled component names, gesture-lab leaking
// into client-facing output) before anything is written to GitHub.
export function scanForbiddenGeneratedPatterns(
  files: Array<{ path: string; content?: string }>,
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const content = file.content || "";
    for (const pattern of FORBIDDEN_DOUBLED_NAME_PATTERNS) {
      if (pattern.test(file.path) || pattern.test(content)) {
        violations.push(`forbidden_doubled_component_name:${file.path}:${pattern.source}`);
      }
    }
    if (content && hasUnsafeGestureLabReference(content)) {
      violations.push(`gesture_lab_leak_in_client_facing_output:${file.path}`);
    }
  }
  return violations;
}

// Hard gate: given the existing App.tsx content and the list of route path
// strings the patch is about to add, returns any path that would end up
// duplicated. Must be checked against the *patch* output, not just the raw
// generator output, since buildAppTsxPatch already filters routes it thinks
// are missing — this is the final safety net before writing to GitHub.
export function wouldIntroduceDuplicateRoutes(existingAppTsxContent: string, newRoutePaths: string[]): string[] {
  const existingPaths = new Set(extractAllRouteComponentPairs(existingAppTsxContent).map((p) => p.path));
  const dups: string[] = [];
  const seen = new Set<string>();
  for (const path of newRoutePaths) {
    if (existingPaths.has(path) || seen.has(path)) dups.push(path);
    seen.add(path);
  }
  return dups;
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

    const routeComponentMap = extractRouteComponentMap(appInfo.content, slug);
    const webCompletaName = routeComponentMap[`/${slug}-web-completa`];
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

    for (const [route, componentName] of Object.entries(routeComponentMap)) {
      if (route === `/${slug}-web-completa`) continue;
      const routeFilePath = `src/${componentName}.tsx`;
      const routeFileInfo = await fetchText(AURUM_REPO, routeFilePath, branch);
      if (routeFileInfo.exists) {
        checkedFiles.push(routeFilePath);
        const dangerousRoute = hasAny(routeFileInfo.content, DANGEROUS_CLIENT_FACING_STRINGS);
        if (dangerousRoute) criticalWarnings.push(`client_facing_dangerous_copy:${routeFilePath}:${dangerousRoute}`);
      }
    }

    const dataFileCandidates = [
      `src/data/clientDemos/${ctx.camelBase}.ts`,
      `src/data/clientDemos/${slug.split("-")[0]}.ts`,
      `src/data/clientDemos/sandhouse.ts`,
    ];
    for (const dataPath of dataFileCandidates) {
      const dataInfo = await fetchText(AURUM_REPO, dataPath, branch);
      if (dataInfo.exists) {
        checkedFiles.push(dataPath);
        const expectedScore = resolveProductionScore(payload);
        const scoreRegex = /(digitalPresenceScore|readinessScore|score)\s*[:=]\s*(\d+)/gi;
        const foundScores: Array<{ key: string; value: number }> = [];
        let scoreMatch;
        while ((scoreMatch = scoreRegex.exec(dataInfo.content)) !== null) {
          foundScores.push({ key: scoreMatch[1], value: Number(scoreMatch[2]) });
        }
        const comparisonScore = expectedScore ?? 35;
        for (const { key, value } of foundScores) {
          if (value !== comparisonScore) {
            mismatches.push(`score_mismatch:${key}:expected_${comparisonScore}_vs_aurum_${value}`);
          }
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
