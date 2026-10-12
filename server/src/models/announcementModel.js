import { query } from '../config/database.js'

export function formatAnnouncement(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    authorId: row.author_id,
    authorName: row.author_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Faculty Member',
    authorRole: row.author_headline || (row.role ? row.role.toUpperCase() : 'FACULTY'),
    department: row.department,
    targetAudience: row.target_audience,
    targetAudienceLabel: row.target_audience ? row.target_audience.replace(/_/g, ' ') : 'All Members',
    status: row.status,
    isPinned: Boolean(row.is_pinned),
    viewsCount: Number(row.views_count || 0),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAnnouncements({
  status, department, targetAudience, includeDrafts = false, limit = 50, offset = 0, authorId,
} = {}) {
  const conditions = []
  const params = []

  if (status) {
    params.push(status)
    conditions.push(`a.status = $${params.length}`)
  } else if (!includeDrafts) {
    conditions.push(`a.status = 'published'`)
  }

  if (department && department !== 'University-Wide') {
    params.push(department)
    conditions.push(`(a.department = $${params.length} OR a.department = 'University-Wide')`)
  }

  if (targetAudience && targetAudience !== 'ALL') {
    params.push(targetAudience)
    conditions.push(`(a.target_audience = $${params.length} OR a.target_audience = 'ALL')`)
  }

  if (authorId) {
    params.push(authorId)
    conditions.push(`a.author_id = $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)
  const limitIdx = params.length
  params.push(offset)
  const offsetIdx = params.length

  const sql = `
    SELECT a.*,
           u.first_name, u.last_name,
           CONCAT(u.first_name, ' ', u.last_name) AS author_name,
           (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
    FROM announcements a
    JOIN users u ON u.id = a.author_id
    ${where}
    ORDER BY a.is_pinned DESC, a.published_at DESC NULLS LAST, a.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `

  const { rows } = await query(sql, params)
  return rows.map(formatAnnouncement)
}

export async function countAnnouncements({ status, includeDrafts = false } = {}) {
  const conditions = []
  const params = []

  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  } else if (!includeDrafts) {
    conditions.push(`status = 'published'`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await query(`SELECT COUNT(*)::int AS count FROM announcements ${where}`, params)
  return rows[0]?.count ?? 0
}

export async function findAnnouncementById(id) {
  const sql = `
    SELECT a.*,
           u.first_name, u.last_name,
           CONCAT(u.first_name, ' ', u.last_name) AS author_name,
           (SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
    FROM announcements a
    JOIN users u ON u.id = a.author_id
    WHERE a.id = $1
  `
  const { rows } = await query(sql, [id])
  return formatAnnouncement(rows[0])
}

export async function createAnnouncement({
  authorId, title, content, department = 'Computer Science', targetAudience = 'ALL',
  status = 'published', isPinned = false,
}) {
  const publishedAt = status === 'published' ? new Date().toISOString() : null
  const sql = `
    INSERT INTO announcements (
      author_id, title, content, department, target_audience, status, is_pinned, published_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `
  const { rows } = await query(sql, [
    authorId, title, content, department, targetAudience, status, isPinned, publishedAt,
  ])
  return findAnnouncementById(rows[0].id)
}

export async function updateAnnouncement(id, updates) {
  const fields = []
  const params = [id]

  const allowed = ['title', 'content', 'department', 'target_audience', 'status', 'is_pinned']
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      params.push(updates[key])
      fields.push(`${key} = $${params.length}`)
    }
  }

  if (updates.status === 'published') {
    fields.push('published_at = COALESCE(published_at, NOW())')
  }

  fields.push('updated_at = NOW()')

  const sql = `
    UPDATE announcements
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *
  `
  const { rows } = await query(sql, params)
  return formatAnnouncement(rows[0])
}

export async function deleteAnnouncement(id) {
  const { rowCount } = await query('DELETE FROM announcements WHERE id = $1', [id])
  return rowCount > 0
}

export async function incrementViews(id) {
  await query('UPDATE announcements SET views_count = views_count + 1 WHERE id = $1', [id])
}
