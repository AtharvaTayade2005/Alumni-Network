import { query } from '../config/database.js'

/**
 * Events, RSVPs and the attendee roster.
 *
 * Row-to-client mapping lives here so the service and controllers never leak
 * snake_case columns, and every statement ends with the primary key in its ORDER
 * BY so a paginated list cannot repeat or skip rows that share a date.
 *
 * The stored shape is a date plus a time of day rather than a timestamp. Two
 * things follow from that and both are deliberate:
 *
 *   * Times are stored and answered in UTC. An event belongs to an institution
 *     with one timezone, but the row has nowhere to record which one, and a
 *     timestamp stored in the server's local zone would move when the host's
 *     zone did. A caller in another zone renders the instant itself.
 *   * The reminder scan compares dates, not timestamps, because it asks "which
 *     events start tomorrow" rather than "which start in the next 24 hours".
 */

/**
 * A `DATE` column, as `YYYY-MM-DD`.
 *
 * Both drivers hand a date back as a JS Date rather than as the text the column
 * holds — and both build it at *local* midnight, because a bare date has no zone
 * to interpret it in. Reading one with `toISOString()` therefore reports the day
 * before for anybody east of UTC, so the calendar fields are read locally. Every
 * read of an event's day goes through here.
 */
export function dateOnly(value) {
  if (value == null) return null
  if (value instanceof Date) {
    const pad = (part) => String(part).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  return String(value).slice(0, 10)
}

/** The stored date and time, as one instant. */
const asInstant = (date, time) => new Date(`${dateOnly(date)}T${time}Z`)
  .toISOString()
  .replace(/\.000Z$/, 'Z')

/**
 * Splits an instant into the pair the columns hold.
 *
 * `end_date` exists because 001's `end_time > start_time` cannot express an
 * event that runs past midnight; the end's own date makes the comparison a pair.
 */
export function splitInstant(start, end) {
  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)
  return {
    event_date: startDate,
    start_time: start.toISOString().slice(11, 19),
    end_time: end.toISOString().slice(11, 19),
    end_date: endDate,
  }
}

/**
 * An event, as the API presents it.
 *
 * `date` is the event's calendar day under the `date` name the rest of the
 * product already uses, and `startTime`/`endTime` are the same instants as full
 * timestamps, so a client can render either and never has to guess which half of
 * the row it is looking at.
 */
export function formatEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    /** The calendar day, for clients that group by date. */
    date: dateOnly(row.event_date),
    startTime: asInstant(row.event_date, row.start_time),
    endTime: asInstant(row.end_date ?? row.event_date, row.end_time),
    timezone: 'UTC',
    venue: row.venue,
    virtualUrl: row.virtual_url,
    isVirtual: !row.venue,
    city: row.city,
    region: row.region,
    country: row.country,
    capacity: row.max_attendees,
    rsvpDeadline: row.registration_deadline,
    imageUrl: row.image_url,
    status: row.status ? row.status.toUpperCase() : null,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    cancellation: row.cancelled_at ? {
      cancelledAt: row.cancelled_at,
      cancelledBy: row.cancelled_by,
      cancelledByName: row.canceller_name ?? null,
      reason: row.cancelled_reason,
    } : null,
    moderated: row.is_moderated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizer: row.organizer_id ? {
      id: row.organizer_id,
      name: row.organizer_name ?? null,
      avatarUrl: row.organizer_avatar_url ?? null,
    } : null,
    rsvpCount: row.rsvp_count ?? 0,
    attendeeCount: row.attendee_count ?? 0,
    seatsLeft: row.max_attendees == null
      ? null
      : Math.max(0, row.max_attendees - (row.rsvp_count ?? 0)),
    myRsvp: row.my_rsvp_status ? {
      status: rsvpStatusToApi(row.my_rsvp_status),
      guestCount: row.my_rsvp_guests ?? 0,
      createdAt: row.my_rsvp_created_at,
    } : null,
    isOrganizer: row.is_organizer ?? false,
  }
}

