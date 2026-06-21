import { sanitizeSlug } from "./security.ts";

export const RUBIK_REPO = "Juanmaes83/Rubik-Sota-Director-de-Orquesta";
export const AURUM_REPO = "Juanmaes83/AURUM_PROPERTIES_BOUTIQUE";
export const CRM_REPO = "Juanmaes83/immersphere-pro-crm-leads";

const ALWAYS_FORBIDDEN_EXACT = new Set([".env", "crm.html", "index.html", "package-lock.json"]);
const ALWAYS_FORBIDDEN_SEGMENTS = new Set([".claude", ".vercel", "node_modules"]);

// App.tsx and vercel.json are allowed as modification targets only (not creations from scratch).
// They require getFileContent() + patch strategy in the writer, not a full overwrite.
export const AURUM_APP_TSX = "src/App.tsx";
export const RUBIK_VERCEL_JSON = "vercel.json";

export function componentBaseFromSlug(slug) {
  return sanitizeSlug(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function validateProductionBranch(branch, slug) {
  const safeSlug = sanitizeSlug(slug);
  if (typeof branch !== "string") return "branch_must_be_string";
  if (!branch.startsWith("production/")) return "branch_must_start_with_production";
  if (branch.includes("..") || branch.includes("\\") || branch.includes("%2f") || branch.includes("%5c")) {
    return "branch_contains_unsafe_path";
  }
  if (!branch.includes(safeSlug)) return "branch_must_include_lead_slug";
  return null;
}

export function validateRepoPath(repo, filePath, slug) {
  const safeSlug = sanitizeSlug(slug);
  const componentBase = componentBaseFromSlug(safeSlug);
  if (!safeSlug) return "slug_required";
  if (typeof filePath !== "string" || !filePath.trim()) return "path_required";
  if (filePath.startsWith("/") || /^[a-zA-Z]:/.test(filePath)) return "absolute_path_forbidden";
  if (filePath.includes("..") || filePath.includes("\\") || filePath.includes("%2f") || filePath.includes("%5c")) {
    return "path_traversal_forbidden";
  }
  const pathParts = filePath.split("/");
  if (ALWAYS_FORBIDDEN_EXACT.has(filePath) || pathParts.some((part) => ALWAYS_FORBIDDEN_SEGMENTS.has(part))) {
    return "forbidden_path";
  }
  if (repo === CRM_REPO) return "crm_write_forbidden_in_v0_2";

  const camelBase = safeSlug.split("-").filter(Boolean).map((p, i) =>
    i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)
  ).join("");

  const rubikAllowed = new Set([
    // Original manifest paths (kept for backward compat)
    `dynamic-motion-banner/${safeSlug}/README.md`,
    `dynamic-motion-banner/${safeSlug}/config.json`,
    `dynamic-motion-banner/${safeSlug}/index.html`,
    `dynamic-motion-banner/${safeSlug}/banner-vertical.html`,
    `dynamic-motion-banner/${safeSlug}/banner-horizontal.html`,
    `dynamic-motion-banner/${safeSlug}/assets-manifest.json`,
    `production-manifests/${safeSlug}.json`,
    // Real functional paths (FASE B generators)
    `gesture-lab/${safeSlug}-v1.html`,
    `dynamic-motion-banner/${safeSlug}/config.js`,
    `dynamic-motion-banner/${safeSlug}/banner-engine.js`,
    `dynamic-motion-banner/${safeSlug}/banner-pack/index.html`,
    `dynamic-motion-banner/${safeSlug}/assets/logo.svg`,
    // vercel.json is a patch target — validated separately via RUBIK_VERCEL_JSON
    RUBIK_VERCEL_JSON,
  ]);

  const aurumAllowed = new Set([
    // Original generated paths (kept for backward compat)
    `production-manifests/${safeSlug}.json`,
    `production-manifests/${safeSlug}-premium-specs.json`,
    `src/generated/${componentBase}ProductionPlan.ts`,
    `src/generated/${componentBase}ProposalPackage.ts`,
    `src/generated/${componentBase}FourHookSpecs.ts`,
    // Real functional component paths (FASE B generators)
    `src/data/clientDemos/${camelBase}.ts`,
    `src/${componentBase}Landing.tsx`,
    `src/${componentBase}WebCompleta.tsx`,
    `src/${componentBase}VisualExperience.tsx`,
    `src/${componentBase}BannerPack.tsx`,
    `src/${componentBase}BannerVertical.tsx`,
    `src/${componentBase}BannerHorizontal.tsx`,
    // App.tsx is a patch target — validated separately via AURUM_APP_TSX
    AURUM_APP_TSX,
  ]);

  if (repo === RUBIK_REPO) return rubikAllowed.has(filePath) ? null : "rubik_path_not_allowed";
  if (repo === AURUM_REPO) {
    if (aurumAllowed.has(filePath)) return null;
    const aurumComponentSuffixes = ["Landing.tsx", "WebCompleta.tsx", "VisualExperience.tsx", "BannerPack.tsx", "BannerVertical.tsx", "BannerHorizontal.tsx"];
    if (
      filePath.startsWith("src/") &&
      aurumComponentSuffixes.some((suffix) => filePath.endsWith(suffix)) &&
      !filePath.includes("..") &&
      !filePath.split("/").some((part) => ALWAYS_FORBIDDEN_SEGMENTS.has(part))
    ) {
      return null;
    }
    return "aurum_path_not_allowed";
  }
  return "repo_not_allowed";
}

export function assertSafeFiles(files, slug) {
  const errors = [];
  for (const file of files) {
    const error = validateRepoPath(file.repo, file.path, slug);
    if (error) errors.push(`${file.repo}:${file.path}:${error}`);
  }
  return errors;
}
