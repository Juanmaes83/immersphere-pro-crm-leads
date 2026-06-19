import { sanitizeBranchName, sanitizeFileName, sanitizeSlug } from "./security.ts";

const PLANNED_TEMPLATES = {
  visualExperience: "dynamic-motion-banner",
  landing: "aurum-landing",
  webCompleta: "aurum-web-completa-blueprint",
  bannerPack: "dynamic-motion-banner-pack",
};

export function buildDryRunPlan(payload, validation) {
  const leadSlug = sanitizeSlug(payload?.lead?.slug);
  const timestamp = Date.now();
  const jobId = `prod_${timestamp}_${leadSlug || "invalid"}`;
  if (!validation.passed) {
    return {
      ok: false,
      mode: "dry-run",
      validation,
      blocked: true,
    };
  }

  const branchSlug = sanitizeBranchName(leadSlug);
  const plannedRoutes = {
    visualExperience: payload.targetRoutes.visualExperience,
    landing: payload.targetRoutes.landing,
    webCompleta: payload.targetRoutes.webCompleta,
    bannerPack: payload.targetRoutes.bannerPack,
    bannerVertical: payload.targetRoutes.bannerVertical,
    bannerHorizontal: payload.targetRoutes.bannerHorizontal,
  };
  const componentName = toComponentName(leadSlug);
  const mediaPlan = buildMediaPlan(payload, validation.warnings);
  const visualRisks = buildVisualRisks(mediaPlan);

  return {
    ok: true,
    mode: "dry-run",
    jobId,
    leadSlug,
    validation,
    plannedRepos: {
      rubik: {
        needed: true,
        plannedBranch: `production/${branchSlug}-visual-assets`,
        purpose: "Experiencia Visual y Banners",
      },
      aurum: {
        needed: true,
        plannedBranch: `production/${branchSlug}-public-pages`,
        purpose: "Landing, Web Completa y wrappers publicos",
      },
      crm: {
        needed: false,
        reason: "CRM update only after URLs are real and validated",
      },
    },
    plannedFiles: [
      {
        repo: "Rubik",
        path: `dynamic-motion-banner/${branchSlug}/index.html`,
        action: "plan_only",
        purpose: "Experiencia Visual / Banderola",
        template: PLANNED_TEMPLATES.visualExperience,
        requiresAssets: ["logo", "heroImage", "brandColors"],
        risk: "requires media validation",
      },
      {
        repo: "Rubik",
        path: `dynamic-motion-banner/${branchSlug}/config.js`,
        action: "plan_only",
        purpose: "Config por cliente para banderola dinamica",
        template: PLANNED_TEMPLATES.visualExperience,
        requiresAssets: ["logo", "heroImage"],
        risk: "must keep Rubik as internal engine",
      },
      {
        repo: "Rubik",
        path: `dynamic-motion-banner/${branchSlug}/banner-vertical.html`,
        action: "plan_only",
        purpose: "Banner vertical",
        template: PLANNED_TEMPLATES.bannerPack,
        requiresAssets: ["logo", "heroImage", "claim", "cta"],
        risk: "iframe wrappers must point to direct html when relative imports exist",
      },
      {
        repo: "Rubik",
        path: `dynamic-motion-banner/${branchSlug}/banner-horizontal.html`,
        action: "plan_only",
        purpose: "Banner horizontal",
        template: PLANNED_TEMPLATES.bannerPack,
        requiresAssets: ["logo", "heroImage", "claim", "cta"],
        risk: "iframe wrappers must point to direct html when relative imports exist",
      },
      {
        repo: "Rubik",
        path: `dynamic-motion-banner/${branchSlug}/banner-engine.js`,
        action: "plan_only",
        purpose: "Dependencia equivalente del motor de banners",
        template: PLANNED_TEMPLATES.bannerPack,
        requiresAssets: ["config"],
        risk: "module paths must survive embed mode",
      },
      {
        repo: "AURUM",
        path: `src/${componentName}Landing.tsx`,
        action: "plan_only",
        purpose: "Landing Comercial",
        template: PLANNED_TEMPLATES.landing,
        requiresAssets: ["heroImage", "copy", "cta"],
        risk: "landing is not full web demo",
      },
      {
        repo: "AURUM",
        path: `src/${componentName}WebCompleta.tsx`,
        action: "plan_only",
        purpose: "Web Completa",
        template: PLANNED_TEMPLATES.webCompleta,
        requiresAssets: ["heroVideo", "heroImage", "VisualExperienceBannerSection"],
        risk: "must preserve hero video/motion",
      },
      {
        repo: "AURUM",
        path: `src/${componentName}VisualExperience.tsx`,
        action: "plan_only",
        purpose: "Wrapper publico limpio para Experiencia Visual",
        template: "aurum-visual-experience-wrapper",
        requiresAssets: ["rubikEmbedUrl"],
        risk: "no /gesture-lab/ client-facing URL",
      },
      {
        repo: "AURUM",
        path: `src/${componentName}BannerPack.tsx`,
        action: "plan_only",
        purpose: "Wrapper publico pack banners",
        template: PLANNED_TEMPLATES.bannerPack,
        requiresAssets: ["bannerVerticalHtml", "bannerHorizontalHtml"],
        risk: "direct html iframe required if modules use relative imports",
      },
    ],
    plannedTemplates: PLANNED_TEMPLATES,
    plannedRoutes,
    mediaPlan,
    visualRisks,
    qaChecklist: [
      "validate_production_package",
      "validate_media_assets_rights_and_status",
      "verify_dynamic_motion_banner_embed_mode",
      "verify_banner_vertical_and_horizontal_direct_html_iframes",
      "verify_web_completa_hero_video_motion",
      "verify_landing_is_not_web_completa",
      "verify_public_routes_return_200_before_generated",
      "block_internal_gesture_lab_urls",
      "open_pr_for_human_review",
      "do_not_update_crm_until_urls_are_real",
    ],
    nextStep: "review_required",
  };
}

