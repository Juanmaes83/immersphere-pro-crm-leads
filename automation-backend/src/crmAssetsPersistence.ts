// Fase 8C: ApprovedMediaAssets persistence only. Stores the manual
// selection exactly as approved by the operator - never downloads,
// re-uploads, or transforms any asset.
import { containsScript, containsSecrets } from "./security.ts";
import { ensureCrmPersistenceSchema, isSafeHttpUrl } from "./crmPersistence.ts";
import { query } from "./db.ts";

const MAX_IMAGE_URLS = 8;

export function validateApprovedMediaAssetsPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload_must_be_object"] };
  }
  if (payload.logoUrl !== undefined && payload.logoUrl !== null && payload.logoUrl !== "" && !isSafeHttpUrl(payload.logoUrl)) {
    errors.push("logoUrl_must_be_http_or_https_url_or_empty");
  }
  if (payload.heroUrl !== undefined && payload.heroUrl !== null && payload.heroUrl !== "" && !isSafeHttpUrl(payload.heroUrl)) {
    errors.push("heroUrl_must_be_http_or_https_url_or_empty");
  }
  const imageUrls = Array.isArray(payload.imageUrls) ? payload.imageUrls : [];
  if (payload.imageUrls !== undefined && (!Array.isArray(payload.imageUrls) || payload.imageUrls.length > MAX_IMAGE_URLS)) {
    errors.push("imageUrls_must_be_array_max_8");
  }
  imageUrls.forEach((url, i) => {
    if (url && !isSafeHttpUrl(url)) errors.push(`imageUrls[${i}]_unsafe_url`);
  });
  if (payload.assetsApproved !== undefined && typeof payload.assetsApproved !== "boolean") {
    errors.push("assetsApproved_must_be_boolean");
  }
  if (payload.assetsApproved === true) {
    if (!payload.logoUrl || !isSafeHttpUrl(payload.logoUrl)) errors.push("assetsApproved_true_requires_logoUrl");
    if (!payload.heroUrl || !isSafeHttpUrl(payload.heroUrl)) errors.push("assetsApproved_true_requires_heroUrl");
    if (!imageUrls.length) errors.push("assetsApproved_true_requires_at_least_1_image");
  }
  if (payload.approvedBy !== undefined && payload.approvedBy !== null) {
    if (typeof payload.approvedBy !== "string" || payload.approvedBy.length > 200) errors.push("approvedBy_invalid");
  }
  if (payload.approvedAt !== undefined && payload.approvedAt !== null) {
    if (typeof payload.approvedAt !== "string" || Number.isNaN(Date.parse(payload.approvedAt))) errors.push("approvedAt_must_be_valid_date_string");
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
    logoUrl: row.logo_url,
    heroUrl: row.hero_url,
    imageUrls: row.image_urls,
    approvedAssets: row.approved_assets,
    assetsApproved: row.assets_approved,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    source: row.source,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertApprovedMediaAssets(leadId, payload) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `INSERT INTO crm_approved_media_assets
      (lead_key, lead_id, logo_url, hero_url, image_urls, approved_assets, assets_approved, approved_at, approved_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      leadKey,
      leadId,
      typeof payload.logoUrl === "string" ? payload.logoUrl : null,
      typeof payload.heroUrl === "string" ? payload.heroUrl : null,
      JSON.stringify(Array.isArray(payload.imageUrls) ? payload.imageUrls : []),
      JSON.stringify(payload.approvedAssets && typeof payload.approvedAssets === "object" ? payload.approvedAssets : {}),
      payload.assetsApproved === true,
      payload.approvedAt && !Number.isNaN(Date.parse(payload.approvedAt)) ? payload.approvedAt : null,
      typeof payload.approvedBy === "string" ? payload.approvedBy : null,
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getLatestApprovedMediaAssets(leadId) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `SELECT * FROM crm_approved_media_assets WHERE lead_key = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadKey],
  );
  return mapRow(result.rows[0]);
}
