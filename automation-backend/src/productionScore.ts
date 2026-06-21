/**
 * Resolves the canonical production score from a Production Package payload.
 * The CRM may place the real score in different nested locations, so we try
 * them in priority order and fall back to a safe default.
 */

export function resolveProductionScore(payload: Record<string, unknown>): number {
  const candidates = [
    (payload.auditSnapshot as Record<string, unknown>)?.score,
    (payload.audit as Record<string, unknown>)?.score,
    (payload.leadIntelligenceProfile as Record<string, unknown>)?.readinessScore,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 35;
}
