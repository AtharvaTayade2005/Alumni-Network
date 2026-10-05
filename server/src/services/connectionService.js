import { query, withTransaction } from '../config/database.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'
import * as notificationService from './notificationService.js'
import * as userModel from '../models/userModel.js'
import * as profileModel from '../models/profileModel.js'

/**
 * Connections between members.
 *
 * A pair of users has at most one `connections` row, held unique by the symmetric
 * index added in migration 003. That single row carries the relationship and the
 * direction of the last action, so `direction` below is derived from the viewer
 * rather than stored.
 *
 * Blocking reuses the same row with status 'blocked' and rewrites requester_id to
 * be the blocker (see migration 011). Both sides therefore read 'blocked', which
 * is deliberate: the blocked user must not learn that they were blocked.
 */

/** Storage is lowercase; the API contract is uppercase, as in Phase 2 verification. */
const API_STATES = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
  blocked: 'BLOCKED',
}

/**
 * Accepts a state filter in either casing.
 *
 * The uppercase form is what the API documents, but the lowercase form is what
 * earlier clients and the existing test suite send, so both are honoured rather
 * than making one of them a breaking change.
 */
function normaliseState(value) {
  if (value == null) return undefined
  const key = String(value).trim().toLowerCase()
  return API_STATES[key] ? key : undefined
}

/**
 * Loads one connection with its counterparty resolved for a viewer.
 *
 * `INSERT ... RETURNING *` and a bare `UPDATE ... RETURNING *` only give the
 * columns of the row itself, so passing their result to formatConnection yields
 * `peer: null`. The projection below is the same one the list query uses, which
 * is what makes a single connection and the same connection in a list agree.
 *
 * `db` lets a caller read the row back on its own transaction, so the returned
 * payload describes the row that transaction is about to commit.
 */
async function loadWithPeer(connectionId, viewerId, db = { query }) {
  const { rows } = await db.query(
    `SELECT c.*, u.id AS peer_id, u.first_name, u.last_name, u.avatar_url,
            u.is_active, u.is_suspended,
            COALESCE(ap.current_company, sp.degree) AS headline_company,
            ap.current_position,
            ap.graduation_year, ap.degree AS alumni_degree,
            sp.degree AS student_degree, sp.year_of_study
     FROM connections c
     JOIN users u ON u.id = CASE WHEN c.requester_id = $2
                                THEN c.addressee_id ELSE c.requester_id END
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE c.id = $1`,
    [connectionId, viewerId],
  )
  return rows[0] ?? null
}

/**
 * The relationship between the caller and another member.
 *
 * `rejected` reads as 'none' because a declined request leaves the pair able to
 * try again, which is what a caller asking "what is our status" wants to know.
 */
