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
  validateMediaUrl,
  validateTargetRoutes,
} from "./security.ts";

const AUDIT_STATUSES = new Set(["complete", "partial", "missing"]);
const ASSET_STATUSES = new Set(["candidate", "pending_validation", "approved", "missing"]);
const LOGO_SOURCES = new Set(["detected", "manual", "placeholder"]);
const FAVICON_STATUSES = new Set(["candidate", "missing"]);
const PROPERTY_IMAGE_SOURCES = new Set(["website", "manual", "stock", "placeholder"]);
const VIDEO_SOURCES = new Set(["website", "manual", "aurum_default", "placeholder"]);
const IMAGE_USES = new Set(["hero", "gallery", "banner", "background"]);
const VIDEO_USES = new Set(["hero", "background", "social", "none"]);

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
    if (isPlainObject(payload.hooks.fullWebDemo) && payload.hooks.fullWebDemo.heroVideoMotion !== true) {
      errors.push("hooks.fullWebDemo.heroVideoMotion: required_true");
    }
  }

  const slug = isPlainObject(lead) ? String(lead.slug || "") : "";
  validateMediaAssets(payload.mediaAssets, payload.assets, slug, errors, warnings);
  validateTargetRoutes(payload.targetRoutes, slug, errors);
  validateRules(payload.rules, errors);

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

function validateMediaAssets(mediaAssets, legacyAssets, slug, errors, warnings) {
  if (!isPlainObject(mediaAssets)) {
    warnings.push("mediaAssets: missing_using_legacy_assets_if_available");
    validateLegacyAssetUrls(legacyAssets, slug, errors);
    return;
  }

  validateLogo(mediaAssets.logo, slug, errors, warnings);
  validateFavicon(mediaAssets.favicon, slug, errors);
  validateHeroImage(mediaAssets.heroImage, slug, errors, warnings);

  if (!Array.isArray(mediaAssets.propertyImages)) {
    errors.push("mediaAssets.propertyImages: required_array");
  } else {
    mediaAssets.propertyImages.forEach((item, index) => validatePropertyImage(item, index, slug, errors, warnings));
    if (mediaAssets.propertyImages.length === 0) warnings.push("mediaAssets.propertyImages: missing");
  }

  if (!Array.isArray(mediaAssets.videos)) {
    errors.push("mediaAssets.videos: required_array");
  } else {
    mediaAssets.videos.forEach((item, index) => validateVideo(item, index, slug, errors, warnings));
    const hasOwnVideo = mediaAssets.videos.some((item) => isPlainObject(item) && item.source !== "aurum_default" && item.source !== "placeholder");
    if (!hasOwnVideo) warnings.push("mediaAssets.videos: missing_own_video");
  }

  if (!Array.isArray(mediaAssets.brandColors)) errors.push("mediaAssets.brandColors: required_array");
  if (!Array.isArray(mediaAssets.notes)) errors.push("mediaAssets.notes: required_array");
  if (!hasApprovedMedia(mediaAssets)) warnings.push("mediaAssets: no_approved_assets");
}

function validateLogo(logo, slug, errors, warnings) {
  if (!isPlainObject(logo)) {
    errors.push("mediaAssets.logo: required_object");
    return;
  }
  if (!(typeof logo.url === "string" || logo.url === null)) errors.push("mediaAssets.logo.url: required_string_or_null");
  if (!LOGO_SOURCES.has(logo.source)) errors.push("mediaAssets.logo.source: invalid_source");
  if (!ASSET_STATUSES.has(logo.status)) errors.push("mediaAssets.logo.status: invalid_status");
  if (!logo.url || logo.status === "missing") warnings.push("mediaAssets.logo: missing");
  if (logo.source === "detected" && logo.status === "approved") warnings.push("mediaAssets.logo: detected_source_should_not_be_auto_approved");
  addMediaUrlError("mediaAssets.logo.url", logo.url, slug, errors);
  warnCandidate("mediaAssets.logo", logo.status, warnings);
}

function validateFavicon(favicon, slug, errors) {
  if (!isPlainObject(favicon)) {
    errors.push("mediaAssets.favicon: required_object");
    return;
  }
  if (!(typeof favicon.url === "string" || favicon.url === null)) errors.push("mediaAssets.favicon.url: required_string_or_null");
  if (!FAVICON_STATUSES.has(favicon.status)) errors.push("mediaAssets.favicon.status: invalid_status");
  addMediaUrlError("mediaAssets.favicon.url", favicon.url, slug, errors);
}

