// Fase 9: Anthropic API client for G1-G4 hook auto-generation pipeline.
// Calls Claude API with a structured system prompt that forces JSON output
// delimited by unique markers — never relies on greedy regex extraction.
//
// Security invariants:
// - API key read from env at call time, never cached at import time
//   (allows hot-reloading the key without restarting the service)
// - Timeout on every outbound request (default 120s) — Node's native fetch
//   has no timeout by default, so without this a hung Anthropic response
//   would block the job forever
// - Automatic retry with backoff on 429 (rate limit) and 529 (overloaded)
// - System prompt is a separate API parameter, not mixed into user content
// - Response extraction uses unique markers, not regex on curly braces
// - Explicit stop_reason check catches truncated responses before parsing
//
// NOTE ON DESIGN DIFFERENCE FROM SPEC v2:
// The spec v2 defined generateHookCode(userPrompt, allowedPathPrefix).
// This implementation takes only userPrompt because the allowed path prefix
// is the responsibility of promptBuilder.ts (Pieza A.3), which builds the
// complete prompt including all path constraints. This keeps anthropicClient
// as a pure "call API + parse response" module with no knowledge of hook
// types, lead data, or path policies — cleaner separation of concerns.
 
import { logInfo, logWarn } from "./logger.ts";
 
// ── Error codes ─────────────────────────────────────────────────────────
// Follow the same pattern as crmPersistence.ts (err.code = "...") so the
// endpoint handler in server.ts can distinguish error types without fragile
// string matching on error.message.
 
export const ERROR_CODES = {
  API_KEY_NOT_CONFIGURED: "ANTHROPIC_API_KEY_NOT_CONFIGURED",
  API_UNAUTHORIZED: "ANTHROPIC_API_UNAUTHORIZED",
  API_RATE_LIMITED: "ANTHROPIC_API_RATE_LIMITED",
  API_OVERLOADED: "ANTHROPIC_API_OVERLOADED",
  API_TIMEOUT: "ANTHROPIC_API_TIMEOUT",
  API_HTTP_ERROR: "ANTHROPIC_API_HTTP_ERROR",
  RESPONSE_TRUNCATED: "ANTHROPIC_RESPONSE_TRUNCATED",
  RESPONSE_NO_MARKERS: "ANTHROPIC_RESPONSE_NO_MARKERS",
  RESPONSE_INVALID_JSON: "ANTHROPIC_RESPONSE_INVALID_JSON",
  RESPONSE_INVALID_FORMAT: "ANTHROPIC_RESPONSE_INVALID_FORMAT",
  RESPONSE_EMPTY_FILES: "ANTHROPIC_RESPONSE_EMPTY_FILES",
  RESPONSE_FILE_VALIDATION: "ANTHROPIC_RESPONSE_FILE_VALIDATION",
  GENERATION_CONTROLLED_ERROR: "ANTHROPIC_GENERATION_CONTROLLED_ERROR",
} as const;
 
function createCodedError(message: string, code: string): Error {
  const err: any = new Error(message);
  err.code = code;
  return err;
}
 
// ── Configuration (all from environment, nothing hardcoded) ─────────────
 
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
 
// Default timeout: 120s. Deliberately NOT added as a Railway env var
// (we already configured 6 in step #4, and 120s is a safe universal
// default). Only override this if you hit consistent timeouts on G3.
function getTimeoutMs(): number {
 const raw = parseInt(process.env.CLAUDE_TIMEOUT_MS || "180000", 10);
 return Math.min(Math.max(raw, 30_000), 300_000);
}
 
function getApiKey(): string {
  const key = String(process.env.CLAUDE_API_KEY_IMMERSPHERE_PRO_CRM_LEADS || "").trim();
  if (!key) {
    throw createCodedError(
      "CLAUDE_API_KEY_IMMERSPHERE_PRO_CRM_LEADS no está configurada. " +
      "Añádela como variable de entorno en Railway antes de usar auto-generate-hook.",
      ERROR_CODES.API_KEY_NOT_CONFIGURED
    );
  }
  return key;
}
 
function getModelId(): string {
  return String(process.env.CLAUDE_MODEL_ID || "claude-sonnet-4-6").trim();
}
 
