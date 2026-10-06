import * as eventModel from '../models/eventModel.js'
import * as notificationService from './notificationService.js'
import { query, withTransaction } from '../config/database.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'
import { ROLES, hasAnyRole } from '../middleware/rbac.js'

/**
 * Events, RSVPs and the attendee roster.
 *
 * The rules this file exists to enforce:
 *
 *   * Only the organizer or staff may change an event. A reader sees a published
 *     event; a draft is reported as missing rather than forbidden, because the
 *     board should not confirm that somebody's draft exists to a stranger.
 *   * Capacity is decided under a row lock on the event, and the head count
 *     includes guests. Answering "does this fit" and then counting afterwards is
 *     the bug this avoids: two members answering the last place at the same moment
 *     both see one seat free.
 *   * Cancelling is a broadcast. Everybody who said they were coming or might come
 *     is told, because the cost of not telling them is a wasted journey.
 *   * Every notification is written after the transaction that decided the fact
 *     commits, so nobody is told about an RSVP that a rollback erased.
 */

const ORGANIZER_ROLES = [ROLES.ALUMNI, ROLES.MODERATOR, ROLES.ADMIN]
const STAFF_ROLES = [ROLES.MODERATOR, ROLES.ADMIN]

/** Event states, as the database stores them. */
const EVENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
}

/**
 * Which moves are legal, and who may make them.
 *
 * `draft -> published` and `published -> completed` are the organizer's own
 * decisions. `published -> cancelled` may also be made by staff, because an
 * emergency is exactly the case where the organizer cannot be reached and staff
 * have to be able to say so.
 */
const EVENT_TRANSITIONS = {
  draft: {
    published: { who: 'organizer' },
    cancelled: { who: 'organizer' },
  },
  published: {
    draft: { who: 'organizer' },
    cancelled: { who: 'anyone' },
    completed: { who: 'organizer' },
  },
  cancelled: {
    published: { who: 'organizer' },
  },
  completed: {
    published: { who: 'organizer' },
  },
}

const isStaff = (user) => hasAnyRole(user, STAFF_ROLES)

function toStoredStatus(apiStatus) {
  const value = EVENT_STATUS[String(apiStatus).toUpperCase()]
  if (!value) throw badRequest(`Unknown event status: ${apiStatus}`)
  return value
}

