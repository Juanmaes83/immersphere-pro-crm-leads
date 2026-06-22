// Fase 8E: Persisted State Aggregator. Pure read-side composition - calls
// the existing getLatest*/getHistory functions from each Fase 8A-8E module
// and assembles one response. Never generates new hooks: fourHooks /
// outreachMessages are read verbatim from the latest persisted
// ProductionPackage's packagePayload, exactly as already generated and
// saved by the CRM (Fase 8D). If no package exists yet, both come back
// null so the frontend can prompt the operator to regenerate locally -
// this module never fabricates them.
import { getLatestAuditRun } from "./crmPersistence.ts";
import { getLatestEnrichmentProfile } from "./crmEnrichmentPersistence.ts";
import { getLatestApprovedMediaAssets } from "./crmAssetsPersistence.ts";
import { getLatestProductionPackage } from "./crmProductionPackagePersistence.ts";
import { getCommercialActionsHistory } from "./crmCommercialActionsPersistence.ts";

export async function getPersistedStateForLead(leadId) {
  const [latestAuditRun, latestEnrichmentProfile, approvedAssets, latestProductionPackage, latestCommercialActions] = await Promise.all([
    getLatestAuditRun(leadId),
    getLatestEnrichmentProfile(leadId),
    getLatestApprovedMediaAssets(leadId),
    getLatestProductionPackage(leadId),
    getCommercialActionsHistory(leadId, 20),
  ]);

  const packagePayload = latestProductionPackage && latestProductionPackage.packagePayload;
  const fourHooks = (packagePayload && packagePayload.fourHooks) || null;
  const outreachMessages = (packagePayload && packagePayload.outreachMessages) || null;

  return {
    latestAuditRun,
    latestEnrichmentProfile,
    approvedAssets,
    latestProductionPackage,
    fourHooks,
    outreachMessages,
    latestCommercialActions,
    syncStatus: {
      hasAuditRun: !!latestAuditRun,
      hasEnrichmentProfile: !!latestEnrichmentProfile,
      hasApprovedAssets: !!approvedAssets,
      hasProductionPackage: !!latestProductionPackage,
      hasFourHooks: !!fourHooks,
      commercialActionsCount: latestCommercialActions.length,
      // Per-resource timestamps so the frontend can do its own local-vs-remote
      // comparison (the backend has no visibility into localStorage).
      timestamps: {
        auditRun: latestAuditRun ? latestAuditRun.createdAt : null,
        enrichmentProfile: latestEnrichmentProfile ? latestEnrichmentProfile.createdAt : null,
        approvedAssets: approvedAssets ? (approvedAssets.approvedAt || approvedAssets.createdAt) : null,
        productionPackage: latestProductionPackage ? latestProductionPackage.createdAt : null,
      },
    },
  };
}