/** The stored `cancelled` answer, in the vocabulary the API uses. */
export function rsvpStatusToApi(stored) {
  if (stored === 'going') return 'GOING'
  if (stored === 'interested') return 'INTERESTED'
  return 'NOT_GOING'
}

export function formatRsvp(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    event: row.event_title ? {
      id: row.event_id,
      title: row.event_title,
      date: dateOnly(row.event_date),
      startTime: row.event_date ? asInstant(row.event_date, row.start_time) : null,
      endTime: row.event_date
        ? asInstant(row.end_date ?? row.event_date, row.end_time)
        : null,
      venue: row.venue,
      virtualUrl: row.virtual_url,
      imageUrl: row.image_url,
      status: row.event_status ? row.event_status.toUpperCase() : null,
    } : undefined,
    userId: row.user_id,
    status: rsvpStatusToApi(row.status),
    guestCount: row.guest_count,
    note: row.note,
    createdAt: row.created_at,
    attendee: row.attendee_id ? {
      checkedInAt: row.checked_in_at,
      notes: row.attendee_notes,
    } : null,
    attendeeCount: row.attendee_count ?? undefined,
  }
}

export function formatAttendee(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    checkedInAt: row.checked_in_at,
    checkedIn: !!row.checked_in_at,
    checkedInBy: row.checked_in_by,
    notes: row.notes,
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      name: row.user_name ?? null,
      email: row.user_email ?? null,
      avatarUrl: row.user_avatar_url ?? null,
      headline: row.user_headline ?? null,
      rsvpStatus: row.rsvp_status ? rsvpStatusToApi(row.rsvp_status) : null,
      guestCount: row.guest_count ?? 0,
    },
  }
}

/**
 * The columns a viewer-scoped event query needs, appended to every event SELECT.
 *
 * The viewer is always `$1`, which is what lets one statement shape serve every
 * listing: filters are numbered from `$2` upwards by the caller.
 */
const EVENT_SELECT = `
  SELECT e.*,
         (o.first_name || ' ' || o.last_name) AS organizer_name,
         o.avatar_url   AS organizer_avatar_url,
         (SELECT COUNT(*) FROM event_rsvps r
           WHERE r.event_id = e.id AND r.status = 'going')::int AS rsvp_count,
         (SELECT COUNT(*) FROM event_attendees a
           WHERE a.event_id = e.id)::int AS attendee_count,
         m.status      AS my_rsvp_status,
         m.guest_count AS my_rsvp_guests,
         m.created_at  AS my_rsvp_created_at,
         (e.organizer_id = $1) AS is_organizer
    FROM events e
    LEFT JOIN users o ON o.id = e.organizer_id
    LEFT JOIN event_rsvps m ON m.event_id = e.id AND m.user_id = $1`

/**
 * The WHERE clause a listing and its count share.
 *
 * `$?` in a template becomes the next free parameter number, so a filter that
 * needs the same value three times names it three times and all three become real
 * placeholders rather than interpolated SQL.
 */
