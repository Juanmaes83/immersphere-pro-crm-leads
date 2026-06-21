/**
 * Sanitizes a Production Package coming from the CRM before it is used by
 * PR automation. The CRM may mark hooks as "published" because the operator
 * registered public URLs, but those URLs are not verified with HTTP 200.
 * To avoid sending misleading publication state to GitHub, we reset those
 * fields to a clean "pending review" state.
 */
export function sanitizeProductionPackageForPrAutomation(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return payload;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (["publicationStatus", "publishedOutputCount", "generatedReviewCount", "publicationWarnings", "reviewableFourHooks"].includes(key)) {
      continue;
    }
    clean[key] = value;
  }
  clean.publicationStatus = "ready_for_review_pending_publication";
  clean.publishedOutputCount = 0;
  clean.generatedReviewCount = 0;
  clean.publicationWarnings = [];
  clean.reviewableFourHooks = [];
  return clean;
}
