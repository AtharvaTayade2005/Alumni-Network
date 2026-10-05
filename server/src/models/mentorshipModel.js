import { query } from '../config/database.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'

/**
 * Mentorship requests and relationships. All rows are shaped for the viewer,
 * so the client never has to know which side of a pair it is looking at.
 */

/**
 * Columns that resolve the counterparty from a given viewer's point of view.
 * `$VIEWER` is replaced with the placeholder that holds the viewer id in the
 * calling query. A raw INSERT/UPDATE row has none of these columns, so it must
 * not be passed to formatRequest directly.
 */
const PEER_COLUMNS = `
  r.*,
  CASE WHEN r.mentor_id = $VIEWER THEN r.mentee_id ELSE r.mentor_id END AS peer_id,
  u.first_name || ' ' || u.last_name AS peer_name, u.avatar_url AS peer_avatar_url,
  COALESCE(ap.current_company, sp.degree) AS peer_company,
  ap.current_position AS peer_position, ap.graduation_year AS peer_graduation_year
`

const PEER_JOINS = `
  FROM mentorship_requests r
  JOIN users u ON u.id = CASE WHEN r.mentor_id = $VIEWER THEN r.mentee_id ELSE r.mentor_id END
  LEFT JOIN alumni_profiles ap
    ON ap.user_id = CASE WHEN r.mentor_id = $VIEWER THEN r.mentee_id ELSE r.mentor_id END
  LEFT JOIN student_profiles sp
    ON sp.user_id = CASE WHEN r.mentor_id = $VIEWER THEN r.mentee_id ELSE r.mentor_id END
`

export async function findRequestById(id) {
  const { rows } = await query(
    'SELECT * FROM mentorship_requests WHERE id = $1', [id],
  )
  return rows[0] ?? null
}

/** The request identified by id, with its counterparty resolved for the viewer. */
export async function findRequestWithPeer(id, viewerId) {
  const { rows } = await query(
    `SELECT ${PEER_COLUMNS.replaceAll('$VIEWER', '$2')}
     ${PEER_JOINS.replaceAll('$VIEWER', '$2')}
     WHERE r.id = $1`,
    [id, viewerId],
  )
  return rows[0] ?? null
}

/**
 * Requests visible to the viewer. `where` and `params` are built by the caller
 * and must use $1 for the viewer id, so the peer projection stays consistent.
 */
export async function listRequestsWithPeer(viewerId, { limit, offset, where, params }) {
  const { rows } = await query(
    `SELECT ${PEER_COLUMNS.replaceAll('$VIEWER', '$1')}
     ${PEER_JOINS.replaceAll('$VIEWER', '$1')}
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return rows
}

export async function findPairRequest(mentorId, menteeId) {
  const { rows } = await query(
    'SELECT * FROM mentorship_requests WHERE mentor_id = $1 AND mentee_id = $2',
    [mentorId, menteeId],
  )
  return rows[0] ?? null
}

/**
 * Inserts a request, or revives the pair's existing row when a previous
 * attempt was rejected or cancelled. The (mentor_id, mentee_id) unique
 * constraint means one row per pair, so re-requesting updates in place.
 */
export async function createRequest({
  mentorId, menteeId, careerGoal, areaOfInterest, message, preferredMode,
}) {
  const values = [careerGoal, areaOfInterest, message ?? null, preferredMode]
  const { rows } = await query(
    `INSERT INTO mentorship_requests (
       mentor_id, mentee_id, career_goal, area_of_interest, message, preferred_mode
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (mentor_id, mentee_id) DO UPDATE SET
       career_goal = EXCLUDED.career_goal,
       area_of_interest = EXCLUDED.area_of_interest,
       message = EXCLUDED.message,
       preferred_mode = EXCLUDED.preferred_mode,
       status = 'pending',
       response_note = NULL,
       responded_at = NULL,
       updated_at = NOW()
     WHERE mentorship_requests.status IN ('rejected', 'cancelled')
     RETURNING *`,
    [mentorId, menteeId, ...values],
  )
  return rows[0] ?? null
}

export async function updateRequestStatus(id, { status, responseNote }, db = { query }) {
  const { rows } = await db.query(
    `UPDATE mentorship_requests
     SET status = $2, response_note = $3, responded_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, responseNote ?? null],
  )
  return rows[0] ?? null
}

export async function cancelRequest(id) {
  const { rows } = await query(
    `UPDATE mentorship_requests
     SET status = 'cancelled', responded_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  )
  return rows[0] ?? null
}

export async function createRelationship({ requestId, mentorId, menteeId }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO mentorship_relationships (request_id, mentor_id, mentee_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (request_id) DO UPDATE SET status = 'active', ended_at = NULL
     RETURNING *`,
    [requestId, mentorId, menteeId],
  )
  return rows[0]
}

/**
 * Locks the mentor's row and re-checks capacity. Accepting a request has to
 * confirm the mentor still has room, because the count at request time may be
 * stale by the time the mentor replies.
 *
 * `db` is a pg client supplied by the caller's transaction: the FOR UPDATE lock
 * is only held for the life of that transaction, so this must run on the same
 * client rather than on the shared pool.
 */
