import { query, withTransaction } from '../config/database.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import * as mentorshipModel from '../models/mentorshipModel.js'
import * as userModel from '../models/userModel.js'
import * as connectionService from './connectionService.js'
import * as notificationService from './notificationService.js'
import * as auditService from './auditService.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'

/**
 * A mentorship is only offered by an alumni account that has opted in and been
 * verified, and only to a member who is not already connected in a way that would
 * make the pairing redundant.
 *
 * The role check is deliberate and separate from the availability check: a student
 * has an `is_open_to_mentorship` column meaning "open to being mentored", which is
 * not an offer to mentor. Reading it as availability would let a student appear in
 * the mentor directory, so the role is asserted before anything else.
 */
async function assertEligibleMentor(mentorId, menteeId) {
  if (mentorId === menteeId) {
    throw badRequest('You cannot request mentorship from yourself')
  }

  const { rows } = await query(
    `SELECT u.email, u.is_active, u.is_suspended,
            ap.is_open_to_mentor, ap.mentorship_capacity, ap.verification_status,
            EXISTS (SELECT 1 FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id AND LOWER(r.name) = 'alumni') AS is_alumni,
            EXISTS (SELECT 1 FROM student_profiles sp WHERE sp.user_id = u.id) AS is_student
     FROM users u
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     WHERE u.id = $1`,
    [mentorId],
  )
  const mentor = rows[0]
  if (!mentor) throw notFound('Mentor')
  if (!mentor.is_active || mentor.is_suspended) {
    throw badRequest('That account is not available for mentorship')
  }
  // A student account can never mentor, whatever its profile columns say.
  if (!mentor.is_alumni || mentor.is_student) {
    throw badRequest('Only an alumni member can offer mentorship')
  }
  if (!mentor.is_open_to_mentor) {
    throw badRequest('That member is not accepting mentorship requests right now')
  }
  if (mentor.verification_status !== 'verified') {
    throw badRequest('That member is awaiting alumni verification')
  }

  const active = await mentorshipModel.countActiveMentorships(mentorId)
  if (active >= (mentor.mentorship_capacity ?? 1)) {
    throw badRequest('That mentor is already at capacity')
  }
  return mentor
}

export async function requestMentorship(menteeId, payload, context = {}) {
  const {
    mentorId,
    careerGoal,
    areaOfInterest,
    interestArea = areaOfInterest,
    message,
    preferredMode,
    preferredCommunication = preferredMode,
  } = payload
  if (mentorId === menteeId) {
    throw badRequest('You cannot request mentorship from yourself')
  }

  // The pair state is checked before eligibility: a mentor who is already full
  // because of *this* mentee should be told about the existing mentorship, not
  // about capacity.
  const existing = await mentorshipModel.findPairRequest(mentorId, menteeId)
  if (existing?.status === 'pending') {
    throw conflict('A mentorship request is already pending for this pair')
  }
  // A finished pairing is still a pairing: the request row is reused if the
  // mentee wants to work with this mentor again, but they must not be able to
  // open a second live mentorship while the first is still active.
  if (existing?.status === 'accepted') {
    throw conflict('You already have an active mentorship with this member')
  }

  // The returned row carries the mentor's address, which the request notification
  // needs; asking for it here avoids a second read of the same row.
  const mentor = await assertEligibleMentor(mentorId, menteeId)

  // Mentorship is meant to build on a real relationship, so a merely pending
  // connection request is not enough. A block in either direction ends the
  // attempt regardless of which member placed it.
  if (await connectionService.isBlockedEitherWay(menteeId, mentorId)) {
    throw forbidden('This member is not available for mentorship')
  }
  const connectionState = await connectionService.getRequestState(menteeId, mentorId)
  if (connectionState !== 'connected') {
    throw badRequest('Connect with this member before requesting mentorship')
  }

  const created = await mentorshipModel.createRequest({
    mentorId, menteeId, careerGoal, areaOfInterest: interestArea, message,
    preferredMode: preferredCommunication,
  })
  // A concurrent request can win the race against our status check; the
  // ON CONFLICT guard then matches nothing and returns no row.
  if (!created) throw conflict('A mentorship request already exists for this pair')

  // The email names the mentee, so the sender has to be read too. This is outside
  // the notification's own work on purpose: notify() writes on the shared pool here
  // (no transaction), and the PGlite dev database is single-session.
  const mentee = await userModel.findById(menteeId)

  await notificationService.notify({
    userId: mentorId,
    type: 'mentorship_request',
    title: 'New mentorship request',
    body: `${interestArea} - a member is asking for guidance.`,
    link: '/mentorship',
    actorId: menteeId,
    email: mentor.email,
    emailPayload: {
      menteeName: mentee ? `${mentee.first_name} ${mentee.last_name}` : 'A member',
      area: interestArea,
    },
  })

  await auditService.record({
    actorId: menteeId,
    action: AUDIT_ACTIONS.MENTORSHIP_REQUESTED,
    entityType: 'mentorship_request',
    entityId: created.id,
    metadata: { mentorId },
    context,
  })

  return mentorshipModel.formatRequest(
    await mentorshipModel.findRequestWithPeer(created.id, menteeId), menteeId,
  )
}