/** A readable day, for a notification title and an email. */
function readableDate(row) {
  return new Date(`${eventModel.dateOnly(row.event_date)}T${row.start_time}Z`)
    .toLocaleString('en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
}

/** The fields every event email needs, so each call site does not rebuild them. */
function emailFacts(row, organizerName = null) {
  return {
    eventTitle: row.title,
    eventDate: readableDate(row),
    venue: row.venue,
    virtualUrl: row.virtual_url,
    organizerName,
  }
}

/** Loads an event row, throwing when it does not exist. */
async function loadRow(id) {
  const row = await eventModel.findEventRow(id)
  if (!row) throw notFound('Event')
  return row
}

/**
 * Loads an event the caller may change.
 *
 * Staff may edit any event, which is deliberate: a moderator has to be able to fix
 * a broken event during an incident without waiting for its organizer.
 */
function assertCanManage(row, user) {
  if (row.organizer_id !== user.id && !isStaff(user)) {
    throw forbidden('You can only manage events you organize')
  }
}

/**
 * An event the caller may see.
 *
 * A draft is the organizer's to manage; anybody else is told the event does not
 * exist, so the board does not leak the existence of unpublished work.
 */
async function loadVisible(id, viewer) {
  const row = await loadRow(id)
  if (row.status !== EVENT_STATUS.DRAFT) return row
  if (viewer && (viewer.id === row.organizer_id || isStaff(viewer))) return row
  throw notFound('Event')
}

function pagination(filters, total) {
  const limit = filters.limit ?? 20
  return {
    total,
    page: filters.page ?? 1,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  }
}

/**
 * The columns a validated payload writes, mapped onto the stored names.
 *
 * The instant pair is split here rather than in the model because `startTime` and
 * `endTime` are one decision: they have to be split together or not at all.
 */
function columnsFromPayload(payload, row = null) {
  const columns = {}
  if (payload.title !== undefined) columns.title = payload.title
  if (payload.description !== undefined) columns.description = payload.description ?? ''
  if (payload.startTime !== undefined || payload.endTime !== undefined) {
    const start = payload.startTime
      ?? new Date(`${eventModel.dateOnly(row.event_date)}T${row.start_time}Z`)
    const end = payload.endTime
      ?? new Date(
        `${eventModel.dateOnly(row.end_date ?? row.event_date)}T${row.end_time}Z`,
      )
    Object.assign(columns, eventModel.splitInstant(start, end))
  }
  if (payload.venue !== undefined) columns.venue = payload.venue
  if (payload.virtualUrl !== undefined) columns.virtual_url = payload.virtualUrl
  if (payload.city !== undefined) columns.city = payload.city
  if (payload.region !== undefined) columns.region = payload.region
  if (payload.country !== undefined) columns.country = payload.country
  if (payload.capacity !== undefined) columns.max_attendees = payload.capacity
  if (payload.rsvpDeadline !== undefined) {
    columns.registration_deadline = payload.rsvpDeadline
      ? payload.rsvpDeadline.toISOString().slice(0, 10)
      : null
  }
  if (payload.imageUrl !== undefined) columns.image_url = payload.imageUrl
  return columns
}

/**
 * A member's email address.
 *
 * The JWT deliberately carries no personal data, so a notification that wants to
 * send an email has to ask the database for the address it is about to send to.
 * Rows without an address are skipped rather than mailed an empty recipient.
 */
async function emailFor(userId) {
  const { rows } = await query('SELECT email FROM users WHERE id = $1', [userId])
  return rows[0]?.email ?? null
}

/**
 * Creates an event.
 *
 * A new event is a draft. Publishing is a separate, deliberate act, so a client
 * that posts the whole form in one request still does not announce the event
 * before the organizer has looked at it.
 */
export async function createEvent(user, payload) {
  if (!hasAnyRole(user, ORGANIZER_ROLES)) {
    throw forbidden('Only alumni and staff can organize events')
  }

  const requested = payload.status ? String(payload.status).toUpperCase() : 'DRAFT'
  if (!['DRAFT', 'PUBLISHED'].includes(requested)) {
    throw badRequest('A new event may only be a draft or published')
  }
  if (requested === 'PUBLISHED' && !isStaff(user)) {
    // A client sending PUBLISHED because an older API accepted it does not get to
    // announce the event without a second look at it.
    throw forbidden('Only a moderator can publish an event without review')
  }

  const instant = eventModel.splitInstant(payload.startTime, payload.endTime)
  const publishedAtRequested = toStoredStatus(requested) === EVENT_STATUS.PUBLISHED
  const row = await eventModel.createEvent({
    organizerId: user.id,
    title: payload.title,
    description: payload.description ?? '',
    ...instant,
    venue: payload.venue ?? null,
    virtualUrl: payload.virtualUrl ?? null,
    city: payload.city ?? null,
    region: payload.region ?? null,
    country: payload.country ?? null,
    max_attendees: payload.capacity ?? null,
    registration_deadline: payload.rsvpDeadline
      ? payload.rsvpDeadline.toISOString().slice(0, 10)
      : null,
    imageUrl: payload.imageUrl ?? null,
    status: toStoredStatus(requested),
  })

  // `published_at` is stamped by the same statement that publishes, so an event
  // created already published has to go through it too or it would be live with no
  // record of when it went live — which is exactly what the "since" filters read.
  const published = publishedAtRequested
    ? await eventModel.setEventStatus(row.id, EVENT_STATUS.PUBLISHED)
    : row

  return eventModel.findEventById(published.id, user.id)
}

/**
 * Updates an event.
 *
 * When a published event's date, time, place or link changes, everybody who said
 * they were coming or might come is told which detail moved. A change nobody is
 * told about is how people turn up at the old venue.
 */
export async function updateEvent(user, eventId, payload) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)

  if (payload.status !== undefined) {
    throw badRequest('Use the publish and cancel endpoints to change an event status')
  }

  const columns = columnsFromPayload(payload, row)
  const merged = { ...row, ...columns }
  const hasVenue = typeof merged.venue === 'string' && merged.venue.trim() !== ''
  const hasLink = typeof merged.virtual_url === 'string' && merged.virtual_url.trim() !== ''
  if (!hasVenue && !hasLink) throw badRequest('Give the event a venue or a join link')
  if (merged.registration_deadline && eventModel.dateOnly(merged.registration_deadline)
    > eventModel.dateOnly(merged.event_date)) {
    throw badRequest('The RSVP deadline cannot be after the event starts')
  }
  if (merged.max_attendees != null && merged.max_attendees !== row.max_attendees) {
    const taken = await eventModel.headcount(eventId)
    if (merged.max_attendees < taken) {
      throw conflict(`There are already ${taken} places taken, so capacity cannot be set to ${merged.max_attendees}`)
    }
  }

  // A published event nobody may see again should not be edited at all: the change
  // is invisible, and a draft is the honest place to make it.
  if (row.status === EVENT_STATUS.CANCELLED && merged.status !== EVENT_STATUS.CANCELLED) {
    throw conflict('A cancelled event cannot be edited; publish it again to restart it')
  }

  const updated = await eventModel.updateEventRow(eventId, columns)
  await notifyChangedDetails(user, row, updated)
  return eventModel.findEventById(eventId, user.id)
}

