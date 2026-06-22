// Fase 8B: EnrichmentProfile persistence only. Reuses the auth/schema/URL
// helpers already established in crmPersistence.ts (Fase 8A) instead of
// duplicating them.
import { containsScript, containsSecrets } from "./security.ts";
import { ensureCrmPersistenceSchema, isSafeHttpUrl } from "./crmPersistence.ts";
import { query } from "./db.ts";

const MAX_ARRAY_LENGTH = 100;

function arr(v) {
  return Array.isArray(v) ? v : [];
}
function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function urlOf(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") return item.value || item.url || null;
  return null;
}

function validateUrlArray(payload, key, errors) {
  const v = payload[key];
  if (v === undefined) return;
  if (!Array.isArray(v) || v.length > MAX_ARRAY_LENGTH) {
    errors.push(`${key}_must_be_array_within_limit`);
    return;
  }
  v.forEach((item, i) => {
    const url = urlOf(item);
    if (url && !isSafeHttpUrl(url)) errors.push(`${key}[${i}]_unsafe_url`);
  });
}

function validatePlainArray(payload, key, errors) {
  const v = payload[key];
  if (v !== undefined && (!Array.isArray(v) || v.length > MAX_ARRAY_LENGTH)) {
    errors.push(`${key}_must_be_array_within_limit`);
  }
}

export function validateEnrichmentProfilePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload_must_be_object"] };
  }
  if (payload.website !== undefined && payload.website !== null && payload.website !== "" && !isSafeHttpUrl(payload.website)) {
    errors.push("website_must_be_http_or_https_url_or_empty");
  }
  if (payload.webHasWhatsapp !== undefined && payload.webHasWhatsapp !== null && typeof payload.webHasWhatsapp !== "boolean") {
    errors.push("webHasWhatsapp_must_be_boolean");
  }
  if (payload.crmHasWhatsapp !== undefined && payload.crmHasWhatsapp !== null && typeof payload.crmHasWhatsapp !== "boolean") {
    errors.push("crmHasWhatsapp_must_be_boolean");
  }
  validateUrlArray(payload, "whatsappLinks", errors);
  validateUrlArray(payload, "socialLinks", errors);
  validateUrlArray(payload, "videoLinks", errors);
  validateUrlArray(payload, "documentLinks", errors);
  ["emails", "phones", "forms", "contactPages", "propertyPages", "logoCandidates", "imageCandidates", "contactSignals", "warnings"].forEach((key) => {
    validatePlainArray(payload, key, errors);
  });
  if (payload.pagesReviewed !== undefined && payload.pagesReviewed !== null && !Number.isInteger(payload.pagesReviewed)) {
    errors.push("pagesReviewed_must_be_integer_or_null");
  }
  if (payload.confidence !== undefined && payload.confidence !== null) {
    if (typeof payload.confidence !== "string" || payload.confidence.length > 200) errors.push("confidence_invalid");
  }
  if (containsScript(payload)) errors.push("payload_contains_script");
  if (containsSecrets(payload)) errors.push("payload_contains_secret_like_value");
  return { valid: errors.length === 0, errors };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadKey: row.lead_key,
    leadId: row.lead_id,
    auditRunId: row.audit_run_id,
    website: row.website,
    webHasWhatsapp: row.web_has_whatsapp,
    crmHasWhatsapp: row.crm_has_whatsapp,
    whatsappLinks: row.whatsapp_links,
    emails: row.emails,
    phones: row.phones,
    socialLinks: row.social_links,
    videoLinks: row.video_links,
    documentLinks: row.document_links,
    forms: row.forms,
    contactPages: row.contact_pages,
    propertyPages: row.property_pages,
    pagesReviewed: row.pages_reviewed,
    pageDiscovery: row.page_discovery,
    logoCandidates: row.logo_candidates,
    imageCandidates: row.image_candidates,
    contactSignals: row.contact_signals,
    warnings: row.warnings,
    confidence: row.confidence,
    rawEnrichmentProfile: row.raw_enrichment_profile,
    schemaVersion: row.schema_version,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertEnrichmentProfile(leadId, payload) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `INSERT INTO crm_enrichment_profiles
      (lead_key, lead_id, audit_run_id, website, web_has_whatsapp, crm_has_whatsapp, whatsapp_links, emails, phones,
       social_links, video_links, document_links, forms, contact_pages, property_pages, pages_reviewed,
       page_discovery, logo_candidates, image_candidates, contact_signals, warnings, confidence, raw_enrichment_profile)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [
      leadKey,
      leadId,
      Number.isInteger(payload.auditRunId) ? payload.auditRunId : null,
      typeof payload.website === "string" ? payload.website : null,
      typeof payload.webHasWhatsapp === "boolean" ? payload.webHasWhatsapp : null,
      typeof payload.crmHasWhatsapp === "boolean" ? payload.crmHasWhatsapp : null,
      JSON.stringify(arr(payload.whatsappLinks)),
      JSON.stringify(arr(payload.emails)),
      JSON.stringify(arr(payload.phones)),
      JSON.stringify(arr(payload.socialLinks)),
      JSON.stringify(arr(payload.videoLinks)),
      JSON.stringify(arr(payload.documentLinks)),
      JSON.stringify(arr(payload.forms)),
      JSON.stringify(arr(payload.contactPages)),
      JSON.stringify(arr(payload.propertyPages)),
      Number.isInteger(payload.pagesReviewed) ? payload.pagesReviewed : null,
      JSON.stringify(obj(payload.pageDiscovery)),
      JSON.stringify(arr(payload.logoCandidates)),
      JSON.stringify(arr(payload.imageCandidates)),
      JSON.stringify(arr(payload.contactSignals)),
      JSON.stringify(arr(payload.warnings)),
      typeof payload.confidence === "string" ? payload.confidence : null,
      JSON.stringify(obj(payload.rawEnrichmentProfile)),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getLatestEnrichmentProfile(leadId) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `SELECT * FROM crm_enrichment_profiles WHERE lead_key = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadKey],
  );
  return mapRow(result.rows[0]);
}