/**
 * Accepts or declines a pending request.
 *
 * Accepting writes three rows that must agree with each other: the request's new
 * status, the new relationship, and the mentee's notification. They share one
 * transaction, with the mentor's row locked, because the capacity that was free
 * when the request arrived may be taken by the time the mentor answers.
 *
 * Declining writes only the request status, but goes through the same path so the
 * two decisions cannot drift apart.
 */
export async function respondToRequest(mentorId, requestId, payload, context = {}) {
  const request = await mentorshipModel.findRequestById(requestId)
  if (!request) throw notFound('Mentorship request')
  if (request.mentor_id !== mentorId) {
    throw forbidden('Only the requested mentor can respond to this request')
  }
  if (request.status !== 'pending') {
    throw conflict('This request has already been answered')
  }

  const accepted = payload.status === 'accepted'

  // Read on the shared pool before the transaction opens: the notification below
  // runs inside it, and a pool query issued from there would compete with the
  // transaction for the single development connection.
  const mentee = await userModel.findById(request.mentee_id)
  const mentor = await userModel.findById(request.mentor_id)
  const mentorName = mentor ? `${mentor.first_name} ${mentor.last_name}` : 'Your mentor'

  const { relationship, notification } = await withTransaction(async (db) => {
    if (accepted) {
      await mentorshipModel.assertCapacityWithLock(request.mentor_id, request.mentee_id, db)
    }
    const row = await mentorshipModel.updateRequestStatus(requestId, {
      status: payload.status,
      responseNote: payload.responseNote,
    }, db)
    if (!row) throw notFound('Mentorship request')

    const rel = accepted
      ? await mentorshipModel.createRelationship({
        requestId,
        mentorId: request.mentor_id,
        menteeId: request.mentee_id,
      }, db)
      : null

    const sent = await notificationService.notify({
      userId: request.mentee_id,
      type: accepted ? 'mentorship_accepted' : 'mentorship_declined',
      title: accepted
        ? 'Mentorship request accepted'
        : 'Mentorship request declined',
      body: accepted
        ? 'Your mentor accepted. Open Mentorship to start in touch.'
        : payload.responseNote || 'The mentor was not available at this time.',
      link: '/mentorship',
      actorId: mentorId,
      email: mentee?.email ?? null,
      emailPayload: accepted
        ? { mentorName }
        : { mentorName, note: payload.responseNote },
      db,
    })

    return { relationship: rel, notification: sent }
  })

  await notificationService.emitStored(request.mentee_id, notification)

  await auditService.record({
    actorId: mentorId,
    action: AUDIT_ACTIONS[`MENTORSHIP_${payload.status.toUpperCase()}`],
    entityType: 'mentorship_request',
    entityId: requestId,
    metadata: { menteeId: request.mentee_id },
    context,
  })

  return {
    request: mentorshipModel.formatRequest(
      await mentorshipModel.findRequestWithPeer(requestId, mentorId), mentorId,
    ),
    relationship: relationship
      ? mentorshipModel.formatRelationship(
        await mentorshipModel.findRelationshipWithPeer(relationship.id, mentorId), mentorId,
      )
      : null,
  }
}

/** A single request, shaped for one of its two participants. */
export async function getRequest(userId, requestId) {
  const request = await mentorshipModel.findRequestById(requestId)
  if (!request) throw notFound('Mentorship request')
  // Both participants may read; nobody else can, including administrators,
  // because a request carries the mentee's stated career goal.
  if (request.mentor_id !== userId && request.mentee_id !== userId) {
    throw forbidden('You are not part of this mentorship request')
  }
  return mentorshipModel.formatRequest(
    await mentorshipModel.findRequestWithPeer(requestId, userId), userId,
  )
}