function buildMediaPlan(payload, validationWarnings = []) {
  const mediaAssets = payload.mediaAssets || legacyMediaAssets(payload.assets);
  const logo = mediaAssets.logo || { url: null, source: "placeholder", status: "missing" };
  const heroImage = mediaAssets.heroImage || { url: null, status: "missing" };
  const propertyImages = Array.isArray(mediaAssets.propertyImages) ? mediaAssets.propertyImages : [];
  const videos = Array.isArray(mediaAssets.videos) ? mediaAssets.videos : [];
  const warnings = [...validationWarnings, ...mediaWarnings(mediaAssets)];

  return {
    logo,
    favicon: mediaAssets.favicon || { url: null, status: "missing" },
    heroImage,
    propertyImages,
    videos,
    brandColors: Array.isArray(mediaAssets.brandColors) ? mediaAssets.brandColors : [],
    notes: Array.isArray(mediaAssets.notes) ? mediaAssets.notes : [],
    selectedAssets: {
      visualExperience: {
        photos: pickImages(propertyImages, ["hero", "background", "gallery"]),
        videos: pickVideos(videos, ["background", "hero"]),
        template: PLANNED_TEMPLATES.visualExperience,
      },
      landing: {
        photos: pickImages(propertyImages, ["hero", "gallery"]),
        videos: pickVideos(videos, ["hero", "background"]),
        template: PLANNED_TEMPLATES.landing,
      },
      webCompleta: {
        photos: pickImages(propertyImages, ["hero", "gallery", "background"]),
        videos: pickVideos(videos, ["hero", "background"]),
        fallbackVideo: videos.some((video) => video.url === "/VIDEO_AURUM_HEROWEB.mp4") ? "/VIDEO_AURUM_HEROWEB.mp4" : null,
        template: PLANNED_TEMPLATES.webCompleta,
      },
      bannerPack: {
        photos: pickImages(propertyImages, ["banner", "hero", "background"]),
        videos: pickVideos(videos, ["social", "background"]),
        template: PLANNED_TEMPLATES.bannerPack,
      },
    },
    missingAssets: missingAssets(logo, heroImage, propertyImages, videos),
    warnings: unique(warnings),
  };
}

