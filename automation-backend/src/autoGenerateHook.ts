// Fase 9 — Pieza A.4: Auto-generate hook endpoint orchestrator.
//
// Connects anthropicClient (Claude API), hookPathPolicy (path validation),
// promptBuilder (prompt construction), and productionJobsPersistence (job tracking)
// into a single async pipeline triggered by one POST request.
//
// This endpoint does NOT create PRs or touch GitHub — that's Pieza B's job.
// It generates code via Claude API, validates it, and stores it in the job record.
// The CRM polls GET /api/production/hook-jobs/:jobId to track progress.
//
// Flow:
// 1. POST /api/production/auto-generate-hook { leadId, hookType, idempotencyKey? }
// 2. Returns 202 { ok: true, jobId, status: "queued" } immediately
// 3. Background: load package → build prompt → call Claude → validate → store
// 4. CRM polls job status: queued → generating → validating → generated_ok / failed
//
// Auth: accepts CRM_PERSISTENCE_TOKEN (X-CRM-Persistence-Token header) OR
// INTERNAL_API_TOKEN (X-Internal-Api-Token header). The endpoint is exempted
// from the general INTERNAL_API_TOKEN gate in server.ts so it can check both.
//
// IMPORTANT: idempotencyKey is STRONGLY RECOMMENDED in every request.
// Without it, rapid duplicate calls create duplicate jobs that each cost
// real money against the Claude API. The CRM should send a deterministic
// key like `${leadId}-${hookType}` for normal generation, and a versioned
// key like `${leadId}-${hookType}-v2` for intentional regeneration.
 
import { generateHookCode } from "./anthropicClient.ts";
import { validateHookFiles, annotateFilesWithRepo, getRepoForHook } from "./hookPathPolicy.ts";
import { buildPromptForHook } from "./promptBuilder.ts";
import { assertSafeFiles } from "./pathSecurity.ts";
import { getLatestProductionPackage } from "./crmProductionPackagePersistence.ts";
import {
  createJob,
  getJob,
  updateJobStatus,
  findJobByIdempotencyKey,
} from "./productionJobsPersistence.ts";
import { insertCommercialAction } from "./crmCommercialActionsPersistence.ts";
import { isCrmPersistenceAuthorized } from "./crmPersistence.ts";
import { logInfo, logWarn } from "./logger.ts";
import { sanitizeSlug } from "./security.ts";
 
// ── Auth helpers ────────────────────────────────────────────────────────
// Duplicates the INTERNAL_API_TOKEN check from server.ts because that
// function isn't exported. Accepts both CRM persistence token and
// internal API token — either one is sufficient.
 
function isInternalApiTokenValid(req: any): boolean {
  const expected = String(process.env.INTERNAL_API_TOKEN || "").trim();
  if (!expected || expected === "change-me-local-only") return false;
  return req.headers["x-internal-api-token"] === expected;
}
 
function isRequestAuthorized(req: any): boolean {
  return isCrmPersistenceAuthorized(req) || isInternalApiTokenValid(req);
}
 
// ── Kill switch ─────────────────────────────────────────────────────────
 
function isAutoGenerateEnabled(): boolean {
  return String(process.env.AUTO_GENERATE_ENABLED || "false").toLowerCase() === "true";
}
 
// ── Input validation ────────────────────────────────────────────────────
 
const VALID_HOOK_TYPES = new Set(["G1", "G2", "G3", "G4"]);
 
interface ValidatedInput {
  leadId: number;
  hookType: "G1" | "G2" | "G3" | "G4";
  idempotencyKey: string | undefined;
}
 
function validateInput(body: Record<string, any>): { ok: true; input: ValidatedInput } | { ok: false; error: string } {
  const leadId = Number(body?.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return { ok: false, error: "leadId debe ser un entero positivo" };
  }
 
  const hookType = String(body?.hookType || "").trim();
  if (!VALID_HOOK_TYPES.has(hookType)) {
    return { ok: false, error: "hookType debe ser G1, G2, G3 o G4" };
  }
 
  const idempotencyKey = body?.idempotencyKey != null
    ? String(body.idempotencyKey).trim() || undefined
    : undefined;
 
  return {
    ok: true,
    input: { leadId, hookType: hookType as "G1" | "G2" | "G3" | "G4", idempotencyKey },
  };
}
 
// ── Unique constraint detection ─────────────────────────────────────────
// PostgreSQL reports UNIQUE violations with code "23505". The pg driver
// puts this in err.code. Checking the error message string is fragile
// (locale-dependent, driver-version-dependent) — always check the code.
 
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const pgCode = (err as any).code;
  // "23505" is the SQLSTATE for unique_violation in PostgreSQL
  if (pgCode === "23505") return true;
  // Fallback: some pg driver wrappers lose the code but keep the message
  if (err instanceof Error && err.message.includes("duplicate key")) return true;
  return false;
}
 