/**
 * Tells the interested people what changed, if anything a reader would notice did.
 *
 * Only a published event has anybody to tell: a draft being edited is invisible,
 * and a cancelled one has already sent the cancellation.
 */
async function notifyChangedDetails(actor, before, after) {
  if (before.status !== EVENT_STATUS.PUBLISHED) return

  const changes = []
  const movedDay = eventModel.dateOnly(before.event_date) !== eventModel.dateOnly(after.event_date)
  if (movedDay || before.start_time !== after.start_time) {
    changes.push(`Now ${readableDate(after)}`)
  }
  if (before.end_time !== after.end_time) {
    changes.push(`Ends at ${after.end_time.slice(0, 5)} UTC`)
  }
  if (before.venue !== after.venue) changes.push(`Venue: ${after.venue ?? 'to be confirmed'}`)
  if (before.virtual_url !== after.virtual_url) {
    changes.push(after.virtual_url ? `Join link: ${after.virtual_url}` : 'The join link was removed')
  }
  if (!changes.length) return

  const going = await eventModel.goingUserIds(after.id)
  const interested = await eventModel.listRsvps(after.id, { status: 'interested', limit: 500 })
  const recipients = new Set([...going, ...interested.map((r) => r.userId)])
  recipients.delete(actor.id)

  const link = `/events/${after.id}`
  const title = `${after.title} has been updated`
  // Keyed on the row's own updated_at *and* the recipient. The timestamp alone
  // would be one key for the whole broadcast, so the first person in the loop would
  // consume it and everybody after them would silently get nothing.
  const saved = new Date(after.updated_at).toISOString()
  for (const userId of recipients) {
    await notificationService.notify({
      userId,
      type: 'event_updated',
      title,
      body: changes.join(' · '),
      link,
      actorId: actor.id,
      email: null,
      emailPayload: { ...emailFacts(after), changes },
      dedupeKey: `event:${after.id}:updated:${saved}:${userId}`,
      metadata: { eventId: after.id, status: after.status },
    })
  }
}

/** Deletes an event that has not happened yet. */
export async function deleteEvent(user, eventId) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)
  if (row.status === EVENT_STATUS.PUBLISHED) {
    throw conflict('Cancel a published event instead of deleting it, so people are told')
  }
  await eventModel.deleteEvent(eventId)
  return { deleted: true, id: eventId }
}