export async function assertCapacityWithLock(mentorId, menteeId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(ap.mentorship_capacity, 1) AS capacity,
            (SELECT COUNT(*)::int FROM mentorship_relationships r
              WHERE r.mentor_id = $1 AND r.mentee_id <> $2 AND r.status = 'active') AS taken,
            ap.is_open_to_mentor, ap.verification_status
     FROM users u
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     WHERE u.id = $1
     FOR UPDATE OF u`,
    [mentorId, menteeId],
  )
  const mentor = rows[0]
  if (!mentor) throw notFound('Mentor')
  if (!mentor.is_open_to_mentor || mentor.verification_status !== 'verified') {
    throw badRequest('That member is not available for mentorship')
  }
  if (mentor.taken >= mentor.capacity) {
    throw conflict('That mentor is now at capacity')
  }
  return mentor
}

export async function findRelationshipById(id) {
  const { rows } = await query(
    'SELECT * FROM mentorship_relationships WHERE id = $1', [id],
  )
  return rows[0] ?? null
}

/** The relationship identified by id, with its counterparty resolved for the viewer. */
export async function findRelationshipWithPeer(id, viewerId) {
  const { rows } = await query(
    `SELECT rel.*,
            CASE WHEN rel.mentor_id = $2 THEN rel.mentee_id ELSE rel.mentor_id END AS peer_id,
            u.first_name || ' ' || u.last_name AS peer_name, u.avatar_url AS peer_avatar_url,
            ap.current_company AS peer_company, ap.current_position AS peer_position
     FROM mentorship_relationships rel
     JOIN users u ON u.id = CASE WHEN rel.mentor_id = $2 THEN rel.mentee_id ELSE rel.mentor_id END
     LEFT JOIN alumni_profiles ap
       ON ap.user_id = CASE WHEN rel.mentor_id = $2 THEN rel.mentee_id ELSE rel.mentor_id END
     WHERE rel.id = $1`,
    [id, viewerId],
  )
  return rows[0] ?? null
}

/**
 * Ends a relationship early.
 *
 * Unlike completion, this leaves the request at 'accepted': the pairing did
 * happen, it just stopped, and 'ended' on the relationship is what records that.
 */
export async function endRelationship(id, { endedBy, endReason }, db = { query }) {
  const { rows } = await db.query(
    `UPDATE mentorship_relationships
     SET status = 'ended', ended_at = NOW(), ended_by = $2, end_reason = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, endedBy ?? null, endReason ?? null],
  )
  return rows[0] ?? null
}

/**
 * Marks a relationship complete and moves its originating request to
 * 'completed' in the same statement pair.
 *
 * The request row is updated alongside the relationship because leaving it at
 * 'accepted' would make an active mentorship and a finished one look identical in
 * the request list; 011 adds 'completed' to the request status constraint for
 * exactly this. Both writes run on `db` so a caller can commit them together.
 */
export async function completeRelationship(id, db = { query }) {
  const { rows } = await db.query(
    `UPDATE mentorship_relationships
     SET status = 'completed', ended_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  )
  const relationship = rows[0] ?? null
  if (!relationship) return null

  await db.query(
    `UPDATE mentorship_requests
     SET status = 'completed', updated_at = NOW()
     WHERE id = $1`,
    [relationship.request_id],
  )
  return relationship
}

/** Number of live mentorships a mentor is already carrying. */
export async function countActiveMentorships(mentorId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS c FROM mentorship_relationships
     WHERE mentor_id = $1 AND status = 'active'`,
    [mentorId],
  )
  return rows[0].c
}

/** Storage is lowercase; the API contract is uppercase, as in Phase 2 verification. */
const REQUEST_STATES = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  completed: 'COMPLETED',
}

const RELATIONSHIP_STATES = {
  active: 'ACTIVE',
  completed: 'COMPLETED',
  ended: 'ENDED',
}

/** Accepts a state filter in either casing so existing lowercase callers keep working. */
export function normaliseRequestState(value) {
  if (value == null) return undefined
  const key = String(value).trim().toLowerCase()
  return REQUEST_STATES[key] ? key : undefined
}

export function normaliseRelationshipState(value) {
  if (value == null) return undefined
  const key = String(value).trim().toLowerCase()
  return RELATIONSHIP_STATES[key] ? key : undefined
}

/**
 * Shapes a request row with the counterparty resolved to `viewerId`.
 *
 * The four fields the Phase 3 spec names are exposed under the spec's spelling
 * (`interestArea`, `preferredCommunication`) while the original names stay on the
 * row, so a client written against either contract reads the same value.
 */
export function formatRequest(row, viewerId) {
  const iAmMentor = row.mentor_id === viewerId
  return {
    id: row.id,
    direction: iAmMentor ? 'incoming' : 'outgoing',
    role: iAmMentor ? 'mentor' : 'mentee',
    mentorId: row.mentor_id,
    menteeId: row.mentee_id,
    peerId: iAmMentor ? row.mentee_id : row.mentor_id,
    careerGoal: row.career_goal,
    interestArea: row.area_of_interest,
    areaOfInterest: row.area_of_interest,
    message: row.message,
    preferredCommunication: row.preferred_mode,
    preferredMode: row.preferred_mode,
    status: REQUEST_STATES[row.status] ?? row.status.toUpperCase(),
    responseNote: row.response_note,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    peer: row.peer_id ? {
      id: row.peer_id,
      name: row.peer_name,
      avatarUrl: row.peer_avatar_url,
      currentCompany: row.peer_company,
      currentPosition: row.peer_position,
      graduationYear: row.peer_graduation_year,
    } : null,
  }
}

export function formatRelationship(row, viewerId) {
  const iAmMentor = row.mentor_id === viewerId
  return {
    id: row.id,
    requestId: row.request_id,
    role: iAmMentor ? 'mentor' : 'mentee',
    mentorId: row.mentor_id,
    menteeId: row.mentee_id,
    peerId: iAmMentor ? row.mentee_id : row.mentor_id,
    status: RELATIONSHIP_STATES[row.status] ?? row.status.toUpperCase(),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    peer: row.peer_id ? {
      id: row.peer_id,
      name: row.peer_name,
      avatarUrl: row.peer_avatar_url,
      currentCompany: row.peer_company,
      currentPosition: row.peer_position,
    } : null,
  }
}