export async function getRequestState(currentUserId, targetUserId) {
  if (currentUserId === targetUserId) return 'self'

  const { rows } = await query(
    `SELECT status, requester_id FROM connections
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [currentUserId, targetUserId],
  )
  const connection = rows[0]
  if (!connection) return 'none'
  if (connection.status === 'blocked') return 'blocked'
  if (connection.status === 'accepted') return 'connected'
  if (connection.status === 'rejected') return 'none'
  return connection.requester_id === currentUserId ? 'pending_outgoing' : 'pending_incoming'
}

/**
 * Whether either member has blocked the other.
 *
 * Connections and mentorship share this check, so it lives here rather than in
 * the mentorship service.
 */
export async function isBlockedEitherWay(a, b) {
  const { rows } = await query(
    `SELECT 1 FROM connections
     WHERE status = 'blocked'
       AND ((requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1))`,
    [a, b],
  )
  return rows.length > 0
}

export async function sendRequest({ requesterId, addresseeId, message }) {
  if (requesterId === addresseeId) throw badRequest('You cannot connect with yourself')

  const addressee = await userModel.findById(addresseeId)
  if (!addressee) throw notFound('User')
  if (!addressee.is_active || addressee.is_suspended) {
    throw badRequest('That account is not available for connections')
  }

  const privacy = await profileModel.getPrivacySettings(addresseeId)
  if (privacy && !privacy.allow_connection_requests) {
    throw forbidden('This person is not accepting connection requests')
  }

  const state = await getRequestState(requesterId, addresseeId)
  if (state === 'connected') throw conflict('You are already connected')
  if (state === 'pending_outgoing') throw conflict('You already sent a request')
  if (state === 'pending_incoming') {
    throw conflict('This person has already sent you a request')
  }
  if (state === 'blocked') throw forbidden('Connections are not available')

  const requester = await userModel.findById(requesterId)

  // The row and its notification are one fact, so they are written together: a
  // rollback cannot leave a request nobody was told about.
  const { connection, notification } = await withTransaction(async (db) => {
    // A rejected pair still owns the single row the symmetric index allows, so a
    // new attempt revives that row instead of inserting a second one. The pair row
    // is locked first so two simultaneous attempts cannot both revive it.
    const { rows: existingRows } = await db.query(
      `SELECT id, status FROM connections
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)
       FOR UPDATE`,
      [requesterId, addresseeId],
    )
    const existing = existingRows[0]

    let created
    try {
      if (existing) {
        if (existing.status !== 'rejected') {
          throw conflict('A connection request already exists between you')
        }
        const { rows } = await db.query(
          `UPDATE connections
           SET requester_id = $1, addressee_id = $2, status = 'pending',
               responded_at = NULL, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [requesterId, addresseeId, existing.id],
        )
        created = rows[0]
      } else {
        const { rows } = await db.query(
          `INSERT INTO connections (requester_id, addressee_id, status)
           VALUES ($1, $2, 'pending') RETURNING *`,
          [requesterId, addresseeId],
        )
        created = rows[0]
      }
    } catch (error) {
      // Two members can send each other a request at the same time. The symmetric
      // unique index settles that race, and the loser is told the request already
      // exists rather than receiving a 500 from the constraint.
      if (error.code === '23505') {
        throw conflict('A connection request already exists between you')
      }
      throw error
    }

    const sent = await notificationService.notify({
      userId: addresseeId,
      actorId: requesterId,
      type: 'connection_request',
      title: 'New connection request',
      body: message
        ? `${requester.first_name} ${requester.last_name}: ${message.slice(0, 180)}`
        : `${requester.first_name} ${requester.last_name} would like to connect`,
      link: '/network/connections',
      email: addressee.email,
      emailPayload: {
        fromName: `${requester.first_name} ${requester.last_name}`,
        message,
      },
      db,
    })
    return { connection: await loadWithPeer(created.id, requesterId, db), notification: sent }
  })

  await notificationService.emitStored(addresseeId, notification)

  return formatConnection(connection, requesterId)
}

/**
 * Accepts or declines an incoming request.
 *
 * Only the addressee may answer, and only while the request is still pending:
 * every other transition is a conflict rather than a silent success, so a
 * double-tap cannot produce two accepted states or a notification for a change
 * that did not happen.
 */
