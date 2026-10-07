import { query } from '../config/database.js'

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
}

export function formatReport(row) {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name ?? null,
    reporterEmail: row.reporter_email ?? null,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    description: row.description,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewer_name ?? null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function verifyTargetExists(targetType, targetId) {
  let table = null
  switch (targetType) {
    case 'user':
      table = 'users'
      break
    case 'job':
      table = 'jobs'
      break
    case 'event':
      table = 'events'
      break
    case 'message':
      table = 'messages'
      break
    case 'company':
      table = 'companies'
      break
    case 'report':
      table = 'reports'
      break
    default:
      return false
  }

  const { rows } = await query(`SELECT id FROM ${table} WHERE id = $1 LIMIT 1`, [targetId])
  return rows.length > 0
}

export async function createReport(reporterId, data, now = new Date()) {
  const description = data.description ?? data.details ?? null
  const { rows } = await query(
    `INSERT INTO reports
       (reporter_id, target_type, target_id, reason, description, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING *`,
    [
      reporterId,
      data.targetType,
      data.targetId,
      data.reason,
      description,
      REPORT_STATUS.PENDING,
      now,
    ],
  )
  return formatReport(rows[0])
}

export async function findReportById(id) {
  const { rows } = await query(
    `SELECT r.*,
            u.first_name || ' ' || u.last_name AS reporter_name,
            u.email AS reporter_email,
            rev.first_name || ' ' || rev.last_name AS reviewer_name
     FROM reports r
     LEFT JOIN users u ON u.id = r.reporter_id
     LEFT JOIN users rev ON rev.id = r.reviewed_by
     WHERE r.id = $1`,
    [id],
  )
  return rows[0] ? formatReport(rows[0]) : null
}

export async function listReports({ status, targetType, limit = 20, offset = 0 } = {}) {
  const conditions = []
  const params = []
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  if (status) conditions.push(`r.status = ${add(status.toUpperCase())}`)
  if (targetType) conditions.push(`r.target_type = ${add(targetType)}`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitP = add(limit)
  const offsetP = add(offset)

  const { rows } = await query(
    `SELECT r.*,
            u.first_name || ' ' || u.last_name AS reporter_name,
            u.email AS reporter_email,
            rev.first_name || ' ' || rev.last_name AS reviewer_name
     FROM reports r
     LEFT JOIN users u ON u.id = r.reporter_id
     LEFT JOIN users rev ON rev.id = r.reviewed_by
     ${where}
     ORDER BY r.created_at DESC
     LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  )

  const countParams = params.slice(0, params.length - 2)
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM reports r ${where}`,
    countParams,
  )

  return {
    reports: rows.map(formatReport),
    total: countRows[0].total,
  }
}

export async function updateReport(id, patch, now = new Date()) {
  const { rows } = await query(
    `UPDATE reports
        SET status = COALESCE($2, status),
            reviewed_by = COALESCE($3, reviewed_by),
            reviewed_at = COALESCE($4, reviewed_at),
            description = COALESCE($5, description),
            updated_at = $6
      WHERE id = $1
      RETURNING *`,
    [
      id,
      patch.status ?? null,
      patch.reviewedBy ?? null,
      patch.reviewedAt ?? null,
      patch.description ?? null,
      now,
    ],
  )
  return rows[0] ? findReportById(id) : null
}

export async function createModerationAction(moderatorId, data, now = new Date()) {
  const { rows } = await query(
    `INSERT INTO moderation_actions
       (moderator_id, action, target_type, target_id, reason, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      moderatorId,
      data.action,
      data.targetType,
      data.targetId,
      data.reason,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
    ],
  )
  return rows[0]
}

export async function setContentModeration(targetType, targetId, actorId, reason, now = new Date()) {
  const { rows } = await query(
    `INSERT INTO content_moderation (target_type, target_id, actor_id, reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (target_type, target_id)
     DO UPDATE SET actor_id = EXCLUDED.actor_id,
                   reason = EXCLUDED.reason,
                   updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [targetType, targetId, actorId, reason, now],
  )
  return rows[0]
}

export async function removeContentModeration(targetType, targetId) {
  const { rowCount } = await query(
    `DELETE FROM content_moderation WHERE target_type = $1 AND target_id = $2`,
    [targetType, targetId],
  )
  return rowCount > 0
}

export async function getContentModeration(targetType, targetId) {
  const { rows } = await query(
    `SELECT * FROM content_moderation WHERE target_type = $1 AND target_id = $2`,
    [targetType, targetId],
  )
  return rows[0] ?? null
}