/**
 * Moves an event to another state.
 *
 * Publishing is what makes an event visible; cancelling and completing both go
 * out to everybody who was going, for different reasons: a cancellation has to
 * save them a journey, and a completion closes the loop on an event they attended.
 */
export async function changeStatus(user, eventId, target, { reason = null } = {}) {
  const row = await loadRow(eventId)
  const wanted = toStoredStatus(target)
  const rule = EVENT_TRANSITIONS[row.status]?.[wanted]
  if (!rule) {
    throw conflict(`An event cannot go from ${row.status} to ${wanted}`)
  }
  const organizer = row.organizer_id === user.id
  if (rule.who === 'organizer' && !organizer && !isStaff(user)) {
    throw forbidden('You can only manage events you organize')
  }
  if (wanted === EVENT_STATUS.CANCELLED && !reason) {
    throw badRequest('Say why the event is cancelled, so people who were going know')
  }

  const updated = await eventModel.setEventStatus(eventId, wanted, {
    cancelledBy: wanted === EVENT_STATUS.CANCELLED ? user.id : null,
    reason,
  })

  if (wanted === EVENT_STATUS.PUBLISHED) {
    await notifyInterested(row)
  }
  if (wanted === EVENT_STATUS.CANCELLED) {
    await notifyCancellation(user, updated, reason)
  }
  if (wanted === EVENT_STATUS.COMPLETED) {
    await notifyAttendanceThanks(user, updated)
  }

  return eventModel.findEventById(eventId, user.id)
}

/** A publication tells the people who had flagged interest that it is real. */
async function notifyInterested(row) {
  const watchers = await eventModel.listRsvps(row.id, { status: 'interested', limit: 500 })
  for (const rsvp of watchers) {
    await notificationService.notify({
      userId: rsvp.userId,
      type: 'event_updated',
      title: `${row.title} is now open`,
      body: `An event you were watching was published for ${readableDate(row)}.`,
      link: `/events/${row.id}`,
      dedupeKey: `event:${row.id}:published:${rsvp.id}`,
      metadata: { eventId: row.id, status: 'published' },
    })
  }
}

/**
 * Cancelling an event.
 *
 * Everybody who was going gets the cancellation in-app and by email; somebody who
 * had only said they might come is told in-app, because there is no point mailing
 * somebody who may never have decided to come.
 */
async function notifyCancellation(actor, row, reason) {
  const attendeeIds = await eventModel.goingUserIds(row.id)
  const interested = await eventModel.listRsvps(row.id, { status: 'interested', limit: 500 })
  const link = `/events/${row.id}`
  const title = `${row.title} has been cancelled`

  for (const userId of attendeeIds) {
    await notificationService.notify({
      userId,
      type: 'event_cancelled',
      title,
      body: reason,
      link,
      actorId: actor.id,
      email: null,
      emailPayload: { ...emailFacts(row), reason },
      dedupeKey: `event:${row.id}:cancelled:${userId}`,
      metadata: { eventId: row.id, status: 'cancelled', reason },
    })
  }
  for (const rsvp of interested) {
    if (attendeeIds.includes(rsvp.userId)) continue
    await notificationService.notify({
      userId: rsvp.userId,
      type: 'event_cancelled',
      title,
      body: reason,
      link,
      actorId: actor.id,
      dedupeKey: `event:${row.id}:cancelled:${rsvp.userId}`,
      metadata: { eventId: row.id, status: 'cancelled', reason },
    })
  }
}

/**
 * Closing an event off.
 *
 * Only the people who said they were going are told, and the wording says the
 * event is over rather than thanking them for attending: nobody has recorded who
 * actually walked in, so claiming they were there would be a guess.
 *
 * `actor` is the organizer when they closed it by hand and null when the sweep
 * did it after the fact, which is why the attribution is optional: an event that
 * ended because its day passed has nobody to credit for it.
 */