/** Accepts a pending request; the accept-only route from the Phase 3 spec. */
export async function acceptRequest(mentorId, requestId, payload = {}, context = {}) {
  return respondToRequest(mentorId, requestId, { ...payload, status: 'accepted' }, context)
}

/** Declines a pending request; the reject-only route from the Phase 3 spec. */
export async function rejectRequest(mentorId, requestId, payload = {}, context = {}) {
  return respondToRequest(mentorId, requestId, { ...payload, status: 'rejected' }, context)
}

export async function cancelMyRequest(userId, requestId, context = {}) {
  const request = await mentorshipModel.findRequestById(requestId)
  if (!request) throw notFound('Mentorship request')
  if (request.mentee_id !== userId) {
    throw forbidden('Only the mentee can cancel this request')
  }
  if (request.status !== 'pending') {
    throw conflict('Only a pending request can be cancelled')
  }

  const cancelled = await mentorshipModel.cancelRequest(requestId)
  if (!cancelled) throw notFound('Mentorship request')
  await auditService.record({
    actorId: userId,
    action: AUDIT_ACTIONS.MENTORSHIP_CANCELLED,
    entityType: 'mentorship_request',
    entityId: requestId,
    context,
  })
  return mentorshipModel.formatRequest(
    await mentorshipModel.findRequestWithPeer(requestId, userId), userId,
  )
}

export async function listRequests(userId, { limit = 20, offset = 0, status, role } = {}) {
  const conditions = ['(r.mentor_id = $1 OR r.mentee_id = $1)']
  const params = [userId]

  const state = mentorshipModel.normaliseRequestState(status)
  if (status != null && !state) {
    throw badRequest('status must be one of PENDING, ACCEPTED, REJECTED, CANCELLED or COMPLETED')
  }
  if (state) {
    params.push(state)
    conditions.push(`r.status = $${params.length}`)
  }
  if (role === 'mentor') conditions.push('r.mentor_id = $1')
  if (role === 'mentee') conditions.push('r.mentee_id = $1')

  const where = `WHERE ${conditions.join(' AND ')}`
  const rows = await mentorshipModel.listRequestsWithPeer(userId, {
    limit, offset, where, params,
  })

  const { rows: counts } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
     FROM mentorship_requests WHERE mentor_id = $1 OR mentee_id = $1`,
    [userId],
  )

  return { rows: rows.map((r) => mentorshipModel.formatRequest(r, userId)), counts: counts[0] }
}

export async function listMentorships(userId, { status, limit = 50, offset = 0 } = {}) {
  const conditions = ['(rel.mentor_id = $1 OR rel.mentee_id = $1)']
  const params = [userId]

  const state = mentorshipModel.normaliseRelationshipState(status)
  if (status != null && !state) {
    throw badRequest('status must be one of ACTIVE, COMPLETED or ENDED')
  }
  if (state) {
    params.push(state)
    conditions.push(`rel.status = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT rel.*,
            CASE WHEN rel.mentor_id = $1 THEN rel.mentee_id ELSE rel.mentor_id END AS peer_id,
            u.first_name || ' ' || u.last_name AS peer_name, u.avatar_url AS peer_avatar_url,
            ap.current_company AS peer_company, ap.current_position AS peer_position
     FROM mentorship_relationships rel
     JOIN users u ON u.id = CASE WHEN rel.mentor_id = $1 THEN rel.mentee_id ELSE rel.mentor_id END
     LEFT JOIN alumni_profiles ap
       ON ap.user_id = CASE WHEN rel.mentor_id = $1 THEN rel.mentee_id ELSE rel.mentor_id END
     WHERE ${conditions.join(' AND ')}
     ORDER BY rel.started_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return rows.map((r) => mentorshipModel.formatRelationship(r, userId))
}

