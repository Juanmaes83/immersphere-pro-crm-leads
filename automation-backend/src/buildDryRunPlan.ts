import { sanitizeBranchName, sanitizeFileName, sanitizeSlug } from "./security.ts";

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
        repo: "rubik",
        path: `dynamic-motion-banner/${branchSlug}/${sanitizeFileName(`${branchSlug}-visual-experience`)}`,
        action: "plan_only",
      },
      {
        repo: "aurum",
        path: `src/generated/${sanitizeFileName(`${branchSlug}-public-routes`)}`,
        action: "plan_only",
      },
    ],
    plannedRoutes,
    qaChecklist: [
      "validate_production_package",
      "verify_public_routes_return_200_before_generated",
      "block_internal_gesture_lab_urls",
      "open_pr_for_human_review",
      "do_not_update_crm_until_urls_are_real",
    ],
    nextStep: "review_required",
  };
}