async function notifyAttendanceThanks(actor, row) {
  const attendeeIds = await eventModel.goingUserIds(row.id)
  for (const userId of attendeeIds) {
    await notificationService.notify({
      userId,
      type: 'event_updated',
      title: `${row.title} is now finished`,
      body: 'The event has been marked as completed.',
      link: `/events/${row.id}`,
actorId: actor?.id ?? null,
    dedupeKey: `event:${row.id}:completed:${userId}`,
    metadata: { eventId: row.id, status: 'completed' },
    })
  }
}

/**
 * Answers an event.
 *
 * The capacity decision happens inside a transaction that holds a row lock on the
 * event, so the count that decides "there is room" is the same count that is
 * written. Two members answering the last place at the same moment produce one
 * RSVP and one refusal, not two RSVPs for one seat.
 *
 * Answering 'going' also puts the member on the attendee roster, because somebody
 * who said they were coming is somebody who needs checking in.
 */
export async function rsvp(user, eventId, payload) {
  const { event, saved, isNew } = await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId])
    const event = rows[0]
    if (!event) throw notFound('Event')

    const previous = await eventModel.findRsvp(eventId, user.id, db)

    if (payload.status === 'going') {
      if (event.status !== EVENT_STATUS.PUBLISHED) {
        throw conflict('This event is not open for RSVPs')
      }
      if (event.registration_deadline
        && eventModel.dateOnly(event.registration_deadline) < eventModel.dateOnly(new Date())) {
        throw conflict('The RSVP deadline for this event has passed')
      }
      // Somebody who is already counted is not counted twice: the head count
      // includes them, so their own seats come off before the new total is
      // compared with capacity. Otherwise changing a guest count from 0 to 2 on
      // a full event would look like two extra places were being taken.
      const seats = 1 + payload.guestCount
      const alreadyGoing = previous?.status === 'going' ? 1 + previous.guest_count : 0
      const taken = await eventModel.headcount(eventId, db)
      const projected = taken - alreadyGoing + seats
      if (event.max_attendees != null && projected > event.max_attendees) {
        const left = Math.max(0, event.max_attendees - (taken - alreadyGoing))
        throw conflict(left > 0
          ? `Only ${left} place${left === 1 ? '' : 's'} left, and this RSVP needs ${seats}`
          : 'This event is full')
      }
    }

    const saved = await eventModel.upsertRsvp(eventId, user.id, payload, db)

    if (payload.status === 'going') {
      await eventModel.upsertAttendee(eventId, user.id, {}, db)
    } else if (previous?.status === 'going') {
      // Saying "not going" takes the member off the roster: they are not on the
      // list of people to expect at the door.
await eventModel.removeAttendee(eventId, user.id, db)
    }

    return { event, saved, isNew: !previous }
  })

  await sendRsvpConfirmation(user, event, saved, isNew)
  return eventModel.formatRsvp(saved)
}

/**
 * Confirms an RSVP.
 *
 * The member is confirmed in the notification centre and by email, because
 * somebody who just pressed a button wants to know it landed. The organizer is
 * told in-app only: their copy is about attendance rather than about their own
 * booking, so the email template aimed at attendees would read strangely.
 *
 * Only a first answer is announced. Changing an answer afterwards is silent:
 * confirming again every time somebody tidies their guest count is noise, and the
 * answer is on the event either way. The dedupe key on a first answer is what
 * makes a retried request produce one confirmation rather than two.
 */