export async function respond({ connectionId, userId, accept }) {
  // The requester's address is read before the transaction opens. userModel uses
  // the shared pool, and a query issued from inside the transaction would compete
  // with it for the single development connection.
  const { rows: preview } = await query(
    'SELECT requester_id FROM connections WHERE id = $1', [connectionId],
  )
  const requesterId = preview[0]?.requester_id
  const requester = accept && requesterId ? await userModel.findById(requesterId) : null

  const { connection, notifiedUserId, notification } = await withTransaction(async (db) => {
    const { rows } = await db.query(
      'SELECT * FROM connections WHERE id = $1 FOR UPDATE', [connectionId],
    )
    const current = rows[0]
    if (!current) throw notFound('Connection request')
    if (current.addressee_id !== userId) {
      throw forbidden('You can only respond to requests addressed to you')
    }
    if (current.status !== 'pending') {
      throw badRequest('This request has already been handled')
    }

    const status = accept ? 'accepted' : 'rejected'
    const { rows: updated } = await db.query(
      `UPDATE connections SET status = $2, responded_at = NOW()
       WHERE id = $1 RETURNING *`,
      [connectionId, status],
    )
    // A decline is not worth an email; the caller sees the new state directly.
    let sent = null
    if (accept) {
      sent = await notificationService.notify({
        userId: current.requester_id,
        actorId: userId,
        type: 'connection_accepted',
        title: 'Connection accepted',
        body: 'Someone accepted your connection request',
        link: '/network/connections',
        email: requester?.email ?? null,
        emailPayload: { withName: 'A member' },
        db,
      })
    }

    return {
      connection: await loadWithPeer(updated[0].id, userId, db),
      notifiedUserId: accept ? current.requester_id : null,
      notification: sent,
    }
  })

  await notificationService.emitStored(notifiedUserId, notification)

  return formatConnection(connection, userId)
}

/**
 * Removes a connection by id.
 *
 * Both participants may do this: dropping a connection is symmetric, unlike
 * answering a request.
 */
export async function removeById(userId, connectionId) {
  const { rowCount } = await query(
    'DELETE FROM connections WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)',
    [connectionId, userId],
  )
  if (!rowCount) throw notFound('Connection')
  return { removed: true }
}

/**
 * Blocks a member.
 *
 * The row is rewritten so requester_id is always the blocker, which is what makes
 * unblock possible without a separate blocks table. Idempotent: blocking someone
 * twice is not an error, because a retried request should not fail.
 */
export async function block(userId, targetUserId) {
  if (userId === targetUserId) throw badRequest('You cannot block yourself')

  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT * FROM connections
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)
       FOR UPDATE`,
      [userId, targetUserId],
    )
    const existing = rows[0]

    if (existing && existing.status === 'blocked') {
      // Already blocked. If the caller is the one who blocked, nothing to do. If
      // the caller is the blocked party, their attempt is refused so a blocked
      // user cannot discover or clear the block.
      if (existing.requester_id !== userId) throw forbidden('Connections are not available')
      return { status: 'blocked', alreadyBlocked: true }
    }

    if (existing) {
      await db.query(
        `UPDATE connections
         SET status = 'blocked', requester_id = $1, addressee_id = $2,
             responded_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [userId, targetUserId, existing.id],
      )
    } else {
      await db.query(
        `INSERT INTO connections (requester_id, addressee_id, status, responded_at)
         VALUES ($1, $2, 'blocked', NOW())`,
        [userId, targetUserId],
      )
    }
    return { status: 'blocked', alreadyBlocked: false }
  })
}

/**
 * Lifts a block the caller placed.
 *
 * Only the blocker can clear it, which the requester_id rewrite makes checkable.
 * Removing the row rather than resetting it to 'rejected' means the pair starts
 * clean: neither side is left holding a stale declined request.
 */
export async function unblock(userId, targetUserId) {
  if (userId === targetUserId) throw badRequest('You cannot unblock yourself')

  const { rowCount } = await query(
    `DELETE FROM connections
     WHERE id IN (
       SELECT id FROM connections
       WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'
     )`,
    [userId, targetUserId],
  )
  if (!rowCount) throw notFound('Block')
  return { status: 'unblocked' }
}

