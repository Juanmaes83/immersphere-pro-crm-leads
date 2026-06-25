// Fase 9 — Pieza A.4: Auto-generate hook endpoint.
// v4 — FIX: createJob() llamada con 4 argumentos posicionales (no objeto).
//      FIX: eliminado import muerto findLatestJobForLeadHook (no existe en
//      productionJobsPersistence.ts y nunca se usaba en este archivo).
// v3 — 2-step generation: splits large hooks into 2 smaller Claude calls.
 
import { logInfo, logWarn } from "./logger.ts";
import { generateHookCode } from "./anthropicClient.ts";
import { buildPromptForHookStep } from "./promptBuilder.ts";
import {
  getStepCount,
  getExpectedFilePathsForStep,
  validateHookFiles,
  getRepoForHook,
} from "./hookPathPolicy.ts";
import {
  createJob,
  updateJobStatus,
  findJobByIdempotencyKey,
} from "./productionJobsPersistence.ts";
import { sanitizeSlug } from "./security.ts";
 
// ── Types ──
 
interface AutoGenerateRequest {
  leadId: number;
  hookType: "G1" | "G2" | "G3" | "G4";
  idempotencyKey?: string;
}
 
// ── Package fetcher ──
 
async function fetchProductionPackage(
  leadId: number
): Promise<Record<string, any> | null> {
  const { getLatestProductionPackage } = await import(
    "./crmProductionPackagePersistence.ts"
  );
  try {
    const pkg = await getLatestProductionPackage(leadId);
    return pkg || null;
  } catch {
    return null;
  }
}
 
// ── Background processor (2-step orchestration) ──
 
async function processHookGenerationAsync(
  jobId: string,
  hookType: "G1" | "G2" | "G3" | "G4",
  packagePayload: Record<string, any>
): Promise<void> {
  try {
    const stepCount = getStepCount(hookType);
    let allFiles: Array<{ path: string; content: string }> = [];
 
    // ── Step 1 (always runs) ──
    await updateJobStatus(jobId, { status: "building_prompt" });
 
    const prompt1 = buildPromptForHookStep(hookType, 1, packagePayload);
 
    await updateJobStatus(jobId, { status: "generating" });
 
    logInfo("auto_generate_step", {
      jobId, hookType, step: 1, totalSteps: stepCount,
      promptLength: prompt1.length,
    });
 
    const result1 = await generateHookCode(prompt1);
 
    if (result1.error) {
      await updateJobStatus(jobId, {
        status: "failed",
        error: `Claude API error [${result1.errorCode || "CONTROLLED"}]: ${result1.error}`,
      });
      return;
    }
 
    if (result1.files.length === 0) {
      await updateJobStatus(jobId, {
        status: "failed",
        error: "Step 1: Claude returned 0 files without error",
      });
      return;
    }
 
    const slug = extractSlugFromPayload(packagePayload);
    const step1Errors = validateHookFiles(hookType, slug, result1.files);
 
    if (step1Errors.length > 0) {
      await updateJobStatus(jobId, {
        status: "validation_failed",
        error: `Step 1 validation: ${step1Errors.join("; ")}`,
        generatedFiles: result1.files,
      });
      return;
    }
 
    allFiles.push(...result1.files);
 
    logInfo("auto_generate_step_complete", {
      jobId, hookType, step: 1, filesGenerated: result1.files.length,
      inputTokens: result1.inputTokens, outputTokens: result1.outputTokens,
      durationMs: result1.durationMs,
    });
 
    // ── Step 2 (only for G2, G3, G4) ──
    if (stepCount === 2) {
      await updateJobStatus(jobId, { status: "generating_step2" });
 
      const prompt2 = buildPromptForHookStep(
        hookType, 2, packagePayload, result1.files
      );
 
      logInfo("auto_generate_step", {
        jobId, hookType, step: 2, totalSteps: stepCount,
        promptLength: prompt2.length,
      });
 
      const result2 = await generateHookCode(prompt2);
 
      if (result2.error) {
        await updateJobStatus(jobId, {
          status: "failed",
          error: `Step 2: Claude API error [${result2.errorCode || "CONTROLLED"}]: ${result2.error}`,
          generatedFiles: allFiles,
        });
        return;
      }
 
      if (result2.files.length === 0) {
        await updateJobStatus(jobId, {
          status: "failed",
          error: "Step 2: Claude returned 0 files without error",
          generatedFiles: allFiles,
        });
        return;
      }
 
      const step2Errors = validateHookFiles(hookType, slug, result2.files);
      if (step2Errors.length > 0) {
        await updateJobStatus(jobId, {
          status: "validation_failed",
          error: `Step 2 validation: ${step2Errors.join("; ")}`,
          generatedFiles: [...allFiles, ...result2.files],
        });
        return;
      }
 
      allFiles.push(...result2.files);
 
      logInfo("auto_generate_step_complete", {
        jobId, hookType, step: 2, filesGenerated: result2.files.length,
        inputTokens: result2.inputTokens, outputTokens: result2.outputTokens,
        durationMs: result2.durationMs,
      });
    }
 
    // ── Final validation of complete set ──
    await updateJobStatus(jobId, { status: "validating" });
 
    const finalErrors = validateHookFiles(hookType, slug, allFiles);
    if (finalErrors.length > 0) {
      await updateJobStatus(jobId, {
        status: "validation_failed",
        error: `Final validation: ${finalErrors.join("; ")}`,
        generatedFiles: allFiles,
      });
      return;
    }
 
    // ── Success ──
    const repo = getRepoForHook(hookType);
    await updateJobStatus(jobId, {
      status: "generated_ok",
      repo,
      generatedFiles: allFiles,
    });
 
    logInfo("auto_generate_hook_complete", {
      jobId, hookType, slug, repo,
      totalFiles: allFiles.length,
      totalSteps: stepCount,
    });
 
  } catch (err: any) {
    const errorCode = err?.code || "UNKNOWN";
    const errorMsg = err instanceof Error ? err.message : String(err);
 
    logWarn("auto_generate_hook_error", {
      jobId, hookType, errorCode, error: errorMsg,
    });
 
    try {
      await updateJobStatus(jobId, {
        status: "failed",
        error: `Claude API error [${errorCode}]: ${errorMsg}`,
      });
    } catch (updateErr) {
      logWarn("auto_generate_hook_status_update_failed", {
        jobId, updateError: String(updateErr),
      });
    }
  }
}
 
