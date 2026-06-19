import { buildDryRunPlan } from "./buildDryRunPlan.ts";
import { buildAurumFiles, buildRubikFiles } from "./fileGenerators.ts";
import { assertSafeFiles, AURUM_REPO, RUBIK_REPO } from "./pathSecurity.ts";
import { buildProposalPackage } from "./proposalPackage.ts";
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
  const rubikFiles = buildRubikFiles(payload, proposalPackage);
  const aurumFiles = buildAurumFiles(payload, proposalPackage);
  const filesToCreate = [...rubikFiles, ...aurumFiles];
  const pathErrors = assertSafeFiles(filesToCreate, leadSlug);
  if (pathErrors.length) {
    return {
      ok: false,
      mode: "pr-plan",
      validation: { passed: false, errors: pathErrors, warnings: validation.warnings },
      blocked: true,
    };
  }
  return {
    ok: true,
    mode: "pr-plan",
    jobId: dryRunPlan.jobId.replace("prod_", "pr_"),
    leadSlug,
    validation,
    targetPRs,
    branches,
    filesToCreate: filesToCreate.map(({ repo, path, message }) => ({ repo, path, message })),
    generatedFiles: filesToCreate,
    proposalPackage,
    plannedRepos: dryRunPlan.plannedRepos,
    plannedRoutes: dryRunPlan.plannedRoutes,
    mediaPlan: dryRunPlan.mediaPlan,
    visualRisks: dryRunPlan.visualRisks,
    qaChecklist: dryRunPlan.qaChecklist,
    blockedWrite: true,
    nextStep: "review_required",
  };
}