async function sendRsvpConfirmation(user, event, rsvp, isNew) {
  if (!isNew || rsvp.status !== 'going') return

  const when = readableDate(event)
  const link = `/events/${event.id}`

  await notificationService.notify({
    userId: user.id,
    type: 'event_rsvp',
    title: `You are going to ${event.title}`,
    body: `${when}${event.venue ? ` at ${event.venue}` : ''}`,
    link,
    actorId: user.id,
    email: await emailFor(user.id),
    emailPayload: emailFacts(event),
    dedupeKey: `event:${event.id}:rsvp:${user.id}`,
    metadata: { eventId: event.id, rsvpId: rsvp.id, status: 'going' },
  })

  if (event.organizer_id === user.id) return

  const organizerName = await displayNameFor(event.organizer_id)
  await notificationService.notify({
    userId: event.organizer_id,
    type: 'event_rsvp',
    title: `${nameOf(user)} is going to ${event.title}`,
    body: `An RSVP was confirmed for ${when}.`,
    link,
    actorId: user.id,
    email: null,
    emailPayload: { ...emailFacts(event, organizerName) },
    dedupeKey: `event:${event.id}:rsvp:${event.organizer_id}`,
    metadata: { eventId: event.id, rsvpId: rsvp.id, attendeeId: user.id },
  })
}

/** A member's name, as the directory shows it, for a notification about them. */
function nameOf(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return name || user.email || 'A member'
}

/** The same, looked up for somebody the caller only has an id for. */
async function displayNameFor(userId) {
  const { rows } = await query(
    'SELECT first_name, last_name, email FROM users WHERE id = $1',
    [userId],
  )
  return rows[0] ? nameOf(rows[0]) : null
}

/** Withdraws the caller's own RSVP. */
export async function cancelRsvp(user, eventId) {
  const event = await loadVisible(eventId, user)
  const existing = await eventModel.findRsvp(eventId, user.id)
  if (!existing) throw notFound('RSVP')
  await eventModel.deleteRsvp(eventId, user.id)
  await eventModel.removeAttendee(eventId, user.id)
  return { eventId, cancelled: true, event: await eventModel.findEventById(event.id, user.id) }
}

/** Everybody who answered an event. The organizer's call, not the public's. */
export async function listRsvps(user, eventId, filters = {}) {
  const row = await loadVisible(eventId, user)
  assertCanManage(row, user)
  return eventModel.listRsvps(eventId, filters)
}

/** The caller's own list of events. */
export async function listMyRsvps(user, filters = {}) {
  return eventModel.listMyRsvps(user.id, filters)
}

export async function getEvent(viewer, eventId) {
  await loadVisible(eventId, viewer)
  return eventModel.findEventById(eventId, viewer?.id ?? null)
}

export async function listEvents(viewer, filters = {}) {
  const events = await eventModel.listEvents(viewer?.id ?? null, filters)
  const total = await eventModel.countEvents(viewer?.id ?? null, filters)
  return { events, ...pagination(filters, total) }
}

/** The roster for an event. */
export async function listAttendees(user, eventId, filters = {}) {
  const row = await loadVisible(eventId, user)
  assertCanManage(row, user)
  return eventModel.listAttendees(eventId, filters)
}

/**
 * Adds somebody to the roster by hand.
 *
 * A walk-in has no RSVP, and the roster is the organizer's record of who was
 * there, so adding one is allowed even though answering is not.
 */
export async function addAttendee(user, eventId, payload) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)
  const attendee = await eventModel.upsertAttendee(eventId, payload.userId, {
    notes: payload.notes ?? null,
  })
  return eventModel.formatAttendee(attendee)
}

/**
 * Marks somebody present, or un-marks them.
 *
 * Clearing a check-in is allowed because an organizer presses the wrong person
 * often enough that undoing it has to be possible; nothing else about the roster
 * changes.
 */
export async function setCheckIn(user, eventId, targetUserId, payload) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)

  const existing = await eventModel.findAttendee(eventId, targetUserId)
  if (!existing) throw notFound('Attendee')

  const attendee = await eventModel.setAttendeeCheckIn(eventId, targetUserId, {
    checkedIn: payload.checkedIn,
    checkedInBy: payload.checkedIn ? (payload.checkedInBy ?? user.id) : null,
  })
  return eventModel.formatAttendee(attendee)
}

