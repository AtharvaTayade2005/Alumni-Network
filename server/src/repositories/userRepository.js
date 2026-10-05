import { query } from '../config/database.js'
import { ROLES } from '../middleware/rbac.js'

/**
 * Read-side data access for user management. Keeping the SQL here leaves the
 * service layer free of query text and makes the administrative projections
 * explicit: password hashes are never selected.
 */

const USER_SUMMARY_COLUMNS = `
  u.id, u.email, u.full_name, u.first_name, u.last_name,
  u.account_status, u.is_email_verified, u.last_login_at, u.created_at,
  ARRAY_REMOVE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), NULL) AS roles
`

function buildFilters({ search, role, status }) {
  const conditions = []
  const params = []

  if (search) {
    params.push(`%${search}%`)
    conditions.push(
      `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
    )
  }

  if (role) {
    params.push(role)
    conditions.push(
      `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = u.id AND r.name = $${params.length})`,
    )
  }

  if (status) {
    params.push(status)
    conditions.push(`u.account_status = $${params.length}::account_status`)
  }

  return { conditions, params }
}

export async function listUsers({ search, role, status, limit, offset }) {
  const { conditions, params } = buildFilters({ search, role, status })

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const countParams = [...params]
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM users u ${where}`,
    countParams,
  )

  params.push(limit, offset)
  const { rows } = await query(
    `SELECT ${USER_SUMMARY_COLUMNS}
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  return { rows, total: countRows[0].total }
}

export async function findUserById(id) {
  const { rows } = await query(
    `SELECT ${USER_SUMMARY_COLUMNS}
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [id],
  )
  return rows[0] ?? null
}

export async function countActiveAdmins(excludingUserId) {
  const { rows } = await query(
    `SELECT COUNT(DISTINCT u.id)::int AS total
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = $1 AND u.is_active AND NOT u.is_suspended
       AND u.id <> $2`,
    [ROLES.ADMIN, excludingUserId],
  )
  return rows[0].total
}