// Fase 9 — Pieza A.2: Hook-specific path policy for G1-G4 auto-generation.
//
// This module is a STRICTER layer on top of pathSecurity.ts. It enforces:
// 1. Each hook type can only write to its designated repo (G1/G4→Rubik, G2/G3→AURUM)
// 2. Each hook type can only create its specific files (G2 can't create WebCompleta files)
// 3. Every generated file must contain the lead's slug (defense against cross-lead contamination)
// 4. No duplicate file paths in the same generation (prevents silent overwrites)
//
// pathSecurity.ts allows ANY valid AURUM component file for ANY lead (by design, for
// the reconciliation flow in createProductionPullRequests). This module closes that
// gap for the auto-generation pipeline where we need per-hook isolation.
//
// IMPORTANT: this module does NOT replace pathSecurity.ts — both must pass.
// The endpoint (Pieza A.4) calls hookPathPolicy FIRST (stricter), then
// pathSecurity.assertSafeFiles (broader) as defense in depth.
 
import {
  validateRepoPath,
  componentBaseFromSlug,
  AURUM_REPO,
  RUBIK_REPO,
} from "./pathSecurity.ts";
import { sanitizeSlug } from "./security.ts";
 
// ── Hook → Repo mapping (confirmed in Fase 0, cross-checked with pathSecurity.ts) ──
 
export const HOOK_REPO_MAP: Record<string, string> = {
  G1: RUBIK_REPO,  // Visual Experience → gesture-lab/
  G2: AURUM_REPO,  // Landing Comercial → src/{Component}Landing.tsx
  G3: AURUM_REPO,  // Web Completa → src/{Component}WebCompleta.tsx
  G4: RUBIK_REPO,  // Pack Banners → dynamic-motion-banner/{slug}/
};
 
// ── Slug derivations (same logic as pathSecurity.ts, not duplicated — reused) ──
// componentBaseFromSlug is imported directly from pathSecurity.ts.
// camelBase must match the EXACT logic in validateRepoPath (lines 48-50 of pathSecurity.ts):
//   safeSlug.split("-").filter(Boolean).map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join("")
 
function camelBaseFromSlug(slug: string): string {
  return sanitizeSlug(slug)
    .split("-")
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}
 
// ── Per-hook allowed file paths ─────────────────────────────────────────
// These paths match EXACTLY the Sets in pathSecurity.ts validateRepoPath
// (rubikAllowed / aurumAllowed), but filtered to only the files relevant
// to each specific hook type. No manifests, no route patches — those are
// handled by the existing pipeline (buildPrAutomationPlan).
 
function buildAllowedPaths(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string
): Set<string> {
  const safeSlug = sanitizeSlug(slug);
  const componentBase = componentBaseFromSlug(safeSlug);
  const camelBase = camelBaseFromSlug(safeSlug);
 
  switch (hookType) {
    case "G1":
      // Visual Experience: single self-contained HTML file in Rubik
      return new Set([
        `gesture-lab/${safeSlug}-v1.html`,
      ]);
 
    case "G2":
      // Landing: React component + shared data file in AURUM
      return new Set([
        `src/${componentBase}Landing.tsx`,
        `src/data/clientDemos/${camelBase}.ts`,
      ]);
 
    case "G3":
      // Web Completa: React component + shared data file in AURUM
      return new Set([
        `src/${componentBase}WebCompleta.tsx`,
        `src/data/clientDemos/${camelBase}.ts`,
      ]);
 
    case "G4":
      // Banners: multiple files in Rubik, all under dynamic-motion-banner/{slug}/
      return new Set([
        `dynamic-motion-banner/${safeSlug}/config.js`,
        `dynamic-motion-banner/${safeSlug}/banner-engine.js`,
        `dynamic-motion-banner/${safeSlug}/banner-pack/index.html`,
        `dynamic-motion-banner/${safeSlug}/banner-vertical.html`,
        `dynamic-motion-banner/${safeSlug}/banner-horizontal.html`,
        `dynamic-motion-banner/${safeSlug}/assets/logo.svg`,
      ]);
 
    default:
      return new Set();
  }
}
 
