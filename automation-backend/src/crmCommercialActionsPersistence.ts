// Fase 8E/8F/8G/8H: commercial action log only. Records that an outreach
// action happened (copied/opened/marked sent) - never sends anything
// itself. Reuses the same auth/schema/safety helpers as the other
// persistence modules.
import { containsScript, containsSecrets } from "./security.ts";
import { ensureCrmPersistenceSchema } from "./crmPersistence.ts";
import { query } from "./db.ts";

const MAX_STRING_LENGTH = 8000;
const MAX_HISTORY_LIMIT = 50;
const ALLOWED_ACTION_TYPES = ["copied_whatsapp", "copied_email", "opened_whatsapp", "opened_email", "sent_manual", "followup_needed"];

function isShortString(v, max) {
  return v === undefined || v === null || (typeof v === "string" && v.length <= max);
}

export function validateCommercialActionPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload_must_be_object"] };
  }
  if (typeof payload.actionType !== "string" || !ALLOWED_ACTION_TYPES.includes(payload.actionType)) {
    errors.push("actionType_must_be_one_of_" + ALLOWED_ACTION_TYPES.join("|"));
  }
  if (!isShortString(payload.hookId, 200)) errors.push("hookId_invalid");
  if (!isShortString(payload.hookType, 200)) errors.push("hookType_invalid");
  if (!isShortString(payload.channel, 100)) errors.push("channel_invalid");
  if (!isShortString(payload.status, 100)) errors.push("status_invalid");
  if (!isShortString(payload.messageSnapshot, MAX_STRING_LENGTH)) errors.push("messageSnapshot_too_long");
  if (!isShortString(payload.emailSubjectSnapshot, MAX_STRING_LENGTH)) errors.push("emailSubjectSnapshot_too_long");
  if (!isShortString(payload.emailBodySnapshot, MAX_STRING_LENGTH)) errors.push("emailBodySnapshot_too_long");
  if (payload.metadata !== undefined && payload.metadata !== null && typeof payload.metadata !== "object") {
    errors.push("metadata_must_be_object");
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
    hookId: row.hook_id,
    hookType: row.hook_type,
    actionType: row.action_type,
    channel: row.channel,
    status: row.status,
    messageSnapshot: row.message_snapshot,
    emailSubjectSnapshot: row.email_subject_snapshot,
    emailBodySnapshot: row.email_body_snapshot,
    metadata: row.metadata,
    source: row.source,
    createdAt: row.created_at,
  };
}

export async function insertCommercialAction(leadId, payload) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const result = await query(
    `INSERT INTO crm_commercial_actions
      (lead_key, lead_id, hook_id, hook_type, action_type, channel, status, message_snapshot, email_subject_snapshot, email_body_snapshot, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      leadKey,
      leadId,
      typeof payload.hookId === "string" ? payload.hookId : null,
      typeof payload.hookType === "string" ? payload.hookType : null,
      payload.actionType,
      typeof payload.channel === "string" ? payload.channel : null,
      typeof payload.status === "string" ? payload.status : "recorded",
      typeof payload.messageSnapshot === "string" ? payload.messageSnapshot : null,
      typeof payload.emailSubjectSnapshot === "string" ? payload.emailSubjectSnapshot : null,
      typeof payload.emailBodySnapshot === "string" ? payload.emailBodySnapshot : null,
      JSON.stringify(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
    ],
  );
  return mapRow(result.rows[0]);
}

export async function getCommercialActionsHistory(leadId, limit = 20) {
  await ensureCrmPersistenceSchema();
  const leadKey = `seed:${leadId}`;
  const safeLimit = Math.min(Math.max(Number.isInteger(limit) ? limit : 20, 1), MAX_HISTORY_LIMIT);
  const result = await query(
    `SELECT * FROM crm_commercial_actions WHERE lead_key = $1 ORDER BY created_at DESC LIMIT $2`,
    [leadKey, safeLimit],
  );
  return result.rows.map(mapRow);
}