// ── Helper ──
 
function extractSlugFromPayload(pkg: Record<string, any>): string {
  const lead = pkg?.lead || pkg?.packagePayload?.lead || {};
  return sanitizeSlug(lead.slug || pkg?.slug || "unknown");
}
 
// ── Endpoint handler ──
 
export async function handleAutoGenerateHook(
  req: { body: AutoGenerateRequest },
  env: { AUTO_GENERATE_ENABLED?: string; GITHUB_PR_AUTOMATION_ENABLED?: string }
): Promise<{
  status: number;
  body: Record<string, any>;
}> {
  // Kill switch
  if (env.AUTO_GENERATE_ENABLED !== "true") {
    return {
      status: 403,
      body: {
        ok: false,
        error: "auto_generate_disabled",
        message: "AUTO_GENERATE_ENABLED is not 'true'. Enable it in Railway to use this endpoint.",
      },
    };
  }
 
  const { leadId, hookType, idempotencyKey } = req.body;
 
  if (!leadId || typeof leadId !== "number") {
    return { status: 400, body: { ok: false, error: "invalid_lead_id" } };
  }
  if (!["G1", "G2", "G3", "G4"].includes(hookType)) {
    return { status: 400, body: { ok: false, error: "invalid_hook_type" } };
  }
 
  // Idempotency check — return existing job if found
  if (idempotencyKey) {
    const existing = await findJobByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        status: 200,
        body: {
          ok: true,
          jobId: existing.id,
          status: existing.status,
          hookType: existing.hookType,
          reused: true,
          pollUrl: `/api/production/hook-jobs/${existing.id}`,
        },
      };
    }
  }
 
  // Fetch production package
  const pkg = await fetchProductionPackage(leadId);
  if (!pkg) {
    return {
      status: 404,
      body: { ok: false, error: "production_package_not_found", leadId },
    };
  }
 
  const payload = pkg.packagePayload || pkg;
  const slug = extractSlugFromPayload(payload);
 
  // FIX (v4): createJob espera 4 argumentos POSICIONALES, no un objeto.
  // Firma real en productionJobsPersistence.ts:
  //   createJob(leadId: number, leadSlug: string, hookType: "G1"|"G2"|"G3"|"G4", idempotencyKey?: string)
  const finalIdempotencyKey = idempotencyKey || `${leadId}-${hookType}-${Date.now()}`;
  const job = await createJob(leadId, slug, hookType, finalIdempotencyKey);
  const jobId = job.id;
 
  // Fire and forget — respond immediately with 202
  processHookGenerationAsync(jobId, hookType as any, payload).catch((err) => {
    logWarn("auto_generate_hook_unhandled", {
      jobId, error: String(err),
    });
  });
 
  return {
    status: 202,
    body: {
      ok: true,
      jobId,
      status: "queued",
      hookType,
      leadSlug: slug,
      pollUrl: `/api/production/hook-jobs/${jobId}`,
    },
  };
}