// ── Public API ──────────────────────────────────────────────────────────
 
/**
 * Returns the list of file paths that Claude SHOULD generate for a given
 * hook type and lead slug. Used by promptBuilder.ts to include the exact
 * paths in the prompt, so Claude knows what to create.
 */
export function getExpectedFilePaths(
  hookType: "G1" | "G2" | "G3" | "G4",
  slug: string
): string[] {
  return [...buildAllowedPaths(hookType, slug)];
}
 
/**
 * Returns the target repo for a given hook type.
 */
export function getRepoForHook(hookType: "G1" | "G2" | "G3" | "G4"): string {
  const repo = HOOK_REPO_MAP[hookType];
  if (!repo) throw new Error(`Hook type desconocido: ${hookType}`);
  return repo;
}
 
/**
 * Annotates Claude's output files with the correct repo for this hook type.
 * Needed because Claude's output has { path, content } but the PR pipeline
 * needs { repo, path, content }.
 */
export function annotateFilesWithRepo(
  hookType: "G1" | "G2" | "G3" | "G4",
  files: Array<{ path: string; content: string }>
): Array<{ repo: string; path: string; content: string }> {
  const repo = getRepoForHook(hookType);
  return files.map((f) => ({ repo, path: f.path, content: f.content }));
}
 
/**
 * Validates that Claude's generated files are safe and appropriate for the
 * specific hook type. Returns an array of error strings (empty = all valid).
 *
 * Four layers of validation, in order:
 * 1. Duplicate path detection (prevents silent overwrites)
 * 2. Hook-specific allowlist (is this file type valid for this hook?)
 * 3. Slug containment (does the path contain this lead's slug?)
 * 4. pathSecurity.ts validation (global safety rules)
 *
 * @param hookType - Which hook is being generated
 * @param slug - The lead's slug (e.g., "torrevieja-sur")
 * @param files - Claude's output from anthropicClient.ts
 * @returns Array of error strings. Empty array = all files are valid.
 */
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
 
  // ── Layer 1: duplicate path detection ──
  // If Claude generates two files with the same path, the second would
  // silently overwrite the first in the PR. Catch this before it happens.
  const seenPaths = new Set<string>();
  for (const file of files) {
    if (seenPaths.has(file.path)) {
      errors.push(
        `${hookType}:${file.path}:duplicate_path. ` +
        `Claude generó dos archivos con la misma ruta — solo el segundo se guardaría.`
      );
    }
    seenPaths.add(file.path);
  }
  // If there are duplicates, still continue checking the rest — we want ALL errors at once
  // so the operator doesn't have to fix issues one by one.
 
  for (const file of files) {
    const filePath = file.path;
 
    // ── Layer 2: hook-specific allowlist ──
    if (!allowedPaths.has(filePath)) {
      errors.push(
        `${hookType}:${filePath}:path_not_allowed_for_hook_type. ` +
        `Rutas válidas para ${hookType}: ${[...allowedPaths].join(", ")}`
      );
      continue; // skip further checks for this file, it's already invalid
    }
 
    // ── Layer 3: slug containment (defense in depth) ──
    // The path must contain at least one form of the slug:
    // - raw slug ("torrevieja-sur") — for Rubik paths
    // - componentBase ("TorreviejaSur") — for AURUM component paths
    // - camelBase ("torreviejaSur") — for AURUM data file paths
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
 
    // ── Layer 4: pathSecurity.ts global validation ──
    const pathSecError = validateRepoPath(repo, filePath, safeSlug);
    if (pathSecError) {
      errors.push(`${hookType}:${filePath}:${pathSecError}`);
    }
  }
 
  return errors;
}
