// Fase 9 — Pieza A.2: Hook-specific path policy for G1-G4 auto-generation.
//
// v3 — Adds 2-step generation support (getStepCount, getExpectedFilePathsForStep).
// G1: 1 step (simplified HTML). G2/G3: 2 steps (data → component). G4: 2 steps (config → HTMLs).
//
// This module is a STRICTER layer on top of pathSecurity.ts. It enforces:
// 1. Each hook type can only write to its designated repo (G1/G4→Rubik, G2/G3→AURUM)
// 2. Each hook type can only create its specific files (G2 can't create WebCompleta files)
// 3. Every generated file must contain the lead's slug (defense against cross-lead contamination)
 
import {
  validateRepoPath,
  componentBaseFromSlug,
  AURUM_REPO,
  RUBIK_REPO,
} from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
 
// ── Hook → Repo mapping ──
 
export const HOOK_REPO_MAP: Record<string, string> = {
  G1: RUBIK_REPO,
  G2: AURUM_REPO,
  G3: AURUM_REPO,
  G4: RUBIK_REPO,
};
 
// ── Slug derivations ──
 
function camelBaseFromSlug(slug: string): string {
  return sanitizeSlug(slug)
    .split("-")
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}
 
// Re-export for use by promptBuilder
export { camelBaseFromSlug };
 
// ── Per-hook allowed file paths (all steps combined) ──
 
function buildAllowedPaths(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string
): Set<string> {
  const safeSlug = sanitizeSlug(slug);
  const componentBase = componentBaseFromSlug(safeSlug);
  const camelBase = camelBaseFromSlug(safeSlug);
 
  switch (hookType) {
    case "G1":
      return new Set([`gesture-lab/${safeSlug}-v1.html`]);
    case "G2":
      return new Set([
        `src/data/clientDemos/${camelBase}.ts`,
        `src/${componentBase}Landing.tsx`,
      ]);
    case "G3":
      return new Set([
        `src/data/clientDemos/${camelBase}.ts`,
        `src/${componentBase}WebCompleta.tsx`,
      ]);
    case "G4":
      return new Set([
        `dynamic-motion-banner/${safeSlug}/config.js`,
        `dynamic-motion-banner/${safeSlug}/assets/logo.svg`,
        `dynamic-motion-banner/${safeSlug}/banner-engine.js`,
        `dynamic-motion-banner/${safeSlug}/banner-pack/index.html`,
        `dynamic-motion-banner/${safeSlug}/banner-vertical.html`,
        `dynamic-motion-banner/${safeSlug}/banner-horizontal.html`,
      ]);
    default:
      return new Set();
  }
}
 
// ── 2-step generation support ──
 
/**
 * Returns how many Claude API calls this hook type needs.
 * G1: 1 step (single compact HTML file).
 * G2/G3: 2 steps (step 1 = data file, step 2 = React component).
 * G4: 2 steps (step 1 = config.js + logo.svg, step 2 = engine + 3 HTMLs).
 */
export function getStepCount(hookType: "G1" | "G2" | "G3" | "G4"): number {
  return hookType === "G1" ? 1 : 2;
}
 
/**
 * Returns the expected file paths for a specific step of generation.
 * Step numbers are 1-based. For G1, only step 1 exists.
 */
export function getExpectedFilePathsForStep(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string,
  step: 1 | 2
): string[] {
  const safeSlug = sanitizeSlug(slug);
  const componentBase = componentBaseFromSlug(safeSlug);
  const camelBase = camelBaseFromSlug(safeSlug);
 
  if (hookType === "G1") {
    return step === 1 ? [`gesture-lab/${safeSlug}-v1.html`] : [];
  }
 
  if (hookType === "G2") {
    return step === 1
      ? [`src/data/clientDemos/${camelBase}.ts`]
      : [`src/${componentBase}Landing.tsx`];
  }
 
  if (hookType === "G3") {
    return step === 1
      ? [`src/data/clientDemos/${camelBase}.ts`]
      : [`src/${componentBase}WebCompleta.tsx`];
  }
 
  if (hookType === "G4") {
    return step === 1
      ? [
          `dynamic-motion-banner/${safeSlug}/config.js`,
          `dynamic-motion-banner/${safeSlug}/assets/logo.svg`,
        ]
      : [
          `dynamic-motion-banner/${safeSlug}/banner-engine.js`,
          `dynamic-motion-banner/${safeSlug}/banner-pack/index.html`,
          `dynamic-motion-banner/${safeSlug}/banner-vertical.html`,
          `dynamic-motion-banner/${safeSlug}/banner-horizontal.html`,
        ];
  }
 
  return [];
}
 
// ── Public API ──
 
export function getExpectedFilePaths(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string
): string[] {
  return [...buildAllowedPaths(hookType, slug)];
}
 
export function getRepoForHook(hookType: "G1" | "G2" | "G3" | "G4"): string {
  const repo = HOOK_REPO_MAP[hookType];
  if (!repo) throw new Error(`Hook type desconocido: ${hookType}`);
  return repo;
}
 
export function annotateFilesWithRepo(
  hookType: "G1" | "G2" | "G3" | "G4",
  files: Array<{ path: string; content: string }>
): Array<{ repo: string; path: string; content: string }> {
  const repo = getRepoForHook(hookType);
  return files.map((f) => ({ repo, path: f.path, content: f.content }));
}
 
export function validateHookFiles(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string,
  files: Array<{ path: string; content: string }>
): string[] {
  const errors: string[] = [];
  const safeSlug = sanitizeSlug(slug);
  const componentBase = componentBaseFromSlug(safeSlug);
  const camelBase = camelBaseFromSlug(safeSlug);
  const repo = getRepoForHook(hookType);
  const allowedPaths = buildAllowedPaths(hookType, safeSlug);
 
  if (files.length === 0) {
    errors.push("no_files_generated");
    return errors;
  }
 
  const seenPaths = new Set<string>();
  for (const file of files) {
    const filePath = file.path;
 
    // Duplicate detection
    if (seenPaths.has(filePath)) {
      errors.push(`${hookType}:${filePath}:duplicate_file_path`);
      continue;
    }
    seenPaths.add(filePath);
 
    // Layer 1: hook-specific allowlist
    if (!allowedPaths.has(filePath)) {
      errors.push(
        `${hookType}:${filePath}:path_not_allowed_for_hook_type. ` +
        `Rutas validas para ${hookType}: ${[...allowedPaths].join(", ")}`
      );
      continue;
    }
 
    // Layer 2: slug containment
    const containsSlug =
      filePath.includes(safeSlug) ||
      filePath.includes(componentBase) ||
      filePath.includes(camelBase);
    if (!containsSlug) {
      errors.push(
        `${hookType}:${filePath}:path_does_not_contain_lead_slug. ` +
        `Expected one of: "${safeSlug}", "${componentBase}", "${camelBase}"`
      );
      continue;
    }
 
    // Layer 3: pathSecurity.ts global validation
    const pathSecError = validateRepoPath(repo, filePath, safeSlug);
    if (pathSecError) {
      errors.push(`${hookType}:${filePath}:${pathSecError}`);
    }
 
    // Layer 4: empty content check
    if (!file.content || file.content.trim().length === 0) {
      errors.push(`${hookType}:${filePath}:empty_file_content`);
    }
  }
 
  return errors;
}
 
