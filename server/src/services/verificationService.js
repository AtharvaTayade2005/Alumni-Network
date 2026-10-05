import { query, withTransaction } from '../config/database.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'

/**
 * Alumni verification.
 *
 * Verified status is a claim that a person really graduated, so it is granted by
 * an administrator and never by the account holder. The state lives on
 * alumni_profiles for fast filtering; alumni_verification_events records who
 * decided what and when, so an approval can be traced to its reviewer and a
 * rejection keeps the reason it was refused.
 *
 * The column stores the lower-case vocabulary that migration 001 constrained
 * ('pending' | 'verified' | 'rejected'). The specification names the states
 * PENDING / VERIFIED / REJECTED, so the two spellings are translated at the API
 * boundary rather than by migrating the constraint, which other phases already
 * compare against.
 */

const STORED = { PENDING: 'pending', VERIFIED: 'verified', REJECTED: 'rejected' }
const API = { pending: 'PENDING', verified: 'VERIFIED', rejected: 'REJECTED' }

export function toApiStatus(status) {
  return API[status] ?? 'PENDING'
}

export function fromApiStatus(status) {
  const key = String(status ?? '').toUpperCase()
  if (!STORED[key]) {
    throw badRequest(
      `Verification status must be one of: ${Object.keys(STORED).join(', ')}`,
    )
  }
  return STORED[key]
}

/**
 * Records a decision and moves the profile in one transaction, so the audit
 * trail can never disagree with the current state. The status transition is
 * guarded with WHERE so two administrators reviewing at once cannot both win.
 */