/** An organizer's private note about an attendee. */
export async function setAttendeeNotes(user, eventId, targetUserId, notes) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)
  const existing = await eventModel.findAttendee(eventId, targetUserId)
  if (!existing) throw notFound('Attendee')
  const { rows } = await query(
    'UPDATE event_attendees SET notes = $3 WHERE event_id = $1 AND user_id = $2 RETURNING *',
    [eventId, targetUserId, notes ?? null],
  )
  return eventModel.formatAttendee(rows[0])
}

/** Removes somebody from the roster without touching their RSVP. */
export async function removeAttendee(user, eventId, targetUserId) {
  const row = await loadRow(eventId)
  assertCanManage(row, user)
  const removed = await eventModel.removeAttendee(eventId, targetUserId)
  if (!removed) throw notFound('Attendee')
  return { removed: true, eventId, userId: targetUserId }
}

/** Somebody's own check-in for an event they are on the roster for. */
export async function myAttendance(viewer, eventId) {
  if (!viewer) throw forbidden('Sign in to see your attendance')
  const attendee = await eventModel.findAttendee(eventId, viewer.id)
  return attendee ? eventModel.formatAttendee(attendee) : null
}

/**
 * The two things that happen to an event without anybody asking.
 *
 * Both are sweeps rather than endpoints: a reminder is due on a day, and an event
 * is over when its date has passed. Neither is allowed to run twice, so both are
 * written for idempotency — the dedupe key on every notification means a second
 * run of the same day sends nothing, and the sweep of finished events only looks
 * at rows that are still published.
 *
 * `now` is a parameter so a test can ask about a specific day instead of
 * whichever day the machine happens to be on.
 */
export async function runEventSweeps({ now = new Date() } = {}) {
  const today = eventModel.dateOnly(now)
  const tomorrow = eventModel.dateOnly(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return {
    reminders: await sendUpcomingReminders({ from: today, to: tomorrow }),
    completed: await completeFinishedEvents({ today }),
  }
}

/**
 * Reminds the people coming to an event that starts today or tomorrow.
 *
 * Only "going" is reminded: somebody who said they might come has not promised to
 * be there, and somebody who declined should not be told where to go. The key is
 * per person per event rather than per day, so an event that stays published for
 * three days cannot send three reminders.
 */
export async function sendUpcomingReminders({ from, to, limit = 200 } = {}) {
  const events = await eventModel.findEventsNeedingReminders(from, to, { limit })
  let sent = 0
  let skipped = 0

  for (const event of events) {
    const recipients = await eventModel.reminderRecipients(event.id)
    for (const recipient of recipients) {
      const notification = await notificationService.notify({
        userId: recipient.user_id,
        type: 'event_reminder',
        title: `Reminder: ${event.title} is ${from === eventModel.dateOnly(event.event_date) ? 'today' : 'tomorrow'}`,
        body: `${readableDate(event)}${event.venue ? ` at ${event.venue}` : ''}`,
        link: `/events/${event.id}`,
        email: recipient.email,
        emailPayload: {
          ...emailFacts(event, event.organizer_name),
          name: recipient.display_name,
        },
        dedupeKey: `event:${event.id}:reminder:${recipient.user_id}`,
        metadata: { eventId: event.id, kind: 'reminder' },
      })
      if (notification) sent += 1
      else skipped += 1
    }
  }

  return { events: events.length, sent, skipped }
}

/**
 * Marks a published event finished once its day has passed.
 *
 * The organizer's own "mark complete" endpoint does the same thing, and the
 * dedupe keys are shared, so whichever gets there first tells the attendees and
 * the other is silent.
 */
export async function completeFinishedEvents({ today, limit = 200 } = {}) {
  const events = await eventModel.findEventsEndingToday(limit, today ?? null)
  let completed = 0

  for (const event of events) {
    await eventModel.setEventStatus(event.id, EVENT_STATUS.COMPLETED)
    await notifyAttendanceThanks(null, event)
    completed += 1
  }

  return { considered: events.length, completed }
}