function legacyMediaAssets(assets = {}) {
  return {
    logo: { url: assets.logo || null, source: assets.logo ? "manual" : "placeholder", status: assets.logo ? assets.status || "candidate" : "missing" },
    favicon: { url: assets.favicon || null, status: assets.favicon ? "candidate" : "missing" },
    heroImage: { url: Array.isArray(assets.images) && assets.images[0] ? assets.images[0] : null, status: assets.status || "missing" },
    propertyImages: Array.isArray(assets.images)
      ? assets.images.map((url) => ({ url, source: "manual", status: assets.status || "candidate", recommendedUse: "gallery" }))
      : [],
    videos: assets.video ? [{ url: assets.video, source: "manual", status: assets.status || "candidate", recommendedUse: "hero" }] : [],
    brandColors: [],
    notes: ["Generated from legacy assets field"],
  };
}

function mediaWarnings(mediaAssets = {}) {
  const warnings = [];
  const videos = Array.isArray(mediaAssets.videos) ? mediaAssets.videos : [];
  if (videos.some((video) => video.url === "/VIDEO_AURUM_HEROWEB.mp4" || video.source === "aurum_default")) {
    warnings.push("mediaPlan.videos: VIDEO_AURUM_HEROWEB.mp4 fallback in use");
  }
  if (!Array.isArray(mediaAssets.propertyImages) || mediaAssets.propertyImages.length === 0) warnings.push("mediaPlan.propertyImages: missing");
  if (!mediaAssets.logo?.url) warnings.push("mediaPlan.logo: missing");
  if (!mediaAssets.heroImage?.url) warnings.push("mediaPlan.heroImage: missing");
  if (!videos.some((video) => video.source !== "aurum_default" && video.source !== "placeholder")) warnings.push("mediaPlan.videos: missing_own_video");
  if (hasStatus(mediaAssets, "candidate") || hasStatus(mediaAssets, "pending_validation")) warnings.push("mediaPlan.assets: require_validation");
  return warnings;
}

function missingAssets(logo, heroImage, propertyImages, videos) {
  const missing = [];
  if (!logo?.url || logo.status === "missing") missing.push("logo");
  if (!heroImage?.url || heroImage.status === "missing") missing.push("heroImage");
  if (!propertyImages.length) missing.push("propertyImages");
  if (!videos.some((video) => video.source !== "aurum_default" && video.source !== "placeholder")) missing.push("ownVideo");
  return missing;
}

function buildVisualRisks(mediaPlan) {
  const risks = [];
  if (mediaPlan.missingAssets.includes("logo")) risks.push("Banners and visual experience need a validated logo.");
  if (mediaPlan.missingAssets.includes("heroImage")) risks.push("Landing and web complete need a strong hero image.");
  if (mediaPlan.missingAssets.includes("ownVideo")) risks.push("Web completa will use VIDEO_AURUM_HEROWEB.mp4 fallback until own video is approved.");
  if (mediaPlan.warnings.some((warning) => warning.includes("rights"))) risks.push("Some media assets need usage rights review.");
  if (mediaPlan.warnings.some((warning) => warning.includes("candidate") || warning.includes("pending_validation") || warning.includes("require_validation"))) {
    risks.push("Candidate media must be validated before production.");
  }
  risks.push("Web Completa must preserve hero video/motion, GSAP + SplitType h1 and at least 8 sections.");
  risks.push("Rubik direct .html iframe routes are required when relative imports are present.");
  return unique(risks);
}

function pickImages(images, uses) {
  return images.filter((image) => uses.includes(image.recommendedUse)).slice(0, 6);
}

function pickVideos(videos, uses) {
  return videos.filter((video) => uses.includes(video.recommendedUse)).slice(0, 3);
}

function hasStatus(mediaAssets, status) {
  const items = [
    mediaAssets.logo,
    mediaAssets.heroImage,
    ...(Array.isArray(mediaAssets.propertyImages) ? mediaAssets.propertyImages : []),
    ...(Array.isArray(mediaAssets.videos) ? mediaAssets.videos : []),
  ];
  return items.some((item) => item?.status === status);
}

function toComponentName(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
