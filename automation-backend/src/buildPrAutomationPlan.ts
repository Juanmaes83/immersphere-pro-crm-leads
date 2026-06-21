import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import { buildAurumFiles, buildRubikFiles, validateGeneratedFiles } from "./fileGenerators.ts";
import { assertSafeFiles, AURUM_REPO, RUBIK_REPO } from "./pathSecurity.ts";
import { buildProposalPackage } from "./proposalPackage.ts";
import { CLIENT_FACING_DOMAIN } from "./schemas.ts";
import { sanitizeBranchName, sanitizeSlug } from "./security.ts";

export function buildPrAutomationPlan(payload, validation) {
  const dryRunPlan = buildDryRunPlan(payload, validation);
  if (!validation.passed) {
    return {
      ok: false,
      mode: "pr-plan",
      validation,
      blocked: true,
    };
  }
  const leadSlug = sanitizeSlug(payload.lead?.slug);
  const branchSlug = sanitizeBranchName(leadSlug);
  const branches = {
    rubik: `production/${branchSlug}-visual-assets`,
    aurum: `production/${branchSlug}-public-pages`,
  };
  const targetPRs = {
    rubik: { repo: RUBIK_REPO, baseBranch: "main", headBranch: branches.rubik },
    aurum: { repo: AURUM_REPO, baseBranch: "main", headBranch: branches.aurum },
  };
  const seedPlan = { branches, targetPRs };
  const proposalPackage = buildProposalPackage(payload, seedPlan);
  const rubikResult = buildRubikFiles(payload);
  const aurumResult = buildAurumFiles(payload, proposalPackage);
  const filesToCreate = [...rubikResult.files, ...aurumResult.files];
  const generatorWarnings = [...rubikResult.warnings, ...aurumResult.warnings];
  const generatorErrors = [...rubikResult.errors, ...aurumResult.errors];
  const assetMode = aurumResult.assetMode;

  const pathErrors = assertSafeFiles(filesToCreate, leadSlug);
  if (pathErrors.length) {
    return {
      ok: false,
      mode: "pr-plan",
      validation: { passed: false, errors: [...pathErrors, ...generatorErrors], warnings: [...validation.warnings, ...generatorWarnings] },
      blocked: true,
    };
  }

  const fileValidation = validateGeneratedFiles(filesToCreate);
  if (!fileValidation.ok) {
    generatorErrors.push(...fileValidation.errors);
  }
  generatorWarnings.push(...fileValidation.warnings);

  const plannedPublicRoutes = {
    landing: `https://${CLIENT_FACING_DOMAIN}/${leadSlug}`,
    webCompleta: `https://${CLIENT_FACING_DOMAIN}/${leadSlug}-web-completa`,
    visualExperience: `https://${CLIENT_FACING_DOMAIN}/visual-experience/${leadSlug}`,
    bannerPack: `https://${CLIENT_FACING_DOMAIN}/banners/${leadSlug}`,
    bannerVertical: `https://${CLIENT_FACING_DOMAIN}/banners/${leadSlug}/vertical`,
    bannerHorizontal: `https://${CLIENT_FACING_DOMAIN}/banners/${leadSlug}/horizontal`,
  };

  const overallOk = generatorErrors.length === 0;

  return {
    ok: overallOk,
    mode: "pr-plan",
    jobId: dryRunPlan.jobId.replace("prod_", "pr_"),
    leadSlug,
    validation,
    targetPRs,
    branches,
    filesToCreate: filesToCreate.map(({ repo, path, message, isPatchTarget, patchType }) => ({ repo, path, message, isPatchTarget, patchType })),
    generatedFiles: filesToCreate,
    generatorWarnings,
    generatorErrors,
    assetMode,
    proposalPackage,
    plannedPublicRoutes,
    plannedRepos: dryRunPlan.plannedRepos,
    plannedRoutes: dryRunPlan.plannedRoutes,
    mediaPlan: dryRunPlan.mediaPlan,
    visualRisks: dryRunPlan.visualRisks,
    qaChecklist: dryRunPlan.qaChecklist,
    blockedWrite: true,
    nextStep: "review_required",
  };
}
