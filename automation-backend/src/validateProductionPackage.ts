import {
  REQUIRED_LEAD_FIELDS,
  isPlainObject,
} from "./schemas.ts";
import {
  containsGeneratedTrue,
  containsScript,
  containsSecrets,
  sanitizeSlug,
  validateArrayLimits,
  validateRules,
  validateSlug,
  validateTargetRoutes,
} from "./security.ts";

const AUDIT_STATUSES = new Set(["complete", "partial", "missing"]);
const ASSET_STATUSES = new Set(["candidate", "pending_validation", "approved", "missing"]);

export function validateProductionPackage(payload) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return { passed: false, errors: ["payload: required_object"], warnings };
  }

  if (containsScript(payload)) errors.push("payload: script_tag_blocked");
  if (containsGeneratedTrue(payload)) errors.push("payload: generated_true_blocked");
  if (containsSecrets(payload)) warnings.push("payload: secret_like_string_detected");
  validateArrayLimits(payload, errors);

  const lead = payload.lead;
  if (!isPlainObject(lead)) {
    errors.push("lead: required_object");
  } else {
    for (const field of REQUIRED_LEAD_FIELDS) {
      if (typeof lead[field] !== "string") errors.push(`lead.${field}: required_string`);
    }
    const slugError = validateSlug(lead.slug);
    if (slugError) errors.push(`lead.slug: ${slugError}`);
    const sanitized = sanitizeSlug(lead.slug);
    if (lead.slug && sanitized !== lead.slug) warnings.push(`lead.slug: sanitized_would_be_${sanitized}`);
  }

  const audit = payload.audit;
  if (!isPlainObject(audit)) {
    errors.push("audit: required_object");
  } else {
    if (!AUDIT_STATUSES.has(audit.status)) errors.push("audit.status: invalid_status");
    if (!Array.isArray(audit.pagesReviewed)) errors.push("audit.pagesReviewed: required_array");
    if (!isPlainObject(audit.signals)) errors.push("audit.signals: required_object");
    if (!Array.isArray(audit.opportunities)) errors.push("audit.opportunities: required_array");
    if (!Array.isArray(audit.weaknesses)) errors.push("audit.weaknesses: required_array");
  }

  const assets = payload.assets;
  if (!isPlainObject(assets)) {
    errors.push("assets: required_object");
  } else {
    if (!(typeof assets.logo === "string" || assets.logo === null)) errors.push("assets.logo: required_string_or_null");
    if (!(typeof assets.favicon === "string" || assets.favicon === null)) errors.push("assets.favicon: required_string_or_null");
    if (!Array.isArray(assets.images)) errors.push("assets.images: required_array");
    if (!(typeof assets.video === "string" || assets.video === null)) errors.push("assets.video: required_string_or_null");
    if (!ASSET_STATUSES.has(assets.status)) errors.push("assets.status: invalid_status");
  }

  if (!isPlainObject(payload.hooks)) {
    errors.push("hooks: required_object");
  } else {
    for (const key of ["visualExperience", "landingPage", "fullWebDemo", "bannerPack"]) {
      if (!isPlainObject(payload.hooks[key])) errors.push(`hooks.${key}: required_object`);
    }
  }

  const slug = isPlainObject(lead) ? String(lead.slug || "") : "";
  validateTargetRoutes(payload.targetRoutes, slug, errors);
  validateRules(payload.rules, errors);

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