function filterClause(viewerId, filters) {
  const { status, search, organizerId, upcoming, past, mine } = filters
  const params = [viewerId]
  const conditions = []
  const add = (template, ...values) => {
    let next = params.length
    const sql = template.replaceAll('$?', () => `$${++next}`)
    params.push(...values)
    conditions.push(sql)
  }

  const wantsAll = status && status.toLowerCase() === 'all'
  if (mine) {
    conditions.push('e.organizer_id = $1')
  } else if (!wantsAll) {
    // Drafts are the organizer's to manage; everybody else sees a live event.
    conditions.push(`(e.status <> 'draft' OR e.organizer_id = $1)`)
  }
  if (status && !wantsAll) add('e.status = $?', status.toLowerCase())
  if (organizerId) add('e.organizer_id = $?', organizerId)
  if (search) {
    add(`(e.title ILIKE $? OR COALESCE(e.description, '') ILIKE $?
          OR COALESCE(e.venue, '') ILIKE $?)`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
if (upcoming) {
    // "Upcoming" means what the rest of the network can turn up to, so a draft is
    // not upcoming however soon its date is: it is a plan, not an event. A
    // cancelled event keeps its date, so it needs excluding on status as well or
    // an old cancellation would haunt the upcoming list.
    conditions.push("e.event_date >= CURRENT_DATE AND e.status = 'published'")
  }
  if (past) {
    conditions.push(`(e.event_date < CURRENT_DATE OR e.status IN ('completed', 'cancelled'))`)
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params }
}

/**
 * The event listing.
 *
 * The status condition is applied in SQL rather than by removing rows afterwards,
 * because a viewer who is not the organizer must never receive a draft even when
 * the filter asked for one.
 */
export async function listEvents(viewerId, filters = {}) {
  const { limit = 20, offset = 0 } = filters
  const { where, params } = filterClause(viewerId, filters)
  const sql = `${EVENT_SELECT}
    ${where}
    ORDER BY e.event_date ASC, e.start_time ASC, e.id ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  params.push(limit, offset)

  const { rows } = await query(sql, params)
  return rows.map(formatEvent)
}

/** A count that agrees with `listEvents`' filters, for pagination. */
export async function countEvents(viewerId, filters = {}) {
  const { where, params } = filterClause(viewerId, filters)
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM events e ${where}`, params,
  )
  return rows[0].total
}

/** One event, with the viewer's own answer attached. */
export async function findEventById(id, viewerId) {
  const { rows } = await query(`${EVENT_SELECT} WHERE e.id = $2`, [viewerId, id])
  return rows[0] ? formatEvent(rows[0]) : null
}
/** The stored row, for the service's own decisions. */
export async function findEventRow(id) {
  const { rows } = await query('SELECT * FROM events WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function createEvent(data) {
  const { rows } = await query(
    `INSERT INTO events (organizer_id, title, description, event_date, start_time,
       end_time, end_date, venue, virtual_url, city, region, country,
       max_attendees, registration_deadline, image_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [data.organizerId, data.title, data.description ?? '', data.event_date,
      data.start_time, data.end_time, data.end_date ?? data.event_date,
      data.venue, data.virtualUrl, data.city, data.region, data.country,
      data.max_attendees, data.registration_deadline, data.imageUrl,
      data.status ?? 'draft'],
  )
  return rows[0]
}

/** A partial update. Only the columns the caller supplied are written. */
export async function updateEventRow(id, columns) {
  const keys = Object.keys(columns)
  if (!keys.length) return findEventRow(id)
  const assignments = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const { rows } = await query(
    `UPDATE events SET ${assignments} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((key) => columns[key])],
  )
  return rows[0] ?? null
}

export async function deleteEvent(id) {
  const { rows } = await query('DELETE FROM events WHERE id = $1 RETURNING id', [id])
  return rows[0] ?? null
}

/**
 * Moves an event between states.
 *
 * `published_at` is stamped on the transition into published and kept
 * afterwards, because it answers "when did this become visible" rather than
 * "when was it last set to published".
 */
export async function setEventStatus(id, status, extra = {}) {
  const { rows } = await query(
    `UPDATE events
        SET status = $2::varchar,
            published_at = CASE WHEN $2::varchar = 'published' AND published_at IS NULL
                               THEN NOW() ELSE published_at END,
            cancelled_at = CASE WHEN $2::varchar = 'cancelled' THEN NOW()
                                ELSE cancelled_at END,
            cancelled_by = CASE WHEN $2::varchar = 'cancelled' THEN $3::uuid
                                ELSE cancelled_by END,
            cancelled_reason = CASE WHEN $2::varchar = 'cancelled' THEN $4
                                    ELSE cancelled_reason END
      WHERE id = $1
      RETURNING *`,
    [id, status, extra.cancelledBy ?? null, extra.reason ?? null],
  )
  return rows[0] ?? null
}

/** Everybody who said they were coming, with their guests. */
export async function goingUserIds(eventId) {
  const { rows } = await query(
    `SELECT DISTINCT user_id FROM event_rsvps
      WHERE event_id = $1 AND status = 'going'`, [eventId],
  )
  return rows.map((r) => r.user_id)
}

/**
 * The head count, used to decide whether an RSVP fits.
 *
 * Guests count towards it, because a member who brings four is occupying five
 * places. The query runs on whichever client the caller passes, so the count is
 * taken under the same row lock as the capacity check rather than before it.
 */
export async function headcount(eventId, db = { query }) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(1 + guest_count), 0)::int AS taken
       FROM event_rsvps
      WHERE event_id = $1 AND status = 'going'`, [eventId],
  )
  return rows[0].taken
}

/** One member's answer for one event. */
export async function findRsvp(eventId, userId, db = { query }) {
  const { rows } = await db.query(
    'SELECT * FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [eventId, userId],
  )
  return rows[0] ?? null
}

export async function upsertRsvp(eventId, userId, { status, guestCount = 0, note = null }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO event_rsvps (event_id, user_id, status, guest_count, note)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET status = EXCLUDED.status,
           guest_count = EXCLUDED.guest_count,
           note = COALESCE(EXCLUDED.note, event_rsvps.note)
     RETURNING *`,
    [eventId, userId, status, guestCount, note],
  )
  return rows[0]
}