export async function decide({ userId, status, reviewerId, reason = null }) {
  const next = fromApiStatus(status)
  const action = next === STORED.VERIFIED ? 'verified'
    : next === STORED.REJECTED ? 'rejected' : 'submitted'

  if (action === 'rejected' && !String(reason ?? '').trim()) {
    throw badRequest('A reason is required when rejecting a verification request')
  }

  return withTransaction(async (client) => {
    const current = await client.query(
      'SELECT verification_status FROM alumni_profiles WHERE user_id = $1 FOR UPDATE',
      [userId],
    )
    if (!current.rows[0]) throw notFound('Alumni profile')

    const previous = current.rows[0].verification_status
    if (previous === next && action !== 'submitted') {
      throw conflict(`This alumni profile is already ${toApiStatus(next)}`)
    }

    const updated = await client.query(
      `UPDATE alumni_profiles
          SET verification_status = $2,
              verified_by = $3,
              verified_at = NOW(),
              verification_notes = $4
        WHERE user_id = $1
        RETURNING user_id, verification_status, verified_by, verified_at,
                  verification_notes`,
      [userId, next, reviewerId ?? null, reason ?? null],
    )

    await client.query(
      `INSERT INTO alumni_verification_events
         (user_id, action, previous_status, new_status, reviewer_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, previous, next, reviewerId ?? null, reason ?? null],
    )

    return updated.rows[0]
  })
}

/** Records that an alumni member submitted their details for review. */
export async function submitForReview(userId) {
  const existing = await query(
    'SELECT 1 FROM alumni_profiles WHERE user_id = $1', [userId],
  )
  if (!existing.rows[0]) throw notFound('Alumni profile')
  return decide({ userId, status: 'PENDING', reviewerId: null })
}

/**
 * Profiles awaiting review, oldest first so the queue is worked in the order it
 * arrived. Counted in the same statement as the page to keep this to one round
 * trip.
 */
export async function listPending({ limit, offset, search }) {
  const params = []
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  const where = [`ap.verification_status = 'pending'`, 'u.is_suspended = FALSE']
  if (search) {
    const p = add(`%${search}%`)
    where.push(`(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p}
      OR (u.first_name || ' ' || u.last_name) ILIKE ${p}
      OR u.email ILIKE ${p}
      OR ap.student_id_number ILIKE ${p})`)
  }
  const clause = where.join(' AND ')

  const { rows } = await query(
    `SELECT ap.user_id, ap.graduation_year, ap.degree, ap.major,
            ap.university, ap.department, ap.student_id_number,
            u.first_name, u.last_name, u.email, u.created_at,
            (SELECT COUNT(*)::int FROM alumni_verification_events e
              WHERE e.user_id = ap.user_id) AS review_count
       FROM alumni_profiles ap
       JOIN users u ON u.id = ap.user_id
      WHERE ${clause}
      ORDER BY u.created_at ASC
      LIMIT ${add(limit)} OFFSET ${add(offset)}`,
    params,
  )

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
       FROM alumni_profiles ap
       JOIN users u ON u.id = ap.user_id
      WHERE ${clause}`,
    params.slice(0, params.length - 2),
  )

  return { rows, total: countRows[0].total }
}

/**
 * Everything a reviewer needs for one decision, including the full history of
 * earlier decisions. Admin-only: this deliberately returns the email address and
 * the submitted student id, which the public profile view withholds.
 */
export async function getReviewDetail(userId) {
  const { rows } = await query(
    `SELECT ap.user_id, ap.graduation_year, ap.degree, ap.major, ap.department,
            ap.university, ap.student_id_number, ap.verification_status,
            ap.verified_by, ap.verified_at, ap.verification_notes,
            ap.created_at AS submitted_at,
            u.first_name, u.last_name, u.email, u.is_email_verified,
            u.account_status,
            (SELECT COUNT(*)::int FROM education ed WHERE ed.user_id = ap.user_id)
              AS education_count,
            (SELECT COUNT(*)::int FROM experience ex WHERE ex.user_id = ap.user_id)
              AS experience_count
       FROM alumni_profiles ap
       JOIN users u ON u.id = ap.user_id
      WHERE ap.user_id = $1`,
    [userId],
  )
  if (!rows[0]) throw notFound('Alumni profile')

  const { rows: history } = await query(
    `SELECT e.action, e.previous_status, e.new_status, e.reason, e.created_at,
            e.reviewer_id,
            COALESCE(r.first_name || ' ' || r.last_name, 'System') AS reviewer_name
       FROM alumni_verification_events e
       LEFT JOIN users r ON r.id = e.reviewer_id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC`,
    [userId],
  )

  const { rows: education } = await query(
    `SELECT institution, degree, field_of_study, field, start_year, end_year
       FROM education WHERE user_id = $1
      ORDER BY COALESCE(end_year, 9999) DESC`,
    [userId],
  )

  return {
    profile: rows[0],
    history: history.map((h) => ({
      ...h,
      previousStatus: h.previous_status ? toApiStatus(h.previous_status) : null,
      newStatus: toApiStatus(h.new_status),
    })),
    education,
  }
}

export async function listHistory(userId, limit = 50) {
  const { rows } = await query(
    `SELECT e.action, e.previous_status, e.new_status, e.reason, e.created_at,
            COALESCE(r.first_name || ' ' || r.last_name, 'System') AS reviewer_name
       FROM alumni_verification_events e
       LEFT JOIN users r ON r.id = e.reviewer_id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [userId, limit],
  )
  return rows.map((h) => ({
    ...h,
    previousStatus: h.previous_status ? toApiStatus(h.previous_status) : null,
    newStatus: toApiStatus(h.new_status),
  }))
}

/**
 * Alumni are only "verified alumni" while their account is in good standing, so
 * an account that is suspended or deactivated loses the privilege even though its
 * verification row still reads 'verified'.
 */
export async function isVerifiedAlumni(userId) {
  const { rows } = await query(
    `SELECT 1 FROM alumni_profiles ap
       JOIN users u ON u.id = ap.user_id
      WHERE ap.user_id = $1
        AND ap.verification_status = 'verified'
        AND u.is_active = TRUE
        AND u.is_suspended = FALSE`,
    [userId],
  )
  return rows.length > 0
}

export const VERIFICATION_STATES = Object.keys(STORED)