export async function endMentorship(userId, relationshipId, payload, context = {}) {
  const relationship = await mentorshipModel.findRelationshipById(relationshipId)
  if (!relationship) throw notFound('Mentorship')
  if (relationship.mentor_id !== userId && relationship.mentee_id !== userId) {
    throw forbidden('You are not part of this mentorship')
  }
  if (relationship.status !== 'active') {
    throw conflict('This mentorship has already ended')
  }

  const peerId = relationship.mentor_id === userId
    ? relationship.mentee_id : relationship.mentor_id
  const peer = await userModel.findById(peerId)
  const peerName = peer ? `${peer.first_name} ${peer.last_name}` : 'Your peer'

  const { updated, notification } = await withTransaction(async (db) => {
    const row = await mentorshipModel.endRelationship(relationshipId, {
      endedBy: userId,
      endReason: payload.endReason,
    }, db)
    if (!row) throw conflict('This mentorship has already ended')

    const sent = await notificationService.notify({
      userId: peerId,
      type: 'mentorship_ended',
      title: 'Mentorship ended',
      body: payload.endReason || 'A mentorship has been closed by one of the participants.',
      link: '/mentorship',
      actorId: userId,
      email: peer?.email ?? null,
      emailPayload: { peerName, reason: payload.endReason },
      db,
    })
    return { updated: row, notification: sent }
  })

  await notificationService.emitStored(peerId, notification)

  await auditService.record({
    actorId: userId,
    action: AUDIT_ACTIONS.MENTORSHIP_ENDED,
    entityType: 'mentorship_relationship',
    entityId: relationshipId,
    context,
  })

  return mentorshipModel.formatRelationship(updated, userId)
}

/**
 * Marks a live mentorship as finished.
 *
 * Completion is not the same as ending early: it is the successful outcome, so it
 * moves the originating request to COMPLETED as well and tells the other
 * participant. Both the relationship row and the request row are written in one
 * transaction so a finished mentorship never appears with a still-pending request.
 */
export async function completeMentorship(userId, relationshipId, context = {}) {
  const relationship = await mentorshipModel.findRelationshipById(relationshipId)
  if (!relationship) throw notFound('Mentorship')
  if (relationship.mentor_id !== userId && relationship.mentee_id !== userId) {
    throw forbidden('You are not part of this mentorship')
  }
  if (relationship.status !== 'active') {
    throw conflict('Only an active mentorship can be completed')
  }

  const peerId = relationship.mentor_id === userId
    ? relationship.mentee_id : relationship.mentor_id
  const peer = await userModel.findById(peerId)
  const peerName = peer ? `${peer.first_name} ${peer.last_name}` : 'Your peer'

  const { updated, notification } = await withTransaction(async (db) => {
    const row = await mentorshipModel.completeRelationship(relationshipId, db)
    if (!row) throw conflict('This mentorship has already ended')

    const sent = await notificationService.notify({
      userId: peerId,
      type: 'mentorship_completed',
      title: 'Mentorship completed',
      body: 'A mentorship you are part of has been marked as completed.',
      link: '/mentorship',
      actorId: userId,
      email: peer?.email ?? null,
      emailPayload: { peerName },
      db,
    })
    return { updated: row, notification: sent }
  })

  await notificationService.emitStored(peerId, notification)

  await auditService.record({
    actorId: userId,
    action: AUDIT_ACTIONS.MENTORSHIP_COMPLETED,
    entityType: 'mentorship_relationship',
    entityId: relationshipId,
    context,
  })
  return mentorshipModel.formatRelationship(updated, userId)
}

/** Alumni who have opted in and still have capacity, for the discovery screen. */
export async function findAvailableMentors(viewerId, { search, industry, limit = 20, offset = 0 }) {
  const conditions = [
    'u.id <> $1',
    'u.is_active',
    'NOT u.is_suspended',
    'ap.is_open_to_mentor = TRUE',
    'ap.verification_status = \'verified\'',
  ]
  const params = [viewerId]

  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(u.first_name || ' ' || u.last_name ILIKE $${params.length}
                     OR ap.current_company ILIKE $${params.length}
                     OR ap.industry ILIKE $${params.length})`)
  }
  if (industry) {
    params.push(industry)
    conditions.push(`ap.industry = $${params.length}`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url,
            ap.current_company, ap.current_position, ap.industry, ap.degree,
            ap.graduation_year, ap.bio, ap.mentorship_capacity,
            (SELECT COUNT(*)::int FROM mentorship_relationships r
              WHERE r.mentor_id = u.id AND r.status = 'active') AS active_count
     FROM users u
     JOIN alumni_profiles ap ON ap.user_id = u.id
     ${where}
     ORDER BY active_count ASC, ap.graduation_year DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )

  const { rows: counts } = await query(
    `SELECT COUNT(*)::int AS c FROM users u
     JOIN alumni_profiles ap ON ap.user_id = u.id ${where}`,
    params,
  )

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      avatarUrl: r.avatar_url,
      currentCompany: r.current_company,
      currentPosition: r.current_position,
      industry: r.industry,
      degree: r.degree,
      graduationYear: r.graduation_year,
      bio: r.bio,
      openSlots: Math.max(0, (r.mentorship_capacity ?? 1) - r.active_count),
    })),
    total: counts[0].c,
  }
}
