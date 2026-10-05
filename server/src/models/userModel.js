import { query } from '../config/database.js'

export const PUBLIC_USER_COLUMNS = `
  u.id, u.email, u.first_name, u.last_name, u.avatar_url,
  u.phone, u.is_email_verified, u.is_active, u.is_suspended,
  u.last_login_at, u.created_at,
  u.full_name, u.account_status
`

export const USER_ROLES_AGG = `
  COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
`

export async function findById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, ${USER_ROLES_AGG}
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [id],
  )
  return rows[0] ?? null
}

export async function findByEmail(email) {
  const { rows } = await query(
    `SELECT u.*, ${USER_ROLES_AGG}
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE LOWER(u.email) = LOWER($1)
     GROUP BY u.id`,
    [email],
  )
  return rows[0] ?? null
}

export async function emailExists(email) {
  const { rows } = await query(
    'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  )
  return rows.length > 0
}

export async function insertUser({ email, passwordHash, firstName, lastName, phone }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [email, passwordHash, firstName, lastName, phone ?? null],
  )
  return rows[0]
}

export async function assignRole(userId, roleName) {
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleName],
  )
}

export async function setPrimaryRole(userId, roleName) {
  await query('DELETE FROM user_roles WHERE user_id = $1', [userId])
  await assignRole(userId, roleName)
}

export async function updateLastLogin(userId) {
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId])
}

export async function recordFailedLogin(userId) {
  await query(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= $2 THEN NOW() + ($3 || ' minutes')::INTERVAL
           ELSE locked_until
         END
     WHERE id = $1`,
    [userId, 5, 15],
  )
}

export async function resetFailedLogins(userId) {
  await query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1',
    [userId],
  )
}

export async function updatePasswordHash(userId, passwordHash) {
  await query(
    `UPDATE users
     SET password_hash = $2, failed_login_count = 0, locked_until = NULL
     WHERE id = $1`,
    [userId, passwordHash],
  )
}

export async function setEmailVerified(userId, verified) {
  await query('UPDATE users SET is_email_verified = $2 WHERE id = $1', [userId, verified])
}

export async function setActive(userId, isActive) {
  await query('UPDATE users SET is_active = $2 WHERE id = $1', [userId, isActive])
}

export async function setSuspended(userId, suspended, reason = null) {
  await query(
    'UPDATE users SET is_suspended = $2, suspension_reason = $3 WHERE id = $1',
    [userId, suspended, reason],
  )
}

export async function updateUserFields(userId, { firstName, lastName, phone, email }) {
  const { rows } = await query(
    `UPDATE users SET
       first_name = COALESCE($2, first_name),
       last_name  = COALESCE($3, last_name),
       phone      = CASE WHEN $4::TEXT IS NULL THEN phone ELSE $4 END,
       email      = COALESCE($5, email)
     WHERE id = $1
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [userId, firstName ?? null, lastName ?? null, phone ?? null, email ?? null],
  )
  return rows[0] ?? null
}

export async function listUsers({ limit, offset, search, role, status }) {
  const conditions = []
  const params = []
  const add = (value) => {
    params.push(value)
    return `$${params.length}`
  }

  if (search) {
    const p = add(`%${search}%`)
    conditions.push(`(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p} OR u.email ILIKE ${p})`)
  }
  if (role) conditions.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND LOWER(r.name) = LOWER(${add(role)}))`)
  if (status === 'active') conditions.push('u.is_active AND NOT u.is_suspended')
  if (status === 'suspended') conditions.push('u.is_suspended')
  if (status === 'inactive') conditions.push('NOT u.is_active')

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitP = add(limit)
  const offsetP = add(offset)

  const { rows } = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}, ${USER_ROLES_AGG}
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  )

  const countParams = params.slice(0, params.length - 2)
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM users u
     ${conditions.length ? where.replace(/\$(\d+)/g, (_, n) => `$${n}`) : ''}`,
    countParams,
  )

  return { rows, total: countRows[0].total }
}
