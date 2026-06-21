/**
 * Sanitizes a Production Package coming from the CRM before it is used by
 * backend processing. The CRM may mark hooks as "published" because the
 * operator registered public URLs in the UI, but those URLs are not verified
 * with HTTP 200. To avoid rejecting a real package, we neutralize the UI
 * publication flags while preserving all commercial data.
 */

function sanitizeReviewableHook(hook: Record<string, unknown>): Record<string, unknown> {
  if (!hook || typeof hook !== "object") return hook;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hook)) {
    if (["generated", "published", "publicationStatus"].includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export function sanitizeProductionPackageForPrAutomation(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return payload;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (["publicationStatus", "publishedOutputCount", "generatedReviewCount", "publicationWarnings"].includes(key)) {
      continue;
    }
    if (key === "reviewableFourHooks" && Array.isArray(value)) {
      clean[key] = value.map((item) => sanitizeReviewableHook(item as Record<string, unknown>));
      continue;
    }
    clean[key] = value;
  }
  return clean;
}
