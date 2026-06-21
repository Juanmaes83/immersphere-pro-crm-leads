export const SERVICE_NAME = "immersphere-production-orchestrator";
export const SERVICE_VERSION = "0.4.0";

export function getMode(): "dry-run" | "production" {
  return String(process.env.GITHUB_PR_AUTOMATION_ENABLED || "").toLowerCase() === "true"
    ? "production"
    : "dry-run";
}

/** @deprecated Use getMode() to reflect the current runtime flag. */
export const MODE = "dry-run";

export const CLIENT_FACING_DOMAIN = "aurum-properties-boutique.vercel.app";
export const INTERNAL_ENGINE_DOMAIN = "rubik-sota-director-de-orquesta.vercel.app";

export const REQUIRED_LEAD_FIELDS = ["id", "name", "slug", "sector", "zone", "website", "email", "phone"];
export const REQUIRED_TARGET_ROUTES = [
  "visualExperience",
  "landing",
  "webCompleta",
  "bannerPack",
  "bannerVertical",
  "bannerHorizontal",
];

export const MAX_BODY_BYTES = 100 * 1024;
export const MAX_STRING_LENGTH = 2048;
export const MAX_ARRAY_LENGTH = 30;
export const MAX_PAGES_REVIEWED = 20;

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