function validateHeroImage(heroImage, slug, errors, warnings) {
  if (!isPlainObject(heroImage)) {
    errors.push("mediaAssets.heroImage: required_object");
    return;
  }
  if (!(typeof heroImage.url === "string" || heroImage.url === null)) errors.push("mediaAssets.heroImage.url: required_string_or_null");
  if (!ASSET_STATUSES.has(heroImage.status)) errors.push("mediaAssets.heroImage.status: invalid_status");
  if (!heroImage.url || heroImage.status === "missing") warnings.push("mediaAssets.heroImage: missing");
  addMediaUrlError("mediaAssets.heroImage.url", heroImage.url, slug, errors);
  warnCandidate("mediaAssets.heroImage", heroImage.status, warnings);
}

function validatePropertyImage(item, index, slug, errors, warnings) {
  const path = `mediaAssets.propertyImages[${index}]`;
  if (!isPlainObject(item)) {
    errors.push(`${path}: required_object`);
    return;
  }
  if (typeof item.url !== "string") errors.push(`${path}.url: required_string`);
  if (!PROPERTY_IMAGE_SOURCES.has(item.source)) errors.push(`${path}.source: invalid_source`);
  if (!["candidate", "pending_validation", "approved"].includes(item.status)) errors.push(`${path}.status: invalid_status`);
  if (!IMAGE_USES.has(item.recommendedUse)) errors.push(`${path}.recommendedUse: invalid_use`);
  if (item.source === "website" && item.status === "approved") warnings.push(`${path}: scraped_public_asset_should_not_be_auto_approved`);
  if (item.source === "stock") warnings.push(`${path}: rights_risk_stock_asset`);
  if (item.source === "placeholder") warnings.push(`${path}: placeholder_asset_risk`);
  addMediaUrlError(`${path}.url`, item.url, slug, errors);
  warnCandidate(path, item.status, warnings);
}

function validateVideo(item, index, slug, errors, warnings) {
  const path = `mediaAssets.videos[${index}]`;
  if (!isPlainObject(item)) {
    errors.push(`${path}: required_object`);
    return;
  }
  if (typeof item.url !== "string") errors.push(`${path}.url: required_string`);
  if (!VIDEO_SOURCES.has(item.source)) errors.push(`${path}.source: invalid_source`);
  if (!["candidate", "pending_validation", "approved"].includes(item.status)) errors.push(`${path}.status: invalid_status`);
  if (!VIDEO_USES.has(item.recommendedUse)) errors.push(`${path}.recommendedUse: invalid_use`);
  if (item.url === "/VIDEO_AURUM_HEROWEB.mp4" || item.source === "aurum_default") {
    warnings.push(`${path}: using_VIDEO_AURUM_HEROWEB_fallback`);
  }
  if (item.source === "website" && item.status === "approved") warnings.push(`${path}: scraped_public_asset_should_not_be_auto_approved`);
  if (item.source === "placeholder") warnings.push(`${path}: placeholder_asset_risk`);
  addMediaUrlError(`${path}.url`, item.url, slug, errors);
  warnCandidate(path, item.status, warnings);
}

function validateLegacyAssetUrls(assets, slug, errors) {
  if (!isPlainObject(assets)) return;
  addMediaUrlError("assets.logo", assets.logo, slug, errors);
  addMediaUrlError("assets.favicon", assets.favicon, slug, errors);
  addMediaUrlError("assets.video", assets.video, slug, errors);
  if (Array.isArray(assets.images)) {
    assets.images.forEach((url, index) => addMediaUrlError(`assets.images[${index}]`, url, slug, errors));
  }
}

function addMediaUrlError(path, url, slug, errors) {
  const error = validateMediaUrl(url, slug);
  if (error) errors.push(`${path}: ${error}`);
}

function warnCandidate(path, status, warnings) {
  if (status === "candidate" || status === "pending_validation") warnings.push(`${path}: requires_media_validation`);
}

function hasApprovedMedia(mediaAssets) {
  const candidates = [
    mediaAssets.logo,
    mediaAssets.heroImage,
    ...(Array.isArray(mediaAssets.propertyImages) ? mediaAssets.propertyImages : []),
    ...(Array.isArray(mediaAssets.videos) ? mediaAssets.videos : []),
  ];
  return candidates.some((item) => isPlainObject(item) && item.status === "approved");
}