export async function listConnections(userId, { limit = 50, offset = 0, status } = {}) {
  const state = normaliseState(status)
  if (status != null && !state) {
    throw badRequest('status must be one of PENDING, ACCEPTED, REJECTED or BLOCKED')
  }

  const params = [userId]
  let statusClause = ''
  if (state) {
    params.push(state)
    statusClause = `AND c.status = $${params.length}`
  }
  params.push(limit, offset)

  const { rows } = await query(
    `SELECT c.*, u.id AS peer_id, u.first_name, u.last_name, u.avatar_url,
            u.is_active, u.is_suspended,
            COALESCE(ap.current_company, sp.degree) AS headline_company,
            ap.current_position,
            ap.graduation_year, ap.degree AS alumni_degree,
            sp.degree AS student_degree, sp.year_of_study
     FROM connections c
     JOIN users u ON u.id = CASE WHEN c.requester_id = $1
                                 THEN c.addressee_id ELSE c.requester_id END
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE (c.requester_id = $1 OR c.addressee_id = $1) ${statusClause}
     ORDER BY COALESCE(c.responded_at, c.created_at) DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  const { rows: counts } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
       COUNT(*) FILTER (WHERE status = 'pending' AND addressee_id = $1)::int AS incoming,
       COUNT(*) FILTER (WHERE status = 'pending' AND requester_id = $1)::int AS outgoing,
       COUNT(*) FILTER (WHERE status = 'blocked' AND requester_id = $1)::int AS blocked
     FROM connections WHERE requester_id = $1 OR addressee_id = $1`,
    [userId],
  )

  return {
    rows: rows.map((r) => formatConnection(r, userId)),
    counts: counts[0],
  }
}

/** Incoming requests awaiting the caller's answer. */
export async function listPending(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT c.*, u.id AS peer_id, u.first_name, u.last_name, u.avatar_url,
            ap.current_company, ap.current_position, ap.graduation_year
     FROM connections c
     JOIN users u ON u.id = c.requester_id
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     WHERE c.addressee_id = $1 AND c.status = 'pending'
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return rows.map((r) => formatConnection(r, userId))
}

export async function getMutuals(userId, otherUserId) {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, ap.current_company
     FROM connections c1
     JOIN connections c2
       ON (CASE WHEN c1.requester_id = $1 THEN c1.addressee_id ELSE c1.requester_id END)
        = (CASE WHEN c2.requester_id = $3 THEN c2.addressee_id ELSE c2.requester_id END)
     JOIN users u ON u.id = (CASE WHEN c1.requester_id = $2
                                THEN c1.addressee_id ELSE c1.requester_id END)
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     WHERE c1.status = 'accepted'
       AND (c1.requester_id = $1 OR c1.addressee_id = $1)
       AND c2.status = 'accepted'
       AND (c2.requester_id = $3 OR c2.addressee_id = $3)
     LIMIT 50`,
    [userId, otherUserId, otherUserId],
  )
  return rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    avatarUrl: r.avatar_url,
    currentCompany: r.current_company,
  }))
}

/**
 * Shapes a row for the viewer.
 *
 * `direction` comes from the viewer, and a blocked row is reported without a
 * peer: the blocked party must not be able to read the blocker's identity, and
 * the blocker has no further action to take on it.
 */
export function formatConnection(row, viewerId) {
  const isBlocked = row.status === 'blocked'
  const incoming = row.requester_id !== viewerId
  return {
    id: row.id,
    status: API_STATES[row.status] ?? row.status.toUpperCase(),
    direction: incoming ? 'incoming' : 'outgoing',
    blockedByMe: isBlocked && row.requester_id === viewerId,
    peer: row.peer_id && !isBlocked ? {
      id: row.peer_id,
      name: `${row.first_name} ${row.last_name}`,
      avatarUrl: row.avatar_url,
      currentCompany: row.current_company ?? null,
      currentPosition: row.current_position ?? null,
      graduationYear: row.graduation_year ?? null,
      degree: row.alumni_degree ?? row.student_degree ?? null,
      yearOfStudy: row.year_of_study ?? null,
      headline: row.headline_company ?? null,
    } : null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  }
}

export async function getStats(userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'accepted')::int AS connections,
       COUNT(*) FILTER (WHERE status = 'pending' AND addressee_id = $1)::int AS pending_received,
       COUNT(*) FILTER (WHERE status = 'pending' AND requester_id = $1)::int AS     pending_sent
     FROM connections WHERE requester_id = $1 OR addressee_id = $1`,
    [userId],
  )
  return rows[0]
}
