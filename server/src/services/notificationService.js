import { query } from '../config/database.js'
import { formatPreferences } from '../constants/notificationTypes.js'
import * as mailService from './mailService.js'
import { emitToUsers } from '../sockets/index.js'

/**
 * Maps a stored notification type to the email template that describes it.
 *
 * A type absent from this map still creates its in-app notification but sends no
 * email, which is how the future modules are expected to arrive: add the type to
 * the constraint and to this map, and nothing else needs to change.
 */
const EMAIL_TEMPLATES = {
  mentorship_request: 'mentorship_request',
  mentorship_accepted: 'mentorship_accepted',
  mentorship_declined: 'mentorship_declined',
  mentorship_ended: 'mentorship_ended',
  mentorship_completed: 'mentorship_completed',
  connection_request: 'connection_request',
  connection_accepted: 'connection_accepted',
  event_rsvp: 'event_rsvp',
  event_reminder: 'event_reminder',
  event_cancelled: 'event_cancelled',
  event_updated: 'event_updated',
  job_posted: 'job_posting_decision',
  application_received: 'job_application_received',
  application_status: 'job_application_update',
  new_job_match: 'job_application_update',
  job_application_update: 'job_application_update',
  job_moderated: 'job_posting_decision',
  donation_confirmation: 'donation_receipt',
  verification_result: 'email_verification',
  admin_notice: 'email_verification',
}

/**
 * Creates a notification.
 *
 * `db` is the pg client of a caller's transaction. Passing it writes the
 * notification inside that transaction, so a connection or mentorship state
 * change and the notification describing it cannot disagree: either both land or
 * neither does. Omit it to write on the shared pool, which is only safe when
 * nothing else has to change.
 *
 * The websocket push is deliberately left until after the caller commits. A
 * socket emit is not transactional, so emitting from inside a transaction would
 * tell a client about a row that a later rollback erases.
 *
 * `dedupeKey` is the idempotency guarantee. Two calls carrying the same key
 * produce one notification: the insert is ON CONFLICT DO NOTHING against a
 * partial unique index, so whichever call loses the race stores nothing and is
 * told it stored nothing. A notification with no key is written every time,
 * which is what every Phase 1-4 notification wants — two genuinely distinct
 * things that happen to read alike are still two notifications. A scheduler
 * that may run twice has to pass a key, or it will send twice.
 *
 * Preference handling is unchanged: a user with no preferences row defaults to
 * in-app on and email off, and muted types suppress both the row and the email.
 */
export async function notify({
  userId, type, title, body = null, link = null, actorId = null,
  email = null, emailPayload = null, db = null, dedupeKey = null, metadata = null,
}) {
  if (!userId) return null

  const runner = db ?? { query }

  const { rows: prefRows } = await runner.query(
    'SELECT * FROM notification_preferences WHERE user_id = $1', [userId],
  )
  const pref = prefRows[0]

  const deliverInApp = (!pref || pref.in_app_enabled)
    && !pref?.muted_types?.includes(type)

  let stored = null
  if (deliverInApp) {
    const { rows } = await runner.query(
      `INSERT INTO notifications (user_id, type, title, body, link, actor_id,
         dedupe_key, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING *`,
      [userId, type, title, body, link, actorId, dedupeKey,
        metadata ? JSON.stringify(metadata) : null],
    )
    stored = rows[0]
    // A lost race is not an error: the caller asked for a notification about a
    // fact, and the fact is already on record. Returning null tells it nothing
    // was written, so a scheduler can count what it actually delivered.
  }

  if (email && pref?.email_enabled && !pref?.muted_types?.includes(type) && (!dedupeKey || stored)) {
    const template = EMAIL_TEMPLATES[type]
    if (template) {
      // Each template destructures its own fields, so the caller supplies them
      // via emailPayload rather than the raw notification body.
      await mailService.queueEmail(email, title, template, {
        ...(emailPayload ?? { name: email }),
      }, db)
    }
  }

  // A transactional write is not visible to other sessions until commit, so the
  // push is the caller's responsibility once it has committed.
  if (stored && !db) await emitToUsers([userId], 'notification', formatNotification(stored))

  return stored ? formatNotification(stored) : null
}

/** Emits an already-committed notification to its recipient's sockets. */
export async function emitStored(userId, notification) {
  if (userId && notification) await emitToUsers([userId], 'notification', notification)
}


export function formatNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    actorId: row.actor_id,
    isRead: row.is_read,
    // Whatever the creator attached: an event id, a job id, a thread id. It is
    // what lets a client act on a notification without parsing the link, which
    // is brittle the moment the client changes its routing.
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  }
}

export async function list(userId, { limit = 20, offset = 0, unreadOnly = false, type }) {
  const conditions = ['user_id = $1']
  const params = [userId]

  if (unreadOnly) conditions.push('is_read = FALSE')
  if (type) {
    params.push(type)
    conditions.push(`type = $${params.length}`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const { rows } = await query(
    `SELECT * FROM notifications ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT is_read)::int AS unread
     FROM notifications ${where}`,
    params,
  )

  return {
    rows: rows.map(formatNotification),
    total: countRows[0].total,
    unread: countRows[0].unread,
  }
}

export async function unreadCount(userId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND NOT is_read',
    [userId],
  )
  return rows[0].c
}

export async function markRead(userId, notificationId) {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
    [notificationId, userId],
  )
  return rowCount > 0
}

export async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND NOT is_read',
    [userId],
  )
  return rowCount
}

export async function remove(userId, notificationId) {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2', [notificationId, userId],
  )
  return rowCount > 0
}

export async function getPreferences(userId) {
  const { rows } = await query(
    `INSERT INTO notification_preferences (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId],
  )
  return formatPreferences(rows[0])
}

export async function updatePreferences(userId, data) {
  await getPreferences(userId)
  const { rows } = await query(
    `UPDATE notification_preferences SET
       email_enabled = COALESCE($2, email_enabled),
       in_app_enabled = COALESCE($3, in_app_enabled),
       muted_types = COALESCE($4, muted_types)
     WHERE user_id = $1 RETURNING *`,
    [userId, data.emailEnabled ?? null, data.inAppEnabled ?? null,
      data.mutedTypes ?? null],
  )
  return formatPreferences(rows[0])
}