function getMaxTokens(): number {
  const raw = parseInt(process.env.CLAUDE_MAX_TOKENS || "16000", 10);
  // Sanity bounds: never below 1000 (useless), never above 64000 (API limit)
  return Math.min(Math.max(raw, 1000), 64000);
}
 
function getTemperature(): number {
  const raw = parseFloat(process.env.CLAUDE_TEMPERATURE || "0.2");
  // Clamp to valid API range [0, 1]
  return Math.min(Math.max(raw, 0), 1);
}
 
// ── Marker-based extraction ─────────────────────────────────────────────
// These markers are deliberately ugly and unique — they will never appear
// naturally inside generated HTML/CSS/JS/TSX code, which is the whole point.
 
const START_MARKER = "===IMMERSPHERE_FILES_START===";
const END_MARKER = "===IMMERSPHERE_FILES_END===";
 
// ── System prompt ───────────────────────────────────────────────────────
 
const SYSTEM_PROMPT = `Eres un generador de código para el sistema Immersphere Pro.
Tu ÚNICA función es generar archivos de código (HTML, TSX, CSS, JS, JSON) para
los ganchos comerciales de leads inmobiliarios.
 
REGLAS ABSOLUTAS — violarlas invalida toda tu respuesta:
 
1. Tu respuesta COMPLETA debe tener esta estructura exacta, sin NADA antes ni después:
 
${START_MARKER}
{
  "files": [
    {
      "path": "ruta/relativa/del/archivo.ext",
      "content": "contenido completo del archivo"
    }
  ]
}
${END_MARKER}
 
2. NO escribas texto explicativo, comentarios, saludos ni markdown antes de
   ${START_MARKER} ni después de ${END_MARKER}. NADA. Solo los marcadores y
   el JSON entre ellos.
 
3. El campo "path" de cada archivo debe ser SIEMPRE relativo (nunca empieza
   por "/" ni contiene "../"). Debe empezar por el prefijo de ruta permitido
   que se te indique en el mensaje de usuario.
 
4. El campo "path" DEBE contener el slug del lead que se te indique. Si el
   slug es "torrevieja-sur", cada path debe incluir "torrevieja-sur" o su
   forma camelCase "torreviejaSur". Esto evita que tus archivos pisen los de
   otro cliente.
 
5. NUNCA modifiques, referencees ni generes archivos de configuración global:
   package.json, vercel.json, next.config.*, tsconfig.json, .env, App.tsx.
   Esos archivos los gestiona el pipeline de PR existente, no tú.
 
6. NUNCA generes archivos para un lead distinto al que se te indica. Si el
   mensaje dice "slug: torrevieja-sur", no generes nada que contenga
   "casas-y-mar", "united-real-estate", ni ningún otro slug.
 
7. Si no puedes cumplir alguna instrucción de forma segura, responde así
   (siempre dentro de los marcadores):
${START_MARKER}
{ "files": [], "error": "descripción clara del problema" }
${END_MARKER}
 
8. El contenido de cada archivo debe ser COMPLETO y funcional — nunca uses
   "// ... rest of code" ni "/* TODO */". Cada archivo debe poder guardarse
   y funcionar sin edición manual posterior.
 
9. Máximo 15 archivos por respuesta. Si el gancho requiere más, prioriza
   los archivos esenciales (página principal, componentes core, datos) y
   omite archivos secundarios (tests, storybook, README).
 
10. Máximo 200KB (204800 caracteres) por archivo individual. Si un archivo
    excede ese tamaño, divídelo en módulos más pequeños.`.trim();
 
// ── Types ───────────────────────────────────────────────────────────────
 
export interface GeneratedFile {
  path: string;
  content: string;
}
 
export interface ClaudeGenerationResult {
  files: GeneratedFile[];
  error?: string;
  errorCode?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  stopReason: string;
}
 
// ── Core API call with retry ────────────────────────────────────────────
 
interface AnthropicRawResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}
 
const RETRYABLE_STATUS_CODES = new Set([429, 529]);
const MAX_RETRY_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 30_000;
 