// ── Response type ───────────────────────────────────────────────────────
 
export interface AutoGenerateResponse {
  statusCode: number;
  body: Record<string, any>;
}
 
// ── HTTP handler (sync part — returns 202 immediately) ──────────────────
 
/**
 * Handles POST /api/production/auto-generate-hook.
 *
 * @param req - Node HTTP request (for auth header access)
 * @param parsedBody - Already parsed JSON body from readJsonBody in server.ts
 * @returns { statusCode, body } for server.ts to send via sendJson
 */
export async function handleAutoGenerateHook(
  req: any,
  parsedBody: Record<string, any>
): Promise<AutoGenerateResponse> {
 
  // ── Kill switch ──
  if (!isAutoGenerateEnabled()) {
    return {
      statusCode: 503,
      body: {
        ok: false,
        error: "auto_generate_disabled",
        hint: "Set AUTO_GENERATE_ENABLED=true in Railway to enable this endpoint.",
      },
    };
  }
 
  // ── Auth ──
  if (!isRequestAuthorized(req)) {
    return {
      statusCode: 401,
      body: {
        ok: false,
        error: "unauthorized",
        hint: "Send X-CRM-Persistence-Token or X-Internal-Api-Token header.",
      },
    };
  }
 
  // ── Input validation ──
  const validation = validateInput(parsedBody);
  if (!validation.ok) {
    return {
      statusCode: 400,
      body: { ok: false, error: "invalid_input", detail: validation.error },
    };
  }
  const { leadId, hookType, idempotencyKey } = validation.input;
 
  // ── Warning if no idempotency key ──
  if (!idempotencyKey) {
    logWarn("auto_generate_hook_no_idempotency_key", {
      leadId,
      hookType,
      warning: "Sin idempotencyKey, llamadas duplicadas crean jobs duplicados que cuestan dinero. " +
        "El CRM debería enviar idempotencyKey como `${leadId}-${hookType}` en cada request.",
    });
  }
 
  // ── Idempotency check ──
  if (idempotencyKey) {
    try {
      const existing = await findJobByIdempotencyKey(idempotencyKey);
      if (existing) {
        logInfo("auto_generate_hook_idempotent_hit", {
          jobId: existing.id,
          leadId,
          hookType,
          status: existing.status,
          idempotencyKey,
        });
        return {
          statusCode: 200,
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
    } catch (err) {
      logWarn("auto_generate_hook_idempotency_check_failed", {
        error: err instanceof Error ? err.message : String(err),
        idempotencyKey,
      });
    }
  }
 
  // ── Verify production package exists before creating job ──
  let packageRecord;
  try {
    packageRecord = await getLatestProductionPackage(leadId);
  } catch (err) {
    return {
      statusCode: 503,
      body: {
        ok: false,
        error: "production_package_unavailable",
        detail: "No se pudo acceder a la base de datos de production packages.",
      },
    };
  }
 
  if (!packageRecord) {
    return {
      statusCode: 404,
      body: {
        ok: false,
        error: "no_production_package",
        detail: `No existe un production package para leadId=${leadId}. ` +
          `Genera el paquete desde el CRM antes de auto-generar ganchos.`,
      },
    };
  }
 
  // ── Derive slug from package ──
  const payload = packageRecord.packagePayload || packageRecord;
  const rawSlug = payload?.lead?.slug || payload?.slug || "";
  const slug = sanitizeSlug(rawSlug);
 
  if (!slug) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        error: "missing_slug",
        detail: "El production package no contiene un slug de lead válido.",
      },
    };
  }
 
  // ── Create job ──
  let job;
  try {
    job = await createJob(leadId, slug, hookType, idempotencyKey);
  } catch (err) {
    // Handle race condition: another request created a job with this
    // idempotency key between our check and our insert
    if (idempotencyKey && isUniqueConstraintViolation(err)) {
      const existing = await findJobByIdempotencyKey(idempotencyKey).catch(() => null);
      if (existing) {
        return {
          statusCode: 200,
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
    logWarn("auto_generate_hook_job_creation_failed", {
      error: err instanceof Error ? err.message : String(err),
      pgCode: (err as any)?.code || "none",
      leadId,
      hookType,
    });
    return {
      statusCode: 500,
      body: { ok: false, error: "job_creation_failed" },
    };
  }
 
  logInfo("auto_generate_hook_started", {
    jobId: job.id,
    leadId,
    hookType,
    slug,
    idempotencyKey: idempotencyKey || "none",
  });
 
  // ── Fire background processor (don't await) ──
  processHookGenerationAsync(job.id, payload).catch((err) => {
    logWarn("auto_generate_hook_unhandled_error", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
      code: (err as any)?.code || "unknown",
    });
    updateJobStatus(job.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    }).catch((dbErr) => {
      logWarn("auto_generate_hook_status_update_failed_in_catch", {
        jobId: job.id,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    });
  });
 
  // ── Return 202 immediately ──
  return {
    statusCode: 202,
    body: {
      ok: true,
      jobId: job.id,
      status: "queued",
      hookType,
      leadSlug: slug,
      pollUrl: `/api/production/hook-jobs/${job.id}`,
    },
  };
}
 
// ── Background processor (async, runs after 202 response) ───────────────
//
// Each step updates the job status so the CRM can show progress.
// If any step fails, the job is marked as failed with a clear error.
// Generated files are ALWAYS stored (even if validation fails) so the
// operator can inspect what Claude produced.
 
async function processHookGenerationAsync(
  jobId: string,
  packagePayload: Record<string, any>
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found after creation`);
 
  const { leadId, leadSlug, hookType } = job;
 
  // ── Step 1: Build prompt ──
  await updateJobStatus(jobId, { status: "building_prompt" });
 
  let prompt: string;
  try {
    prompt = buildPromptForHook(hookType as "G1" | "G2" | "G3" | "G4", packagePayload);
  } catch (err) {
    await updateJobStatus(jobId, {
      status: "failed",
      error: `Error construyendo el prompt: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
 
  // ── Step 2: Call Claude API ──
  await updateJobStatus(jobId, { status: "generating" });
 
  let generationResult;
  try {
    generationResult = await generateHookCode(prompt);
  } catch (err) {
    const code = (err as any)?.code || "unknown";
    await updateJobStatus(jobId, {
      status: "failed",
      error: `Claude API error [${code}]: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
 
  // Claude reported a controlled error (not a crash — it understood the
  // request but couldn't fulfill it safely)
  if (generationResult.error) {
    await updateJobStatus(jobId, {
      status: "generation_error",
      error: `Claude reportó: ${generationResult.error}`,
    });
    await logCommercialAction(leadId, hookType, "generation_error", generationResult);
    return;
  }
 
  // ── Step 3: Validate with hookPathPolicy (strict, per-hook) ──
  await updateJobStatus(jobId, { status: "validating" });
 
  const hookErrors = validateHookFiles(
    hookType as "G1" | "G2" | "G3" | "G4",
    leadSlug,
    generationResult.files
  );
 
  if (hookErrors.length > 0) {
    await updateJobStatus(jobId, {
      status: "validation_failed",
      error: `hookPathPolicy: ${hookErrors.join("; ")}`,
      generatedFiles: generationResult.files,
    });
    await logCommercialAction(leadId, hookType, "validation_failed", generationResult);
    return;
  }
 
  // ── Step 4: Validate with pathSecurity (broad, defense in depth) ──
  const annotatedFiles = annotateFilesWithRepo(
    hookType as "G1" | "G2" | "G3" | "G4",
    generationResult.files
  );
  const pathSecErrors = assertSafeFiles(annotatedFiles, leadSlug);
 
  if (pathSecErrors.length > 0) {
    await updateJobStatus(jobId, {
      status: "validation_failed",
      error: `pathSecurity: ${pathSecErrors.join("; ")}`,
      generatedFiles: generationResult.files,
    });
    await logCommercialAction(leadId, hookType, "validation_failed", generationResult);
    return;
  }
 
  // ── Step 5: All validations passed — store and mark success ──
  const repo = getRepoForHook(hookType as "G1" | "G2" | "G3" | "G4");
 
  await updateJobStatus(jobId, {
    status: "generated_ok",
    generatedFiles: generationResult.files,
    repo,
  });
 
  await logCommercialAction(leadId, hookType, "generated_ok", generationResult);
 
  logInfo("auto_generate_hook_completed", {
    jobId,
    leadId,
    hookType,
    leadSlug,
    fileCount: generationResult.files.length,
    filePaths: generationResult.files.map((f) => f.path),
    model: generationResult.model,
    inputTokens: generationResult.inputTokens,
    outputTokens: generationResult.outputTokens,
    durationMs: generationResult.durationMs,
    repo,
  });
}
 
// ── Commercial action logging (best-effort, never blocks) ───────────────
// Wrapped in try/catch so a logging failure never crashes the generator.
// Includes the attempted payload in the failure log for debugging.
 
async function logCommercialAction(
  leadId: number,
  hookType: string,
  status: string,
  result: { model: string; inputTokens: number; outputTokens: number; durationMs: number; files?: any[]; error?: string }
): Promise<void> {
  const actionPayload = {
    hookId: null,
    hookType,
    actionType: "auto_generate_hook",
    channel: "system",
    status,
    messageSnapshot: JSON.stringify({
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      fileCount: result.files?.length || 0,
      error: result.error || null,
    }),
  };
 
  try {
    await insertCommercialAction(leadId, actionPayload);
  } catch (err) {
    logWarn("auto_generate_hook_commercial_action_failed", {
      leadId,
      hookType,
      error: err instanceof Error ? err.message : String(err),
      attemptedPayload: actionPayload,
    });
  }
}
