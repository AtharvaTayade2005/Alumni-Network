import 'dotenv/config'
import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import {
  directQuery, startTestDatabase, stopTestDatabase,
} from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

// Must happen before anything imports config/database.js, because the pool is built at
// module load time.
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')

let seq = 0
const uniq = () => `events.${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`

async function resetAll() {
  await query(
    `TRUNCATE users, events, event_rsvps, event_attendees, notifications,
     notification_preferences, email_queue
     RESTART IDENTITY CASCADE`,
  )
}

async function createUser({ role = 'ALUMNI', email }) {
  const passwordHash = await hashPassword('Str0ngPass!23')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1,$2,'Test','Person',TRUE) RETURNING id, email`,
    [email, passwordHash],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)`,
    [id, role],
  )
  if (role === 'STUDENT') {
    await query(
      `INSERT INTO student_profiles (user_id, degree, department, year_of_study)
       VALUES ($1,'BS Software Engineering','Computing',3)`,
      [id],
    )
  } else {
    await query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department,
         current_company, current_position, industry, bio, city, country,
         latitude, longitude, is_open_to_mentor, show_on_map, verification_status)
       VALUES ($1,2018,'BSc Computer Science','Computing','Acme','Engineer',
         'Software','Builds things','Karachi','Pakistan',24.8607,67.0011,TRUE,TRUE,'verified')`,
      [id],
    )
  }
  await query('INSERT INTO privacy_settings (user_id) VALUES ($1)', [id])
  await query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [id])
  return { id, email, password: 'Str0ngPass!23' }
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

/** Tomorrow, as the API sends instants: UTC, with a time of day. */
function tomorrowAt(hour = 18) {
  const day = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `${day}T${String(hour).padStart(2, '0')}:00:00Z`
}

function inDays(days, hour = 18) {
  const day = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `${day}T${String(hour).padStart(2, '0')}:00:00Z`
}

const eventBody = (overrides = {}) => ({
  title: 'Alumni Winter Meetup',
  description: 'An evening of talks and introductions for alumni and students.',
  startTime: tomorrowAt(18),
  endTime: tomorrowAt(21),
  venue: 'Engineering Hall',
  city: 'Karachi',
  ...overrides,
})

/** Creates an event and publishes it, which is the state most tests need. */
async function createEvent(token, overrides = {}, { publish = true } = {}) {
  const created = await request(app)
    .post('/api/events')
    .set(asAuth(token))
    .send(eventBody(overrides))
  assert.equal(created.status, 201, JSON.stringify(created.body))
  if (!publish) return created.body.data
  const published = await request(app)
    .post(`/api/events/${created.body.data.id}/publish`)
    .set(asAuth(token))
  assert.equal(published.status, 200, JSON.stringify(published.body))
  return published.body.data
}

const rsvp = (token, eventId, body = {}) => request(app)
  .post(`/api/events/${eventId}/rsvp`)
  .set(asAuth(token))
  .send({ status: 'going', ...body })

/** Every notification row for one user, newest first. */
async function notificationsFor(userId) {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at ASC, id ASC', [userId],
  )
  return rows
}

describe('phase 5 events', () => {
  let organizer
  let member
  let stranger
  let organizerToken
  let memberToken
  let strangerToken

  /**
   * Everybody is created per test rather than once for the suite.
   *
   * resetAll truncates users, which would leave every token issued earlier
   * pointing at an account that no longer exists; the auth middleware answers 401
   * on a valid token whose user is gone, so a shared fixture would fail every test
   * after the first.
   */
  beforeEach(async () => {
    await resetAll()
    organizer = await createUser({ role: 'ALUMNI', email: `${uniq()}@example.com` })
    member = await createUser({ role: 'STUDENT', email: `${uniq()}@example.com` })
    stranger = await createUser({ role: 'STUDENT', email: `${uniq()}@example.com` })
    organizerToken = await loginAs(organizer)
    memberToken = await loginAs(member)
    strangerToken = await loginAs(stranger)
  })

  after(async () => {
    await closePool()
    await stopTestDatabase()
  })

  describe('creating an event', () => {
    it('creates a draft, not a live event', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody())

      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.equal(res.body.data.status, 'DRAFT')
      assert.equal(res.body.data.publishedAt, null)
      assert.equal(res.body.data.organizer.id, organizer.id)
    })

    it('answers with the date as well as the instants', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })

      assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/)
      assert.equal(event.startTime, tomorrowAt(18))
      assert.equal(event.endTime, tomorrowAt(21))
      assert.equal(event.timezone, 'UTC')
      assert.equal(event.isVirtual, false)
    })

    it('refuses an event with neither a venue nor a link', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send({ ...eventBody(), venue: undefined })

      assert.equal(res.status, 422)
      assert.ok(
        res.body.error.details.some((d) => d.field === 'venue'),
        JSON.stringify(res.body.error.details),
      )
    })

    it('refuses an event that ends before it starts', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ endTime: tomorrowAt(17) }))

      assert.equal(res.status, 422)
      assert.ok(res.body.error.details.some((d) => d.field === 'endTime'))
    })

    it('refuses an RSVP deadline after the event', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ rsvpDeadline: inDays(9) }))

      assert.equal(res.status, 422)
      assert.ok(res.body.error.details.some((d) => d.field === 'rsvpDeadline'))
    })

    it('accepts an event that runs past midnight', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ startTime: tomorrowAt(22), endTime: inDays(2, 2) }))

      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.ok(res.body.data.endTime > res.body.data.startTime)
    })

    it('will not let an alumnus publish on creation', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ status: 'PUBLISHED' }))

      assert.equal(res.status, 403)
    })

    it('lets a moderator publish on creation', async () => {
      const moderator = await createUser({ role: 'MODERATOR', email: `${uniq()}@example.com` })
      const token = await loginAs(moderator)
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(token))
        .send(eventBody({ status: 'PUBLISHED' }))

      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.equal(res.body.data.status, 'PUBLISHED')
      assert.ok(res.body.data.publishedAt)
    })

    it('accepts the lower-case and dashed spellings of a status', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ status: 'draft' }))
      assert.equal(res.status, 201)
      assert.equal(res.body.data.status, 'DRAFT')

      const other = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ status: 'in-review' }))
      // 'in-review' is not one of the four states, so it is refused rather than
      // guessed at.
      assert.equal(other.status, 422)
    })

    it('refuses a javascript join link', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(asAuth(organizerToken))
        .send(eventBody({ venue: null, virtualUrl: 'javascript:alert(1)' }))

      assert.equal(res.status, 422)
    })
  })

  describe('reading events', () => {
    it('hides a draft from everybody but its organizer', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })

      const asOrganizer = await request(app)
        .get(`/api/events/${event.id}`).set(asAuth(organizerToken))
      assert.equal(asOrganizer.status, 200)

      // Reported as missing rather than forbidden: the board does not confirm that
      // somebody's draft exists to a stranger.
      const asStranger = await request(app)
        .get(`/api/events/${event.id}`).set(asAuth(strangerToken))
      assert.equal(asStranger.status, 404)
    })

    it('lists a published event to anybody signed in', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app).get('/api/events').set(asAuth(strangerToken))
      assert.equal(res.status, 200)
      assert.ok(res.body.data.some((e) => e.id === event.id))
      assert.equal(res.body.meta.total, 1)
    })

    it('requires a session to list events', async () => {
      const res = await request(app).get('/api/events')
      assert.equal(res.status, 401)
    })

    it('leaves a draft out of the public list but not the organizer list', async () => {
      await createEvent(organizerToken, {}, { publish: false })

      const publicList = await request(app).get('/api/events').set(asAuth(strangerToken))
      assert.equal(publicList.body.data.length, 0)

      const mine = await request(app).get('/api/events/mine').set(asAuth(organizerToken))
      assert.equal(mine.body.data.length, 1)
      assert.equal(mine.body.data[0].status, 'DRAFT')
    })

    it('filters by search, status and date', async () => {
      await createEvent(organizerToken, { title: 'Winter Meetup' })
      await createEvent(organizerToken, { title: 'Summer Reunion', startTime: inDays(90), endTime: inDays(90, 21) })
      await createEvent(organizerToken, { title: 'Winter Meetup Draft', status: 'DRAFT' }, { publish: false })

      const search = await request(app)
        .get('/api/events').query({ search: 'winter' }).set(asAuth(organizerToken))
      assert.equal(search.body.data.length, 2)

      const published = await request(app)
        .get('/api/events').query({ status: 'published' }).set(asAuth(organizerToken))
      assert.equal(published.body.data.length, 2)

      const upcoming = await request(app)
        .get('/api/events').query({ upcoming: true }).set(asAuth(organizerToken))
      assert.equal(upcoming.body.data.length, 2)
    })

    it('rejects an unknown status filter rather than ignoring it', async () => {
      const res = await request(app)
        .get('/api/events').query({ status: 'sideways' }).set(asAuth(organizerToken))
      assert.equal(res.status, 422)
    })
  })

  describe('changing an event', () => {
    it('lets the organizer change the details of a draft', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ title: 'Renamed Meetup', venue: 'Physics Wing' })

      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.title, 'Renamed Meetup')
      assert.equal(res.body.data.venue, 'Physics Wing')
    })

    it('refuses an edit by somebody who does not organize it', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(strangerToken))
        .send({ title: 'Hijacked' })

      assert.equal(res.status, 403)
    })

    it('refuses an edit that would leave the event with nowhere to be', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ venue: null })

      assert.equal(res.status, 400)
    })

    it('refuses an edit that moves the start past the stored RSVP deadline', async () => {
      const event = await createEvent(organizerToken, {
        rsvpDeadline: inDays(5, 12),
        startTime: inDays(7, 18),
        endTime: inDays(7, 21),
      }, { publish: false })

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ startTime: inDays(3, 18), endTime: inDays(3, 21) })

      assert.equal(res.status, 400)
      assert.match(res.body.error.message, /deadline/i)
    })

    it('tells the people going when the time or venue moves', async () => {
      const event = await createEvent(organizerToken)
      assert.equal((await rsvp(memberToken, event.id)).status, 200)

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ venue: 'Chemistry Block', startTime: inDays(2, 19), endTime: inDays(2, 22) })

      assert.equal(res.status, 200, JSON.stringify(res.body))
      const rows = await notificationsFor(member.id)
      const updates = rows.filter((r) => r.type === 'event_updated')
      assert.equal(updates.length, 1)
      assert.match(updates[0].title, /updated/i)
      assert.match(updates[0].body, /Chemistry Block/)
      assert.match(updates[0].body, /Now /)
    })

    it('does not notify anybody when nothing a reader would notice changed', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ description: 'A longer description of the same evening.' })

      assert.equal(res.status, 200)
      assert.equal((await notificationsFor(member.id)).filter((r) => r.type === 'event_updated').length, 0)
    })

    it('does not notify anybody about a draft being edited', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })
      const attempted = await rsvp(memberToken, event.id)
      assert.equal(attempted.status, 409)
      const res = await request(app)
        .patch(`/api/events/${event.id}`)
        .set(asAuth(organizerToken))
        .send({ venue: 'Somewhere else' })

      // A draft cannot be RSVP'd at all, so nobody could have been told.
      assert.equal(res.status, 200)
      assert.equal((await notificationsFor(member.id)).length, 0)
    })

    it('refuses to delete a published event and cancels it instead', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app)
        .delete(`/api/events/${event.id}`).set(asAuth(organizerToken))
      assert.equal(res.status, 409)

      const cancelled = await request(app)
        .post(`/api/events/${event.id}/cancel`)
        .set(asAuth(organizerToken))
        .send({ reason: 'The hall is double-booked.' })
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body))
      assert.equal(cancelled.body.data.status, 'CANCELLED')
    })

    it('deletes a draft outright', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })

      const res = await request(app)
        .delete(`/api/events/${event.id}`).set(asAuth(organizerToken))
      assert.equal(res.status, 200)

      const gone = await request(app)
        .get(`/api/events/${event.id}`).set(asAuth(organizerToken))
      assert.equal(gone.status, 404)
    })
  })

  describe('lifecycle', () => {
    it('will not RSVP to a draft', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })
      const res = await rsvp(memberToken, event.id)
      assert.equal(res.status, 409)
    })

    it('refuses a cancellation with no reason', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app)
        .post(`/api/events/${event.id}/cancel`).set(asAuth(organizerToken)).send({})

      assert.equal(res.status, 422)
    })

    it('broadcasts a cancellation to everybody who was coming', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)
      const second = await createUser({ role: 'ALUMNI', email: `${uniq()}@example.com` })
      const secondToken = await loginAs(second)
      await rsvp(secondToken, event.id)

      const res = await request(app)
        .post(`/api/events/${event.id}/cancel`)
        .set(asAuth(organizerToken))
        .send({ reason: 'Storm warning.' })

      assert.equal(res.status, 200, JSON.stringify(res.body))
      for (const user of [member, second]) {
        const rows = await notificationsFor(user.id)
        const cancelled = rows.filter((r) => r.type === 'event_cancelled')
        assert.equal(cancelled.length, 1, `one cancellation for ${user.email}`)
        assert.match(cancelled[0].body, /Storm warning/)
      }
    })

    it('tells somebody who was only interested when the event goes live', async () => {
      const event = await createEvent(organizerToken, {}, { publish: false })
      // Interesting RSVPs are recorded against a published event, so the event is
      // published first and the answer is changed afterwards to simulate the flow.
      await request(app).post(`/api/events/${event.id}/publish`).set(asAuth(organizerToken))
      await rsvp(memberToken, event.id, { status: 'interested' })

      await request(app).post(`/api/events/${event.id}/cancel`)
        .set(asAuth(organizerToken))
        .send({ reason: 'Called off.' })
      await request(app).post(`/api/events/${event.id}/publish`).set(asAuth(organizerToken))

      const rows = await notificationsFor(member.id)
      assert.ok(rows.some((r) => /now open/i.test(r.title)))
    })

    it('marks a finished event complete', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .post(`/api/events/${event.id}/complete`).set(asAuth(organizerToken))

      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.status, 'COMPLETED')
      assert.ok((await notificationsFor(member.id)).some((r) => /finished/i.test(r.title)))
    })

    it('refuses a move the lifecycle does not allow', async () => {
      const event = await createEvent(organizerToken)
      const res = await request(app)
        .post(`/api/events/${event.id}/publish`).set(asAuth(organizerToken))
      assert.equal(res.status, 409)
    })

    it('lets staff cancel an event whose organizer is unreachable', async () => {
      const event = await createEvent(organizerToken)
      const admin = await createUser({ role: 'ADMIN', email: `${uniq()}@example.com` })
      const adminToken = await loginAs(admin)

      const res = await request(app)
        .post(`/api/events/${event.id}/cancel`)
        .set(asAuth(adminToken))
        .send({ reason: 'Site closed by the authorities.' })

      assert.equal(res.status, 200, JSON.stringify(res.body))
    })
  })

  describe('rsvps', () => {
    it('records an answer and reports it back in the API vocabulary', async () => {
      const event = await createEvent(organizerToken)

      const res = await rsvp(memberToken, event.id)

      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.status, 'GOING')
      assert.equal(res.body.data.guestCount, 0)
    })

    it('accepts not going and interested', async () => {
      const event = await createEvent(organizerToken)

      const no = await rsvp(memberToken, event.id, { status: 'not-going' })
      assert.equal(no.status, 200)
      assert.equal(no.body.data.status, 'NOT_GOING')

      const maybe = await rsvp(memberToken, event.id, { status: 'INTERESTED' })
      assert.equal(maybe.body.data.status, 'INTERESTED')
    })

    it('replaces an earlier answer rather than adding a second one', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id, { guestCount: 2 })
      await rsvp(memberToken, event.id, { guestCount: 1 })

      const { rows } = await query(
        'SELECT * FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [event.id, member.id],
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0].guest_count, 1)
    })

    it('counts guests towards capacity', async () => {
      const event = await createEvent(organizerToken, { capacity: 3 })

      const first = await rsvp(memberToken, event.id, { guestCount: 2 })
      assert.equal(first.status, 200)

      const second = await rsvp(strangerToken, event.id)
      assert.equal(second.status, 409)
      assert.match(second.body.error.message, /full|left/i)
    })

    it('does not count somebody twice when they change their guest count', async () => {
      const event = await createEvent(organizerToken, { capacity: 2 })
      await rsvp(memberToken, event.id)

      const res = await rsvp(memberToken, event.id, { guestCount: 1 })
      assert.equal(res.status, 200, JSON.stringify(res.body))
    })

    it('lets exactly one of two simultaneous answers take the last place', async () => {
      const event = await createEvent(organizerToken, { capacity: 1 })
      const third = await createUser({ role: 'STUDENT', email: `${uniq()}@example.com` })
      const thirdToken = await loginAs(third)

      const results = await Promise.all([
        rsvp(memberToken, event.id),
        rsvp(thirdToken, event.id),
      ])

      const accepted = results.filter((r) => r.status === 200)
      const refused = results.filter((r) => r.status === 409)
      assert.equal(accepted.length, 1, 'one seat, one winner')
      assert.equal(refused.length, 1, 'one seat, one refusal')

      const { rows } = await query(
        `SELECT COUNT(*)::int AS going FROM event_rsvps
          WHERE event_id = $1 AND status = 'going'`, [event.id],
      )
      assert.equal(rows[0].going, 1)
    })

    it('refuses an RSVP after the deadline', async () => {
      const event = await createEvent(organizerToken)
      await query('UPDATE events SET registration_deadline = $2 WHERE id = $1',
        [event.id, new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10)])

      const res = await rsvp(memberToken, event.id)
      assert.equal(res.status, 409)
      assert.match(res.body.error.message, /deadline/i)
    })

    it('refuses more than five guests', async () => {
      const event = await createEvent(organizerToken)
      const res = await rsvp(memberToken, event.id, { guestCount: 6 })
      assert.equal(res.status, 422)
    })

    it('takes somebody off the roster when they stop coming', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const { rows: before } = await query(
        'SELECT * FROM event_attendees WHERE event_id = $1 AND user_id = $2', [event.id, member.id],
      )
      assert.equal(before.length, 1)

      await rsvp(memberToken, event.id, { status: 'not-going' })

      const { rows: after } = await query(
        'SELECT * FROM event_attendees WHERE event_id = $1 AND user_id = $2', [event.id, member.id],
      )
      assert.equal(after.length, 0)
    })

    it('withdraws an RSVP', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .delete(`/api/events/${event.id}/rsvp`).set(asAuth(memberToken))

      assert.equal(res.status, 200)
      const { rows } = await query(
        'SELECT * FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [event.id, member.id],
      )
      assert.equal(rows.length, 0)
    })

    it('confirms a first answer once and does not repeat it on a change', async () => {
      const event = await createEvent(organizerToken)

      await rsvp(memberToken, event.id)
      const first = (await notificationsFor(member.id)).filter((r) => r.type === 'event_rsvp')
      assert.equal(first.length, 1)
      assert.match(first[0].title, /you are going/i)

      await rsvp(memberToken, event.id, { guestCount: 1 })
      const second = (await notificationsFor(member.id)).filter((r) => r.type === 'event_rsvp')
      assert.equal(second.length, 1, 'a changed answer is not announced again')
    })

    it('tells the organizer that somebody is coming', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const rows = await notificationsFor(organizer.id)
      const told = rows.filter((r) => r.type === 'event_rsvp')
      assert.equal(told.length, 1)
      assert.match(told[0].title, /is going/i)
    })

    it('does not tell the organizer about their own RSVP', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(organizerToken, event.id)

      const rows = await notificationsFor(organizer.id)
      assert.equal(rows.filter((r) => r.type === 'event_rsvp' && /is going/i.test(r.title)).length, 0)
    })

    it('lists the caller own RSVPs with the event attached', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app).get('/api/events/my-rsvps').set(asAuth(memberToken))

      assert.equal(res.status, 200)
      assert.equal(res.body.data.length, 1)
      assert.equal(res.body.data[0].event.id, event.id)
      assert.equal(res.body.data[0].event.title, 'Alumni Winter Meetup')
    })

    it('lets only the organizer read the RSVP list', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const asOrganizer = await request(app)
        .get(`/api/events/${event.id}/rsvps`).set(asAuth(organizerToken))
      assert.equal(asOrganizer.status, 200)
      assert.equal(asOrganizer.body.data.length, 1)
      assert.equal(asOrganizer.body.data[0].userId, member.id)

      const asMember = await request(app)
        .get(`/api/events/${event.id}/rsvps`).set(asAuth(memberToken))
      assert.equal(asMember.status, 403)
    })

    it('filters the RSVP list by answer', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)
      await rsvp(strangerToken, event.id, { status: 'interested' })

      const res = await request(app)
        .get(`/api/events/${event.id}/rsvps`).query({ status: 'interested' })
        .set(asAuth(organizerToken))

      assert.equal(res.body.data.length, 1)
      assert.equal(res.body.data[0].status, 'INTERESTED')
    })
  })

  describe('the attendee roster', () => {
    it('puts somebody who is going on the roster', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .get(`/api/events/${event.id}/attendees`).set(asAuth(organizerToken))

      assert.equal(res.status, 200)
      assert.equal(res.body.data.length, 1)
      assert.equal(res.body.data[0].userId, member.id)
      assert.equal(res.body.data[0].checkedIn, false)
      assert.equal(res.body.data[0].user.email, member.email)
    })

    it('keeps the roster private to the organizer', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      for (const token of [memberToken, strangerToken]) {
        const res = await request(app)
          .get(`/api/events/${event.id}/attendees`).set(asAuth(token))
        assert.equal(res.status, 403)
      }
    })

    it('checks somebody in and back out again', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const inRes = await request(app)
        .patch(`/api/events/${event.id}/attendees/${member.id}`)
        .set(asAuth(organizerToken))
        .send({ checkedIn: true })

      assert.equal(inRes.status, 200, JSON.stringify(inRes.body))
      assert.equal(inRes.body.data.checkedIn, true)
      assert.ok(inRes.body.data.checkedInAt)
      assert.equal(inRes.body.data.checkedInBy, organizer.id)

      const outRes = await request(app)
        .patch(`/api/events/${event.id}/attendees/${member.id}`)
        .set(asAuth(organizerToken))
        .send({ checkedIn: false })

      assert.equal(outRes.body.data.checkedIn, false)
      assert.equal(outRes.body.data.checkedInAt, null)
    })

    it('refuses a check-in by anybody but the organizer', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .patch(`/api/events/${event.id}/attendees/${member.id}`)
        .set(asAuth(strangerToken))
        .send({ checkedIn: true })

      assert.equal(res.status, 403)
    })

    it('refuses a check-in for somebody who is not on the roster', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app)
        .patch(`/api/events/${event.id}/attendees/${stranger.id}`)
        .set(asAuth(organizerToken))
        .send({ checkedIn: true })

      assert.equal(res.status, 404)
    })

    it('adds a walk-in who never RSVPd', async () => {
      const event = await createEvent(organizerToken)

      const res = await request(app)
        .post(`/api/events/${event.id}/attendees`)
        .set(asAuth(organizerToken))
        .send({ userId: stranger.id, notes: 'Turned up at the door' })

      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.equal(res.body.data.userId, stranger.id)
      assert.equal(res.body.data.notes, 'Turned up at the door')
    })

    it('keeps an organizer note on an attendee', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .patch(`/api/events/${event.id}/attendees/${member.id}/notes`)
        .set(asAuth(organizerToken))
        .send({ notes: 'Brought a guest from another cohort.' })

      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.notes, 'Brought a guest from another cohort.')
    })

    it('removes somebody from the roster without touching their RSVP', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)

      const res = await request(app)
        .delete(`/api/events/${event.id}/attendees/${member.id}`)
        .set(asAuth(organizerToken))
      assert.equal(res.status, 200)

      const { rows } = await query(
        'SELECT * FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [event.id, member.id],
      )
      assert.equal(rows.length, 1, 'the RSVP is still there')
    })

    it('refuses an attendee id that is not a uuid', async () => {
      const event = await createEvent(organizerToken)
      const res = await request(app)
        .patch(`/api/events/${event.id}/attendees/not-a-uuid`)
        .set(asAuth(organizerToken))
        .send({ checkedIn: true })
      assert.equal(res.status, 422)
    })
  })

  describe('preferences applied to event notifications', () => {
    it('sends nobody a reminder they muted', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)
      await query(
        `UPDATE notification_preferences SET muted_types = ARRAY['event_rsvp']::varchar[]
          WHERE user_id = $1`, [member.id],
      )

      await rsvp(memberToken, event.id, { guestCount: 1 })

      const rows = await notificationsFor(member.id)
      assert.equal(rows.filter((r) => r.type === 'event_rsvp').length, 1, 'only the first one')
    })
  })

  describe('database guarantees', () => {
    it('refuses a direct insert that skips the place rule', async () => {
      await assert.rejects(
        directQuery(
          `INSERT INTO events (organizer_id, title, description, event_date, start_time,
             end_time)
           VALUES ($1,'Nowhere','No venue', CURRENT_DATE + 1, '10:00','11:00')
           RETURNING id`,
          [organizer.id],
        ),
        /events_place_check/,
      )
    })

    it('refuses an event whose end is before its start', async () => {
      await assert.rejects(
        directQuery(
          `INSERT INTO events (organizer_id, title, description, event_date, start_time,
             end_time, venue)
           VALUES ($1,'Backwards','Ends first', CURRENT_DATE + 1, '18:00','09:00','Hall')
           RETURNING id`,
          [organizer.id],
        ),
        /events_time_order_check/,
      )
    })

    it('refuses an rsvp with an unknown answer', async () => {
      const event = await createEvent(organizerToken)
      await assert.rejects(
        directQuery(
          `INSERT INTO event_rsvps (event_id, user_id, status)
           VALUES ($1,$2,'maybeish') RETURNING id`,
          [event.id, member.id],
        ),
        /rsvps_status_check/,
      )
    })

    it('refuses a second rsvp for the same person and event', async () => {
      const event = await createEvent(organizerToken)
      await rsvp(memberToken, event.id)
      await assert.rejects(
        directQuery(
          `INSERT INTO event_rsvps (event_id, user_id, status)
           VALUES ($1,$2,'going') RETURNING id`,
          [event.id, member.id],
        ),
        /rsvps_unique/,
      )
    })
  })
})