async function callAnthropicRaw(
  userPrompt: string,
  attempt: number = 1
): Promise<AnthropicRawResponse> {
  const apiKey = getApiKey();
  const requestedModel = getModelId();
  const maxTokens = getMaxTokens();
  const temperature = getTemperature();
 
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
 
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: requestedModel,
        max_tokens: maxTokens,
        temperature,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
 
    // ── Retryable errors (429 rate limit, 529 overloaded) ──
    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      if (attempt > MAX_RETRY_ATTEMPTS) {
        const errorCode = response.status === 429
          ? ERROR_CODES.API_RATE_LIMITED
          : ERROR_CODES.API_OVERLOADED;
        throw createCodedError(
          `Anthropic API ${response.status} after ${attempt} attempts. ` +
          `Retry later or check your plan limits at console.anthropic.com.`,
          errorCode
        );
      }
 
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
      const backoffMs = Math.min(retryAfterSeconds * 1000 * attempt, MAX_BACKOFF_MS);
 
      logWarn("anthropic_retryable_error", {
        status: response.status,
        attempt,
        retryAfterSeconds,
        backoffMs,
        model: requestedModel,
      });
 
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return callAnthropicRaw(userPrompt, attempt + 1);
    }
 
    // ── Auth error (401) ──
    if (response.status === 401) {
      throw createCodedError(
        "API key inválida o expirada (401 Unauthorized). " +
        "Verifica CLAUDE_API_KEY_IMMERSPHERE_PRO_CRM_LEADS en Railway.",
        ERROR_CODES.API_UNAUTHORIZED
      );
    }
 
    // ── Other HTTP errors ──
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(no body)");
      throw createCodedError(
        `Anthropic API error ${response.status}: ${errorBody.slice(0, 500)}`,
        ERROR_CODES.API_HTTP_ERROR
      );
    }
 
    // ── Success — parse response ──
    const data = await response.json();
 
    const text = data.content?.[0]?.text ?? "";
    // Use the model from the API RESPONSE, not from our config —
    // Anthropic may resolve aliases or redirect to a different version
    const actualModel = data.model ?? requestedModel;
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const stopReason = data.stop_reason ?? "unknown";
 
    logInfo("anthropic_api_call_success", {
      requestedModel,
      actualModel,
      inputTokens,
      outputTokens,
      stopReason,
      attempt,
      responseLength: text.length,
    });
 
    return { text, model: actualModel, inputTokens, outputTokens, stopReason };
 
  } catch (err) {
    // AbortController fires this specific error type on timeout
    if (err instanceof Error && err.name === "AbortError") {
      throw createCodedError(
        `Anthropic API timeout after ${getTimeoutMs()}ms. ` +
        `The model may be overloaded. Try again in a few minutes.`,
        ERROR_CODES.API_TIMEOUT
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
 
// ── Response parsing with marker extraction ─────────────────────────────
 
const MAX_FILE_SIZE_BYTES = 204_800; // 200KB
const MAX_FILE_COUNT = 15;
 
function extractFilesFromResponse(
  rawText: string,
  stopReason: string
): { files: GeneratedFile[]; error?: string } {
 
  // ── CRITICAL: check for truncation BEFORE looking for markers ──
  // When Claude hits max_tokens, the response is cut mid-output. The
  // END_MARKER won't be there. Checking stop_reason first gives a clear,
  // actionable error instead of the confusing "markers not found".
  if (stopReason === "max_tokens") {
    throw createCodedError(
      "Respuesta truncada — Claude agotó max_tokens antes de terminar. " +
      `CLAUDE_MAX_TOKENS actual: ${getMaxTokens()}. ` +
      "Sube CLAUDE_MAX_TOKENS en Railway o simplifica el gancho solicitado.",
      ERROR_CODES.RESPONSE_TRUNCATED
    );
  }
 
  const startIdx = rawText.indexOf(START_MARKER);
  const endIdx = rawText.indexOf(END_MARKER);
 
  // ── Markers not found ──
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw createCodedError(
      `La respuesta de Claude no contiene los marcadores esperados ` +
      `(${START_MARKER} / ${END_MARKER}). ` +
      `stop_reason: "${stopReason}", longitud: ${rawText.length} chars. ` +
      `Esto suele indicar que Claude ignoró las instrucciones de formato ` +
      `del system prompt — reintentar suele resolverlo.`,
      ERROR_CODES.RESPONSE_NO_MARKERS
    );
  }
 
  // ── Extract and parse JSON between markers ──
  const jsonSlice = rawText.slice(startIdx + START_MARKER.length, endIdx).trim();
 
  let parsed: { files?: GeneratedFile[]; error?: string };
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (parseError) {
    const preview = jsonSlice.slice(0, 300) + (jsonSlice.length > 300 ? "..." : "");
    throw createCodedError(
      `JSON inválido entre marcadores: ${(parseError as Error).message}. ` +
      `Preview: ${preview}`,
      ERROR_CODES.RESPONSE_INVALID_JSON
    );
  }
 
  // ── Claude reported a controlled error ──
  if (parsed.error) {
    return { files: [], error: parsed.error };
  }
 
  // ── Validate files array structure ──
  if (!Array.isArray(parsed.files)) {
    throw createCodedError(
      'La respuesta no tiene el formato { "files": [...] } esperado. ' +
      `Keys recibidas: ${Object.keys(parsed).join(", ")}`,
      ERROR_CODES.RESPONSE_INVALID_FORMAT
    );
  }
 
  if (parsed.files.length === 0) {
    throw createCodedError(
      "Claude devolvió un array de archivos vacío sin reportar error. " +
      "Posible prompt insuficiente o restricción no documentada.",
      ERROR_CODES.RESPONSE_EMPTY_FILES
    );
  }
 
  // ── File count limit ──
  if (parsed.files.length > MAX_FILE_COUNT) {
    throw createCodedError(
      `Claude generó ${parsed.files.length} archivos (máximo: ${MAX_FILE_COUNT}). ` +
      `Esto sugiere un prompt demasiado amplio o un gancho mal definido.`,
      ERROR_CODES.RESPONSE_FILE_VALIDATION
    );
  }
 
  // ── Validate each file entry ──
  for (let i = 0; i < parsed.files.length; i++) {
    const file = parsed.files[i];
 
    if (!file || typeof file !== "object") {
      throw createCodedError(
        `files[${i}] no es un objeto válido.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
    if (typeof file.path !== "string" || file.path.trim() === "") {
      throw createCodedError(
        `files[${i}].path está vacío o no es un string.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
    if (typeof file.content !== "string") {
      throw createCodedError(
        `files[${i}].content no es un string.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
 
    // ── Path safety (first line of defense — hookPathPolicy does full check) ──
    if (file.path.startsWith("/")) {
      throw createCodedError(
        `files[${i}].path es absoluto ("${file.path}") — debe ser relativo.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
    if (file.path.includes("..")) {
      throw createCodedError(
        `files[${i}].path contiene ".." ("${file.path}") — path traversal bloqueado.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
 
    // ── File size limit (200KB per file) ──
    if (file.content.length > MAX_FILE_SIZE_BYTES) {
      throw createCodedError(
        `files[${i}] ("${file.path}") tiene ${file.content.length} caracteres ` +
        `(máximo: ${MAX_FILE_SIZE_BYTES}). Archivo sospechosamente grande.`,
        ERROR_CODES.RESPONSE_FILE_VALIDATION
      );
    }
  }
 
  return { files: parsed.files };
}
 
// ── Public API ──────────────────────────────────────────────────────────
 
/**
 * Generates hook code by calling the Anthropic API with a user prompt
 * built by promptBuilder.ts (Pieza A.3).
 *
 * Design note: this function takes ONLY the user prompt. The allowed path
 * prefix, hook type, and lead-specific data are all embedded in the prompt
 * by promptBuilder.ts before this function is called. This keeps
 * anthropicClient as a pure "call API + parse response" module with no
 * knowledge of Immersphere business logic.
 *
 * @param userPrompt - The complete prompt built by promptBuilder.ts.
 *
 * @returns ClaudeGenerationResult with files, usage metadata, and stop_reason.
 *   If Claude reports a controlled error, result.error is set and files is [].
 *
 * @throws Error with .code property for all failure cases:
 *   - ANTHROPIC_API_KEY_NOT_CONFIGURED
 *   - ANTHROPIC_API_UNAUTHORIZED (401)
 *   - ANTHROPIC_API_RATE_LIMITED (429 after retries)
 *   - ANTHROPIC_API_OVERLOADED (529 after retries)
 *   - ANTHROPIC_API_TIMEOUT
 *   - ANTHROPIC_API_HTTP_ERROR (other status codes)
 *   - ANTHROPIC_RESPONSE_TRUNCATED (stop_reason: max_tokens)
 *   - ANTHROPIC_RESPONSE_NO_MARKERS
 *   - ANTHROPIC_RESPONSE_INVALID_JSON
 *   - ANTHROPIC_RESPONSE_INVALID_FORMAT
 *   - ANTHROPIC_RESPONSE_EMPTY_FILES
 *   - ANTHROPIC_RESPONSE_FILE_VALIDATION
 */
export async function generateHookCode(
  userPrompt: string
): Promise<ClaudeGenerationResult> {
  const startTime = Date.now();
 
  logInfo("anthropic_generate_hook_start", {
    promptLength: userPrompt.length,
    model: getModelId(),
    maxTokens: getMaxTokens(),
    temperature: getTemperature(),
  });
 
  const { text, model, inputTokens, outputTokens, stopReason } =
    await callAnthropicRaw(userPrompt);
 
  const { files, error } = extractFilesFromResponse(text, stopReason);
 
  const durationMs = Date.now() - startTime;
 
  if (error) {
    logWarn("anthropic_generate_hook_controlled_error", {
      error,
      errorCode: ERROR_CODES.GENERATION_CONTROLLED_ERROR,
      model,
      inputTokens,
      outputTokens,
      stopReason,
      durationMs,
    });
    return {
      files: [],
      error,
      errorCode: ERROR_CODES.GENERATION_CONTROLLED_ERROR,
      model,
      inputTokens,
      outputTokens,
      durationMs,
      stopReason,
    };
  }
 
  logInfo("anthropic_generate_hook_success", {
    fileCount: files.length,
    totalContentLength: files.reduce((sum, f) => sum + f.content.length, 0),
    filePaths: files.map((f) => f.path),
    model,
    inputTokens,
    outputTokens,
    stopReason,
    durationMs,
  });
 
  return { files, model, inputTokens, outputTokens, durationMs, stopReason };
}
 
/**
 * Validates that the API key is configured and reachable, without generating
 * any content. Makes a minimal API call (1 token) to verify authentication.
 *
 * WARNING: this function makes a REAL API call that costs money (minimal,
 * but non-zero). Do NOT use in automated health checks, periodic cron jobs,
 * or any loop. Use ONLY for one-off manual verification (e.g., after
 * configuring a new API key, or in a staging preflight check).
 */
export async function validateAnthropicConnection(): Promise<{
  ok: boolean;
  error?: string;
  errorCode?: string;
  model?: string;
}> {
  try {
    const apiKey = getApiKey();
    const model = getModelId();
 
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
 
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: "user", content: "Respond with OK" }],
        }),
      });
 
      if (response.status === 401) {
        return {
          ok: false,
          error: "API key inválida o expirada (401)",
          errorCode: ERROR_CODES.API_UNAUTHORIZED,
        };
      }
      if (response.status === 429) {
        return {
          ok: false,
          error: "Rate limited (429) — key válida pero demasiadas peticiones",
          errorCode: ERROR_CODES.API_RATE_LIMITED,
        };
      }
      if (response.status === 529) {
        return {
          ok: false,
          error: "Anthropic overloaded (529) — intentar más tarde",
          errorCode: ERROR_CODES.API_OVERLOADED,
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: `Anthropic respondió con status ${response.status}`,
          errorCode: ERROR_CODES.API_HTTP_ERROR,
        };
      }
 
      const data = await response.json();
      return { ok: true, model: data.model ?? model };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout conectando con Anthropic API (10s)",
        errorCode: ERROR_CODES.API_TIMEOUT,
      };
    }
    const coded = (err as any)?.code;
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      errorCode: coded || ERROR_CODES.API_HTTP_ERROR,
    };
  }
}
