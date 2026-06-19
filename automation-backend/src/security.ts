import {
  CLIENT_FACING_DOMAIN,
  INTERNAL_ENGINE_DOMAIN,
  MAX_ARRAY_LENGTH,
  MAX_PAGES_REVIEWED,
  MAX_STRING_LENGTH,
  REQUIRED_TARGET_ROUTES,
  isPlainObject,
} from "./schemas.ts";

const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DANGEROUS_SLUG_PARTS = ["..", "/", "\\", "%2f", "%5c"];
const SCRIPT_RE = /<\s*script/i;
const SECRET_RE = /(ghp_|github_pat_|sk-|private key|api_key|vercel_token|github_token)/i;

export function sanitizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateSlug(value) {
  const slug = String(value || "").trim();
  if (!slug) return "slug_empty";
  const lower = slug.toLowerCase();
  if (DANGEROUS_SLUG_PARTS.some((part) => lower.includes(part))) return "slug_path_traversal";
  if (!SAFE_SLUG_RE.test(slug)) return "slug_unsafe_characters";
  return null;
}

export function sanitizeBranchName(value) {
  const safe = sanitizeSlug(value);
  if (!safe) return "invalid-branch";
  return safe.slice(0, 80);
}

export function sanitizeFileName(value) {
  const safe = sanitizeSlug(value);
  return safe ? `${safe}.html` : "invalid.html";
}

export function sanitizeLog(value) {
  return String(value || "")
    .replace(/[\r\n\t]/g, " ")
    .replace(SECRET_RE, "[redacted]")
    .slice(0, 500);
}

export function containsScript(value) {
  if (typeof value === "string") return SCRIPT_RE.test(value);
  if (Array.isArray(value)) return value.some((item) => containsScript(item));
  if (isPlainObject(value)) return Object.values(value).some((item) => containsScript(item));
  return false;
}

export function containsGeneratedTrue(value) {
  if (Array.isArray(value)) return value.some((item) => containsGeneratedTrue(item));
  if (isPlainObject(value)) {
    return Object.entries(value).some(([key, item]) => {
      if (key === "generated" && item === true) return true;
      return containsGeneratedTrue(item);
    });
  }
  return false;
}

export function containsSecrets(value) {
  if (typeof value === "string") return SECRET_RE.test(value);
  if (Array.isArray(value)) return value.some((item) => containsSecrets(item));
  if (isPlainObject(value)) return Object.values(value).some((item) => containsSecrets(item));
  return false;
}

export function validateArrayLimits(payload, errors) {
  const visit = (value, path) => {
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      errors.push(`${path}: string_too_long`);
      return;
    }
    if (Array.isArray(value)) {
      const max = path.endsWith("pagesReviewed") ? MAX_PAGES_REVIEWED : MAX_ARRAY_LENGTH;
      if (value.length > max) errors.push(`${path}: array_too_long`);
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key));
    }
  };
  visit(payload, "");
}

export function validatePublicRoute(route, slug) {
  if (typeof route !== "string" || !route.trim()) return "route_missing";
  const raw = route.trim();
  if (SCRIPT_RE.test(raw)) return "route_contains_script";
  if (/^file:\/\//i.test(raw)) return "route_file_scheme_blocked";

  let url;
  try {
    url = new URL(raw);
  } catch {
    return "route_invalid_url";
  }

  const host = url.hostname.toLowerCase();
  const path = decodeURIComponent(url.pathname.toLowerCase());
  if (url.protocol !== "https:") return "route_must_be_https";
  if (host === "localhost" || host === "127.0.0.1") return "route_localhost_blocked";
  if (host !== CLIENT_FACING_DOMAIN) return "route_domain_not_allowed";
  if (path.includes("/gesture-lab/")) return "route_gesture_lab_blocked";
  if (!path.includes(`/${slug}`) && !path.includes(`/${slug}-`) && !path.includes(`/banners/${slug}`)) {
    return "route_does_not_match_lead_slug";
  }
  return null;
}

export function validateMediaUrl(url, slug) {
  if (url === null || url === undefined || url === "") return null;
  if (typeof url !== "string") return "media_url_must_be_string_or_null";
  const raw = url.trim();
  if (SCRIPT_RE.test(raw)) return "media_url_contains_script";
  if (/^file:\/\//i.test(raw)) return "media_url_file_scheme_blocked";
  if (raw.includes("/gesture-lab/")) return "media_url_gesture_lab_blocked";
  if (raw === "/VIDEO_AURUM_HEROWEB.mp4") return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "media_url_invalid";
  }

  const host = parsed.hostname.toLowerCase();
  const path = decodeURIComponent(parsed.pathname.toLowerCase());
  if (parsed.protocol !== "https:") return "media_url_must_be_https";
  if (host === "localhost" || host === "127.0.0.1") return "media_url_localhost_blocked";
  if (path.includes("/gesture-lab/")) return "media_url_gesture_lab_blocked";
  if (host === CLIENT_FACING_DOMAIN && slug && !path.includes(slug)) return "media_url_may_belong_to_other_lead";
  return null;
}

export function validateRules(rules, errors) {
  if (!isPlainObject(rules)) {
    errors.push("rules: required_object");
    return;
  }
  if (rules.clientFacingDomain !== CLIENT_FACING_DOMAIN) {
    errors.push("rules.clientFacingDomain: domain_not_allowed");
  }
  if (rules.internalEngine !== INTERNAL_ENGINE_DOMAIN) {
    errors.push("rules.internalEngine: domain_not_allowed");
  }
  if (rules.noGeneratedWithout200 !== true) {
    errors.push("rules.noGeneratedWithout200: must_be_true");
  }
}

export function validateTargetRoutes(targetRoutes, slug, errors) {
  if (!isPlainObject(targetRoutes)) {
    errors.push("targetRoutes: required_object");
    return;
  }
  for (const key of REQUIRED_TARGET_ROUTES) {
    const error = validatePublicRoute(targetRoutes[key], slug);
    if (error) errors.push(`targetRoutes.${key}: ${error}`);
  }
}