export async function deleteRsvp(eventId, userId) {
  const { rows } = await query(
    'DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2 RETURNING id',
    [eventId, userId],
  )
  return rows[0] ?? null
}

/**
 * The roster for one event.
 *
 * The attendee row and the RSVP are joined because a check-in has nothing to do
 * with somebody who never answered, and the organizer's question is "who is here",
 * which is a question about people rather than about answers.
 */
export async function listRsvps(eventId, { status, limit = 50, offset = 0 } = {}) {
  const params = [eventId]
  const conditions = ['r.event_id = $1']
  if (status) {
    params.push(status)
    conditions.push(`r.status = $${params.length}`)
  }
  const { rows } = await query(
    `SELECT r.*, a.id AS attendee_id, a.checked_in_at, a.notes AS attendee_notes,
            (u.first_name || ' ' || u.last_name) AS user_name, u.email, u.avatar_url
       FROM event_rsvps r
       LEFT JOIN event_attendees a ON a.event_id = r.event_id AND a.user_id = r.user_id
       LEFT JOIN users u ON u.id = r.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.created_at ASC, r.id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return rows.map(formatRsvp)
}

/** A member's own list, which is the same query filtered by user instead of event. */
export async function listMyRsvps(userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT r.*, a.id AS attendee_id, a.checked_in_at, a.notes AS attendee_notes,
            e.title AS event_title, e.event_date, e.start_time, e.end_time, e.end_date,
            e.venue, e.virtual_url, e.image_url, e.status AS event_status,
            (SELECT COUNT(*) FROM event_attendees x WHERE x.event_id = e.id)::int
              AS attendee_count
       FROM event_rsvps r
       JOIN events e ON e.id = r.event_id
       LEFT JOIN event_attendees a ON a.event_id = r.event_id AND a.user_id = r.user_id
      WHERE r.user_id = $1
      ORDER BY e.event_date DESC, e.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return rows.map(formatRsvp)
}

/** Adds somebody to the roster. The organizer may add a walk-in. */
export async function upsertAttendee(eventId, userId, { notes = null, checkedInAt = null, checkedInBy = null }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO event_attendees (event_id, user_id, notes, checked_in_at, checked_in_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET notes = COALESCE(EXCLUDED.notes, event_attendees.notes)
     RETURNING *`,
    [eventId, userId, notes, checkedInAt, checkedInBy],
  )
  return rows[0]
}

