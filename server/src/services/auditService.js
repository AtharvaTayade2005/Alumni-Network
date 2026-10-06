import { query } from '../config/database.js'
import logger from '../utils/logger.js'

/**
 * Audit trail reader/writer.
 *
 * The specification names the audited target fields targetType, targetId and
 * timestamp. The schema stores them under entity_type/entity_id/created_at and
 * migration 014 exposes the specification names as generated aliases, so rows
 * are read back through those aliases and shaped with the specification's
 * casing.
 */

// Metadata is free-form, so a defensive whitelist keeps card numbers, CVVs and
// tokens out of the audit trail even when every caller passes good data.
const SECRET_KEY_PATTERN = /(card|cvv|number|number_last4|pan|token|secret|password|credit.?card)/i
const SAFE_METADATA_SHUFFLE = (metadata) => {
  if (!metadata) return null
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const safe = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) continue
    if (value !== undefined) safe[key] = value
  }
  return safe
}

/** The wire shape of an audit row: specification fields plus actor. */
export function formatAuditRow(row) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type ?? row.entity_type,
    targetId: row.target_id ?? row.entity_id,
    timestamp: row.timestamp ?? row.created_at,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          name: row.actor_name ?? null,
          email: row.actor_email ?? null,
        }
      : null,
  }
}

/**
 * Writes an audit record. Never throws: a logging failure must not break the
 * request that triggered it, but it is logged loudly.
 */
export async function record({
  actorId = null, action, entityType, entityId = null,
  metadata = null, context = {},
}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (actor_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        actorId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        JSON.stringify(SAFE_METADATA_SHUFFLE(metadata)),
        context.ip ?? null,
        context.userAgent ? String(context.userAgent).slice(0, 300) : null,
      ],
    )
  } catch (error) {
    logger.error('audit write failed', { action, entityType, error: error.message })
  }
}

export async function list({ limit, offset, action, entityType, actorId, from, to }) {
  const conditions = []
  const params = []
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  if (action) conditions.push(`action = ${add(action.toUpperCase())}`)
  if (entityType) conditions.push(`entity_type = ${add(entityType)}`)
  if (actorId) conditions.push(`actor_id = ${add(actorId)}::UUID`)
  if (from) conditions.push(`created_at >= ${add(from)}::TIMESTAMPTZ`)
  if (to) conditions.push(`created_at <= ${add(to)}::TIMESTAMPTZ`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitP = add(limit)
  const offsetP = add(offset)

  const { rows } = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata,
            a.ip_address, a.user_agent, a.created_at, a.actor_id,
            a.target_type, a.target_id, a."timestamp",
            u.first_name || ' ' || u.last_name AS actor_name,
            u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  )

  const countParams = params.slice(0, params.length - 2)
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`,
    countParams,
  )

  return {
    rows: rows.map(formatAuditRow),
    total: countRows[0].total,
  }
}

export async function forEntity(entityType, entityId) {
  const { rows } = await query(
    `SELECT a.*, u.first_name || ' ' || u.last_name AS actor_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.entity_type = $1 AND a.entity_id = $2
     ORDER BY a.created_at DESC LIMIT 100`,
    [entityType, String(entityId)],
  )
  return rows.map(formatAuditRow)
}
