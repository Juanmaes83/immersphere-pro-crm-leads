import { getFileContent } from "./githubClient.ts";
import { AURUM_REPO, RUBIK_REPO } from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
import { CLIENT_FACING_DOMAIN } from "./schemas.ts";

export interface ExistingOutputResult {
  repo: string;
  slug: string;
  allExist: boolean;
  existing: string[];
  missing: string[];
  publicRoutes: Record<string, string>;
  skippedFiles: string[];
}

export interface IdempotencyPlan {
  rubik: ExistingOutputResult;
  aurum: ExistingOutputResult;
  overall: "all_exist" | "partial" | "none";
}

function buildAurumPublicRoutes(slug: string): Record<string, string> {
  return {
    landing: `https://${CLIENT_FACING_DOMAIN}/${slug}`,
    webCompleta: `https://${CLIENT_FACING_DOMAIN}/${slug}-web-completa`,
    visualExperience: `https://${CLIENT_FACING_DOMAIN}/visual-experience/${slug}`,
    bannerPack: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}`,
    bannerVertical: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}/vertical`,
    bannerHorizontal: `https://${CLIENT_FACING_DOMAIN}/banners/${slug}/horizontal`,
  };
}

function buildRubikPublicRoutes(slug: string): Record<string, string> {
  const rubikBase = "https://rubik-sota-director-de-orquesta.vercel.app";
  return {
    visualExperience: `${rubikBase}/dynamic-motion-banner/${slug}/`,
    bannerPack: `${rubikBase}/dynamic-motion-banner/${slug}/banner-pack/`,
    bannerVertical: `${rubikBase}/dynamic-motion-banner/${slug}/banner-vertical.html`,
    bannerHorizontal: `${rubikBase}/dynamic-motion-banner/${slug}/banner-horizontal.html`,
  };
}