/**
 * Marks somebody present, or un-marks them.
 *
 * A check-in is a fact about a moment, so the timestamp is written when it
 * happens rather than when the row was created, and clearing it is a separate
 * explicit call: the organizer pressed undo.
 */
export async function setAttendeeCheckIn(eventId, userId, { checkedIn, checkedInBy = null }) {
  const { rows } = await query(
    `UPDATE event_attendees
        SET checked_in_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
            checked_in_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
      WHERE event_id = $1 AND user_id = $2
      RETURNING *`,
    [eventId, userId, checkedIn, checkedInBy],
  )
  return rows[0] ?? null
}

export async function findAttendee(eventId, userId, db = { query }) {
  const { rows } = await db.query(
    'SELECT * FROM event_attendees WHERE event_id = $1 AND user_id = $2', [eventId, userId],
  )
  return rows[0] ?? null
}

export async function removeAttendee(eventId, userId, db = { query }) {
  const { rows } = await db.query(
    'DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2 RETURNING id',
    [eventId, userId],
  )
  return rows[0] ?? null
}

export async function listAttendees(eventId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT a.*,
            (u.first_name || ' ' || u.last_name) AS user_name,
            u.email AS user_email, u.avatar_url AS user_avatar_url,
            COALESCE(ap.current_position, sp.degree) AS user_headline,
            r.status AS rsvp_status, r.guest_count
       FROM event_attendees a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN student_profiles sp ON sp.user_id = a.user_id
       LEFT JOIN alumni_profiles ap ON ap.user_id = a.user_id
       LEFT JOIN event_rsvps r ON r.event_id = a.event_id AND r.user_id = a.user_id
      WHERE a.event_id = $1
      ORDER BY a.checked_in_at DESC NULLS LAST, a.created_at ASC, a.id ASC
      LIMIT $2 OFFSET $3`,
    [eventId, limit, offset],
  )
  return rows.map(formatAttendee)
}

/**
 * The events a reminder is due for.
 *
 * The window is expressed in dates rather than timestamps because that is how the
 * question is asked: an event happening tomorrow needs telling today. `start_time`
 * is returned so the email can say what time it is.
 */
export async function findEventsNeedingReminders(fromDate, toDate, { limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT e.*, o.email AS organizer_email,
            (o.first_name || ' ' || o.last_name) AS organizer_name
       FROM events e
       LEFT JOIN users o ON o.id = e.organizer_id
      WHERE e.status = 'published'
        AND e.event_date >= $1
        AND e.event_date <= $2
      ORDER BY e.event_date ASC, e.id ASC
      LIMIT $3`,
    [fromDate, toDate, limit],
  )
  return rows
}

/** Everybody due a reminder for one event: the people who are coming. */
export async function reminderRecipients(eventId) {
  const { rows } = await query(
    `SELECT r.user_id, u.email,
            (u.first_name || ' ' || u.last_name) AS display_name
       FROM event_rsvps r
       JOIN users u ON u.id = r.user_id
      WHERE r.event_id = $1 AND r.status = 'going'
      ORDER BY r.created_at ASC, r.id ASC`,
    [eventId],
  )
  return rows
}

/**
 * Every published event whose day has passed, for the completion sweep.
 *
 * The cut-off is a parameter rather than CURRENT_DATE so the sweep can be asked
 * about a specific day. It defaults to the database's today, which is what the
 * scheduler wants: a long outage must not complete an event the day it is running.
 */
export async function findEventsEndingToday(limit = 100, beforeDate = null) {
  const { rows } = await query(
    `SELECT * FROM events
      WHERE status = 'published'
        AND event_date < COALESCE($2::date, CURRENT_DATE)
      ORDER BY event_date ASC, id ASC
      LIMIT $1`, [limit, beforeDate],
  )
  return rows
}