async function checkRubikExisting(repo: string, slug: string, baseBranch: string): Promise<ExistingOutputResult> {
  const result: ExistingOutputResult = {
    repo,
    slug,
    allExist: false,
    existing: [],
    missing: [],
    publicRoutes: buildRubikPublicRoutes(slug),
    skippedFiles: [],
  };

  const vercel = await getFileContent(repo, "vercel.json", baseBranch);
  const rewrites = vercel.exists ? (JSON.parse(vercel.content || "{}").rewrites || []) : [];
  const requiredRewrites = [
    `/dynamic-motion-banner/${slug}/banner-pack/vertical`,
    `/dynamic-motion-banner/${slug}/banner-pack/horizontal`,
  ];
  const rewriteSources = new Set(rewrites.map((r: Record<string, string>) => r.source));
  const missingRewrites = requiredRewrites.filter((s) => !rewriteSources.has(s) && !rewriteSources.has(s + "/"));
  if (missingRewrites.length === 0) {
    result.existing.push("vercel.json:banner-routes");
  } else {
    result.missing.push("vercel.json:banner-routes");
  }

  const keyFiles = [
    `dynamic-motion-banner/${slug}/index.html`,
    `dynamic-motion-banner/${slug}/banner-vertical.html`,
    `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    `dynamic-motion-banner/${slug}/banner-pack/index.html`,
    `production-manifests/${slug}.json`,
  ];
  // dynamic-motion-banner/<slug>/index.html is a legacy artifact from an
  // older generator version. buildRubikFiles never writes to that path
  // (gesture-lab/<slug>-v1.html is the current visual-experience entry
  // point), so it can never be "the file we're about to refresh" — it's only
  // useful here as a signal that something was deployed before, not as a
  // file create-prs must update.
  const generatorManagedKeyFiles = new Set(keyFiles.filter((f) => !f.endsWith("/index.html")));

  for (const filePath of keyFiles) {
    const info = await getFileContent(repo, filePath, baseBranch);
    if (info.exists) {
      result.existing.push(filePath);
      if (generatorManagedKeyFiles.has(filePath)) result.skippedFiles.push(filePath);
    } else {
      result.missing.push(filePath);
    }
  }

  result.allExist = result.missing.length === 0;
  return result;
}

async function checkAurumExisting(repo: string, slug: string, baseBranch: string): Promise<ExistingOutputResult> {
  const result: ExistingOutputResult = {
    repo,
    slug,
    allExist: false,
    existing: [],
    missing: [],
    publicRoutes: buildAurumPublicRoutes(slug),
    skippedFiles: [],
  };

  const app = await getFileContent(repo, "src/App.tsx", baseBranch);
  const appContent = app.exists ? app.content || "" : "";
  const requiredRoutes = [
    `path="/${slug}"`,
    `path="/${slug}-web-completa"`,
    `path="/visual-experience/${slug}"`,
    `path="/banners/${slug}"`,
  ];
  const requiredRouteLabels = [
    `App.tsx:/${slug}`,
    `App.tsx:/${slug}-web-completa`,
    `App.tsx:/visual-experience/${slug}`,
    `App.tsx:/banners/${slug}`,
  ];
  for (let i = 0; i < requiredRoutes.length; i++) {
    if (appContent.includes(requiredRoutes[i])) {
      result.existing.push(requiredRouteLabels[i]);
    } else {
      result.missing.push(requiredRouteLabels[i]);
    }
  }

  const manifestPath = `production-manifests/${slug}.json`;
  const manifest = await getFileContent(repo, manifestPath, baseBranch);
  if (manifest.exists) {
    result.existing.push(manifestPath);
    result.skippedFiles.push(manifestPath);
  } else {
    result.missing.push(manifestPath);
  }

  result.allExist = result.missing.length === 0;
  return result;
}

export async function detectExistingOutputsForPlan(
  plan: Record<string, unknown>,
  baseBranch = "main",
): Promise<IdempotencyPlan> {
  const slug = sanitizeSlug(String(plan.leadSlug || ""));
  const targetPRs = (plan.targetPRs || {}) as Record<string, Record<string, string>>;

  const rubikPromise = targetPRs.rubik
    ? checkRubikExisting(targetPRs.rubik.repo, slug, baseBranch)
    : Promise.resolve({ repo: "", slug, allExist: false, existing: [], missing: [], publicRoutes: {}, skippedFiles: [] });
  const aurumPromise = targetPRs.aurum
    ? checkAurumExisting(targetPRs.aurum.repo, slug, baseBranch)
    : Promise.resolve({ repo: "", slug, allExist: false, existing: [], missing: [], publicRoutes: {}, skippedFiles: [] });

  const [rubik, aurum] = await Promise.all([rubikPromise, aurumPromise]);

  let overall: IdempotencyPlan["overall"] = "none";
  if (rubik.allExist && aurum.allExist) overall = "all_exist";
  else if (rubik.allExist || aurum.allExist || rubik.existing.length > 0 || aurum.existing.length > 0) overall = "partial";

  return { rubik, aurum, overall };
}

export function filterGeneratedFilesByExistingOutputs(
  files: Array<Record<string, unknown>>,
  existing: ExistingOutputResult,
): Array<Record<string, unknown>> {
  return files.filter((file) => {
    if (file.isPatchTarget && file.patchType === "vercel-json-rewrites") {
      const wanted = JSON.parse(String(file.content || "[]")) as Array<{ source: string; destination: string }>;
      const existingSources = new Set(existing.existing.filter((e) => e.startsWith("vercel.json:")).map((e) => e.replace("vercel.json:", "")));
      const missing = wanted.filter((r) => !existingSources.has(r.source) && !existingSources.has(r.source + "/"));
      if (missing.length === 0) return false;
      file.content = JSON.stringify(missing);
      return true;
    }
    if (file.isPatchTarget && file.patchType === "app-tsx-routes") {
      const wanted = JSON.parse(String(file.content || "{}")) as { imports?: string[]; routes?: string[] };
      const existingRoutes = new Set(
        existing.existing.filter((e) => e.startsWith("App.tsx:")).map((e) => e.replace("App.tsx:", "")),
      );
      const missingRoutes = (wanted.routes || []).filter((r) => !existingRoutes.has(r));
      if (missingRoutes.length === 0) return false;
      const usedComponents = new Set(
        missingRoutes.map((r) => r.match(/<([A-Za-z0-9_]+)\s/)?.[1]).filter(Boolean),
      );
      const missingImports = (wanted.imports || []).filter((imp) => {
        const m = imp.match(/\{ ([A-Za-z0-9_]+) \}/);
        return m && usedComponents.has(m[1]);
      });
      file.content = JSON.stringify({ ...wanted, imports: missingImports, routes: missingRoutes });
      return true;
    }
    return !existing.skippedFiles.includes(String(file.path));
  });
}
