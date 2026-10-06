import 'dotenv/config'
import { after, afterEach, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')
const { buildTemplate } = await import('../src/services/templates.js')

let seq = 0
const uniq = () => `${Date.now()}.${seq++}.${Math.random().toString(36).slice(2, 8)}`

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

const CAREER_GOAL = 'I want to move from backend engineering into engineering management.'

/**
 * Creates a member with a role, profile and privacy row.
 *
 * `verificationStatus` and `isOpenToMentor` are separate because Phase 3 makes
 * them independent: an alumnus may be verified but not currently advertising, and
 * the database trigger refuses the reverse combination.
 */
async function createMember({
  role = 'ALUMNI',
  verificationStatus = 'verified',
  isOpenToMentor = true,
  mentorshipCapacity = 2,
  privacy = {},
  firstName = 'Test',
  lastName = 'Person',
  password = 'Str0ngPass!23',
} = {}) {
  const email = `${uniq()}@example.edu`
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name,
       is_email_verified, is_active, is_suspended)
     VALUES ($1,$2,$3,$4,TRUE,TRUE,FALSE)
     RETURNING id, email`,
    [email, await hashPassword(password), firstName, lastName],
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
       VALUES ($1,'BS Computing','Computing',3)`,
      [id],
    )
  } else {
    await query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department,
         current_company, current_position, industry, city, country,
         verification_status, is_open_to_mentor, mentorship_capacity)
       VALUES ($1, 2018, 'BSc', 'Computing', 'Acme', 'Engineer', 'Software',
         'Karachi', 'Pakistan', $2, $3, $4)`,
      [id, verificationStatus, isOpenToMentor, mentorshipCapacity],
    )
  }

  const privacyKeys = Object.keys(privacy)
  if (privacyKeys.length) {
    await query(
      `INSERT INTO privacy_settings (user_id, ${privacyKeys.join(',')})
       VALUES ($1, ${privacyKeys.map((_, i) => `$${i + 2}`).join(',')})`,
      [id, ...privacyKeys.map((k) => privacy[k])],
    )
  } else {
    await query('INSERT INTO privacy_settings (user_id) VALUES ($1)', [id])
  }
  await query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [id])

  return { id, email, password }
}

async function tokenFor(member) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: member.email, password: member.password })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

/** Creates a member and its token in one step. */
async function memberWithToken(options) {
  const member = await createMember(options)
  return { member, token: await tokenFor(member) }
}

/** Accepts a connection request between two tokens and returns the connection id. */
async function connect(requesterToken, addresseeToken, addresseeId) {
  const created = await request(app)
    .post('/api/connections')
    .set(asAuth(requesterToken))
    .send({ userId: addresseeId })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const accepted = await request(app)
    .patch(`/api/connections/${created.body.data.id}/accept`)
    .set(asAuth(addresseeToken))
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  return created.body.data.id
}

async function notificationsFor(token, type) {
  const res = await request(app)
    .get(`/api/notifications?type=${type}`)
    .set(asAuth(token))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body.data
}

/**
 * Queued mail, with each message rendered through the real template builder.
 *
 * The queue stores the template name and its payload rather than finished HTML, so
 * asserting on the rendered body is what actually proves the template and the
 * payload agree; a template that reads a field the caller never sends renders
 * "undefined" rather than failing.
 */
async function queuedEmails() {
  const { rows } = await query(
    'SELECT to_email, subject, template, payload FROM email_queue ORDER BY id',
  )
  return rows.map((row) => ({
    to_email: row.to_email,
    subject: row.subject,
    template: row.template,
    payload: row.payload,
    ...buildTemplate(row.template, row.payload ?? {}),
  }))
}

/**
 * The most recent queued mail for one template, rendered.
 *
 * Narrowed by template because connecting a pair already queues two connection
 * mails, so a test about mentorship mail cannot assert on the whole queue.
 */
async function mentorshipMail(template) {
  const all = await queuedEmails()
  return all.filter((m) => m.template === template).pop() ?? null
}

async function reset() {
  // A deliberate constraint violation elsewhere in the suite can leave the
  // single-session test transport reporting ECONNRESET for the statement that
  // follows, so the truncation is retried before the failure is believed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await query('TRUNCATE users, audit_logs, email_queue RESTART IDENTITY CASCADE')
      return
    } catch (error) {
      if (error.code !== 'ECONNRESET' || attempt === 2) throw error
    }
  }
}

/**
 * Asserts that a statement is rejected with a specific SQLSTATE.
 *
 * The suite runs against a single-session PGlite socket server, and two
 * deliberate constraint violations in a row can leave the transport reporting
 * ECONNRESET for the statement that follows. That is an artefact of the test
 * double rather than database behaviour, so a transport failure is retried once
 * and only the SQLSTATE is treated as the result under test.
 */
async function expectPgError(run, sqlstate, message) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await run()
    } catch (error) {
      if (error.code === 'ECONNRESET' && attempt === 0) continue
      assert.equal(error.code, sqlstate, message)
      return
    }
    assert.fail(`${message}: the statement was accepted`)
  }
}

before(reset)
afterEach(reset)
after(async () => {
  await closePool()
  await stopTestDatabase()
})

// =====================================================================
// Connections
// =====================================================================

describe('phase 3: connection requests', () => {
  it('sends a request to a path-addressed member and reports PENDING', async () => {
    const a = await memberWithToken({ firstName: 'Ada' })
    const b = await memberWithToken({ lastName: 'Lovelace' })

    const res = await request(app)
      .post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token))
      .send({ message: 'Hello there' })

    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'PENDING')
    assert.equal(res.body.data.direction, 'outgoing')
    assert.equal(res.body.data.peer.id, b.member.id)
    assert.equal(res.body.data.peer.name, 'Test Lovelace')
  })

  it('rejects a duplicate request in the same direction', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const first = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(first.status, 201, JSON.stringify(first.body))

    const again = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(again.status, 409, JSON.stringify(again.body))
    assert.match(again.body.message, /already sent/i)
  })

  it('rejects the reverse direction while the first request is pending', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    await request(app).post(`/api/connections/${b.member.id}`).set(asAuth(a.token)).send({})
    const reverse = await request(app).post(`/api/connections/${a.member.id}`)
      .set(asAuth(b.token)).send({})

    assert.equal(reverse.status, 409, JSON.stringify(reverse.body))
    assert.match(reverse.body.message, /already sent you a request/i)
  })

  it('refuses a self-connection', async () => {
    const a = await memberWithToken({})
    const res = await request(app)
      .post(`/api/connections/${a.member.id}`)
      .set(asAuth(a.token))
      .send({})

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /cannot connect with yourself/i)
  })

  it('honours a member who is not accepting connection requests', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({ privacy: { allow_connection_requests: false } })

    const res = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})

    assert.equal(res.status, 403, JSON.stringify(res.body))
    assert.match(res.body.message, /not accepting connection requests/i)
  })

  it('lists the caller pending requests under /requests', async () => {
    const a = await memberWithToken({ firstName: 'Grace' })
    const b = await memberWithToken({})

    await request(app).post(`/api/connections/${b.member.id}`).set(asAuth(a.token)).send({})

    const res = await request(app).get('/api/connections/requests').set(asAuth(b.token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].status, 'PENDING')
    assert.equal(res.body.data[0].direction, 'incoming')
    assert.equal(res.body.data[0].peer.firstName ?? res.body.data[0].peer.name, 'Grace Person')
  })

  it('reports the connection counts alongside the list', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await request(app).post(`/api/connections/${b.member.id}`).set(asAuth(a.token)).send({})

    const res = await request(app).get('/api/connections').set(asAuth(a.token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.meta.counts.outgoing, 1)
    assert.equal(res.body.meta.counts.accepted, 0)
  })
})

describe('phase 3: accepting and rejecting a request', () => {
  it('lets the addressee accept and notifies the requester', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const created = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    const id = created.body.data.id

    const accepted = await request(app)
      .patch(`/api/connections/${id}/accept`)
      .set(asAuth(b.token))

    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    assert.equal(accepted.body.data.status, 'ACCEPTED')
    assert.ok(accepted.body.data.respondedAt, 'responded_at should be recorded')

    const feed = await notificationsFor(a.token, 'connection_accepted')
    assert.ok(feed.some((n) => n.type === 'connection_accepted'),
      'the requester should be told the connection was accepted')
  })

  it('lets the addressee reject without notifying the requester', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const created = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})

    const rejected = await request(app)
      .patch(`/api/connections/${created.body.data.id}/reject`)
      .set(asAuth(b.token))

    assert.equal(rejected.status, 200, JSON.stringify(rejected.body))
    assert.equal(rejected.body.data.status, 'REJECTED')

    const feed = await notificationsFor(a.token, 'connection_accepted')
    assert.equal(feed.length, 0, 'a decline is not worth an acceptance notification')
  })

  it('refuses an acceptance by anyone but the addressee', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    const intruder = await memberWithToken({})

    const created = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})

    // The requester cannot accept their own request.
    const byRequester = await request(app)
      .patch(`/api/connections/${created.body.data.id}/accept`)
      .set(asAuth(a.token))
    assert.equal(byRequester.status, 403, JSON.stringify(byRequester.body))

    const byIntruder = await request(app)
      .patch(`/api/connections/${created.body.data.id}/accept`)
      .set(asAuth(intruder.token))
    assert.equal(byIntruder.status, 403, JSON.stringify(byIntruder.body))
    assert.match(byIntruder.body.message, /addressed to you/i)
  })

  it('rejects a second decision on the same request', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    const id = await connect(a.token, b.token, b.member.id)

    const again = await request(app)
      .patch(`/api/connections/${id}/accept`)
      .set(asAuth(b.token))
    assert.equal(again.status, 400, JSON.stringify(again.body))
    assert.match(again.body.message, /already been handled/i)

    const reject = await request(app)
      .patch(`/api/connections/${id}/reject`)
      .set(asAuth(b.token))
    assert.equal(reject.status, 400, JSON.stringify(reject.body))
  })

  it('reports 404 for an unknown connection id', async () => {
    const a = await memberWithToken({})
    const res = await request(app)
      .patch('/api/connections/6f1b2c34-0000-4000-8000-000000000000/accept')
      .set(asAuth(a.token))

    assert.equal(res.status, 404, JSON.stringify(res.body))
  })
})

describe('phase 3: connection removal', () => {
  it('lets either participant delete the connection by id', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    const id = await connect(a.token, b.token, b.member.id)

    const byRequester = await request(app)
      .delete(`/api/connections/${id}`)
      .set(asAuth(a.token))
    assert.equal(byRequester.status, 200, JSON.stringify(byRequester.body))

    const status = await request(app)
      .get(`/api/connections/status/${b.member.id}`)
      .set(asAuth(a.token))
    assert.equal(status.body.data.state, 'none')
  })

  it('refuses to delete a connection the caller is not part of', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    const outsider = await memberWithToken({})
    const id = await connect(a.token, b.token, b.member.id)

    const res = await request(app)
      .delete(`/api/connections/${id}`)
      .set(asAuth(outsider.token))
    assert.equal(res.status, 404, JSON.stringify(res.body))

    const still = await request(app)
      .get(`/api/connections/status/${b.member.id}`)
      .set(asAuth(a.token))
    assert.equal(still.body.data.state, 'connected')
  })

  it('lets the pair try again after a rejection', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const created = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    await request(app).patch(`/api/connections/${created.body.data.id}/reject`)
      .set(asAuth(b.token))

    const retry = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(retry.status, 201, JSON.stringify(retry.body))
    assert.equal(retry.body.data.status, 'PENDING')
  })
})

describe('phase 3: blocking', () => {
  it('blocks a pending request and stops the pair connecting', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const created = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(created.status, 201, JSON.stringify(created.body))

    const blocked = await request(app)
      .post(`/api/connections/${a.member.id}/block`)
      .set(asAuth(b.token))
    assert.equal(blocked.status, 200, JSON.stringify(blocked.body))

    // The requester can no longer proceed, and cannot even see who blocked them.
    const status = await request(app)
      .get(`/api/connections/status/${b.member.id}`)
      .set(asAuth(a.token))
    assert.equal(status.body.data.state, 'blocked')

    const retry = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(retry.status, 403, JSON.stringify(retry.body))
  })

  it('blocks a member who was already connected', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await connect(a.token, b.token, b.member.id)

    const blocked = await request(app)
      .post(`/api/connections/${a.member.id}/block`)
      .set(asAuth(b.token))
    assert.equal(blocked.status, 200, JSON.stringify(blocked.body))

    // Both sides read the same state: the blocked member must not learn they
    // were blocked, so 'blocked' is what the requester is told too.
    const blockerView = await request(app)
      .get(`/api/connections/status/${a.member.id}`)
      .set(asAuth(b.token))
    assert.equal(blockerView.body.data.state, 'blocked')

    const blockedView = await request(app)
      .get(`/api/connections/status/${b.member.id}`)
      .set(asAuth(a.token))
    assert.equal(blockedView.body.data.state, 'blocked')
  })

  it('blocks a member with no prior connection at all', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const blocked = await request(app)
      .post(`/api/connections/${b.member.id}/block`)
      .set(asAuth(a.token))
    assert.equal(blocked.status, 200, JSON.stringify(blocked.body))

    const list = await request(app).get('/api/connections?status=BLOCKED')
      .set(asAuth(a.token))
    assert.equal(list.status, 200, JSON.stringify(list.body))
    assert.equal(list.body.data.length, 1)
    assert.equal(list.body.data[0].status, 'BLOCKED')
    assert.equal(list.body.data[0].blockedByMe, true)
    // A block exposes no peer details, so the blocked party's profile is not
    // echoed back to the blocker either.
    assert.equal(list.body.data[0].peer, null)
  })

  it('is idempotent', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    const first = await request(app).post(`/api/connections/${b.member.id}/block`)
      .set(asAuth(a.token))
    const second = await request(app).post(`/api/connections/${b.member.id}/block`)
      .set(asAuth(a.token))

    assert.equal(first.status, 200)
    assert.equal(second.status, 200, JSON.stringify(second.body))

    const { rows } = await query(
      'SELECT COUNT(*)::int AS c FROM connections WHERE status = $1', ['blocked'],
    )
    assert.equal(rows[0].c, 1, 'blocking twice must not create a second row')
  })

  it('refuses to let the blocked member clear the block', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await request(app).post(`/api/connections/${b.member.id}/block`).set(asAuth(a.token))

    const res = await request(app)
      .delete(`/api/connections/${a.member.id}/block`)
      .set(asAuth(b.token))
    assert.equal(res.status, 404, JSON.stringify(res.body))

    const status = await request(app)
      .get(`/api/connections/status/${b.member.id}`)
      .set(asAuth(a.token))
    assert.equal(status.body.data.state, 'blocked')
  })

  it('lets the blocker lift the block and re-request', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await request(app).post(`/api/connections/${b.member.id}/block`).set(asAuth(a.token))

    const unblocked = await request(app)
      .delete(`/api/connections/${b.member.id}/block`)
      .set(asAuth(a.token))
    assert.equal(unblocked.status, 200, JSON.stringify(unblocked.body))

    const retry = await request(app).post(`/api/connections/${b.member.id}`)
      .set(asAuth(a.token)).send({})
    assert.equal(retry.status, 201, JSON.stringify(retry.body))
  })

  it('refuses to block yourself', async () => {
    const a = await memberWithToken({})
    const res = await request(app)
      .post(`/api/connections/${a.member.id}/block`)
      .set(asAuth(a.token))

    assert.equal(res.status, 400, JSON.stringify(res.body))
  })

  it('requires authentication for every connection route', async () => {
    const paths = [
      ['get', '/api/connections'],
      ['get', '/api/connections/requests'],
      ['post', '/api/connections/6f1b2c34-0000-4000-8000-000000000000'],
      ['patch', '/api/connections/6f1b2c34-0000-4000-8000-000000000000/accept'],
      ['delete', '/api/connections/6f1b2c34-0000-4000-8000-000000000000'],
      ['post', '/api/connections/6f1b2c34-0000-4000-8000-000000000000/block'],
      ['delete', '/api/connections/6f1b2c34-0000-4000-8000-000000000000/block'],
    ]
    for (const [method, path] of paths) {
      const res = await request(app)[method](path).send({})
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path} should require auth`)
    }
  })

  it('rejects a non-uuid target instead of crashing', async () => {
    const a = await memberWithToken({})
    const res = await request(app).post('/api/connections/not-a-uuid').set(asAuth(a.token))

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('rejects an unknown connection state filter', async () => {
    const a = await memberWithToken({})
    const res = await request(app).get('/api/connections?status=BANANA').set(asAuth(a.token))

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('accepts the lowercase state filter for older clients', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await connect(a.token, b.token, b.member.id)

    const res = await request(app).get('/api/connections?status=accepted').set(asAuth(a.token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].status, 'ACCEPTED')
  })
})

// =====================================================================
// Mentor availability
// =====================================================================

describe('phase 3: mentor availability', () => {
  it('lets a verified alumnus advertise availability', async () => {
    const mentor = await memberWithToken({ verificationStatus: 'verified' })

    const res = await request(app)
      .put('/api/alumni/me')
      .set(asAuth(mentor.token))
      .send({ mentorshipAvailable: true })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.alumni.mentorshipAvailable, true)
  })

  it('refuses to let the database advertise an unverified alumnus', async () => {
    const mentor = await createMember({ verificationStatus: 'pending', isOpenToMentor: false })
    await expectPgError(
      () => query(
        `UPDATE alumni_profiles SET verification_status = 'pending', is_open_to_mentor = TRUE
         WHERE user_id = $1`,
        [mentor.id],
      ),
      '23514',
      'an unverified alumnus must not be allowed to advertise as a mentor',
    )
  })

  it('stops advertising the moment verification is revoked', async () => {
    const mentor = await createMember({ verificationStatus: 'verified', isOpenToMentor: true })
    const admin = await memberWithToken({ role: 'ADMIN' })

    const rejected = await request(app)
      .patch(`/api/admin/alumni/${mentor.id}/reject`)
      .set(asAuth(admin.token))
      .send({ reason: 'Could not confirm the degree' })
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body))

    const { rows } = await query(
      'SELECT is_open_to_mentor FROM alumni_profiles WHERE user_id = $1', [mentor.id],
    )
    assert.equal(rows[0].is_open_to_mentor, false,
      'a rejected alumnus must not stay in the mentor directory')
  })

  it('does not let a student advertise as a mentor', async () => {
    const student = await memberWithToken({ role: 'STUDENT' })

    // mentorshipAvailable is not part of the student profile contract at all.
    const res = await request(app)
      .put('/api/students/me')
      .set(asAuth(student.token))
      .send({ mentorshipAvailable: true, bio: 'Final year student' })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const { rows } = await query(
      'SELECT is_open_to_mentorship FROM student_profiles WHERE user_id = $1',
      [student.member.id],
    )
    // The flag a student owns is about being mentored, and is untouched by a
    // field named mentorshipAvailable.
    assert.equal(rows[0].is_open_to_mentorship, true)
    assert.equal(res.body.data.student.mentorshipAvailable, undefined,
      'a student profile must not expose a mentor-facing availability flag')
    assert.equal(res.body.data.student.openToMentorship, true)
  })

  it('lists available mentors with open slots to a student', async () => {
    const mentor = await memberWithToken({
      firstName: 'Maya', verificationStatus: 'verified', isOpenToMentor: true,
    })
    const student = await memberWithToken({ role: 'STUDENT' })

    const res = await request(app).get('/api/mentorship/mentors').set(asAuth(student.token))
    assert.equal(res.status, 200, JSON.stringify(res.body))

    const found = res.body.data.find((row) => row.id === mentor.member.id)
    assert.ok(found, 'the mentor should be discoverable')
    assert.equal(found.openSlots, 2)
    assert.equal(found.name, 'Maya Person')
  })

  it('hides an unverified or closed alumnus from the mentor directory', async () => {
    const pending = await createMember({ verificationStatus: 'pending', isOpenToMentor: false })
    const closed = await createMember({ verificationStatus: 'verified', isOpenToMentor: false })
    const student = await memberWithToken({ role: 'STUDENT' })

    const res = await request(app).get('/api/mentorship/mentors').set(asAuth(student.token))
    assert.equal(res.status, 200)

    const ids = res.body.data.map((row) => row.id)
    assert.ok(!ids.includes(pending.id), 'an unverified alumnus is not a mentor')
    assert.ok(!ids.includes(closed.id), 'a closed alumnus is not a mentor')
  })

  it('does not list a student as an available mentor', async () => {
    const student = await memberWithToken({ role: 'STUDENT' })
    const viewer = await memberWithToken({ role: 'STUDENT' })

    const res = await request(app).get('/api/mentorship/mentors').set(asAuth(viewer.token))
    assert.equal(res.status, 200)
    assert.ok(!res.body.data.some((row) => row.id === student.member.id))
  })
})

// =====================================================================
// Mentorship requests
// =====================================================================

describe('phase 3: requesting mentorship', () => {
  it('lets a connected student request a mentor using the spec field names', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({
        mentorId: mentor.member.id,
        careerGoal: CAREER_GOAL,
        interestArea: 'Engineering management',
        message: 'I would value your advice.',
        preferredCommunication: 'video',
      })

    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'PENDING')
    assert.equal(res.body.data.role, 'mentee')
    assert.equal(res.body.data.direction, 'outgoing')
    assert.equal(res.body.data.interestArea, 'Engineering management')
    assert.equal(res.body.data.preferredCommunication, 'video')
    // The original spellings stay on the row for existing clients.
    assert.equal(res.body.data.areaOfInterest, 'Engineering management')
    assert.equal(res.body.data.preferredMode, 'video')
    assert.equal(res.body.data.careerGoal, CAREER_GOAL)
  })

  it('still accepts the original field names', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({
        mentorId: mentor.member.id,
        careerGoal: CAREER_GOAL,
        areaOfInterest: 'Product',
        preferredMode: 'email',
      })

    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.interestArea, 'Product')
    assert.equal(res.body.data.preferredCommunication, 'email')
  })

  it('requires an interest area', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL })

    assert.equal(res.status, 422, JSON.stringify(res.body))
    assert.match(JSON.stringify(res.body.error.details ?? res.body.error), /interestArea/)
  })

  it('rejects two conflicting spellings of the same field', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({
        mentorId: mentor.member.id,
        careerGoal: CAREER_GOAL,
        interestArea: 'Product',
        areaOfInterest: 'Engineering',
      })

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('requires an accepted connection first', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /Connect with this member/i)
  })

  it('refuses a request from yourself', async () => {
    const mentor = await memberWithToken({})
    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(mentor.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /from yourself/i)
  })

  it('refuses a mentor who is not verified', async () => {
    const mentor = await createMember({ verificationStatus: 'pending', isOpenToMentor: false })
    const student = await memberWithToken({ role: 'STUDENT' })
    const mentorToken = await tokenFor(mentor)
    await connect(student.token, mentorToken, mentor.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /not accepting mentorship/i)
  })

  it('refuses a mentor who has closed their listing', async () => {
    const mentor = await memberWithToken({ isOpenToMentor: false })
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /not accepting mentorship/i)
  })

  it('refuses a student who tries to act as the mentor', async () => {
    const first = await memberWithToken({ role: 'STUDENT' })
    const second = await memberWithToken({ role: 'STUDENT' })
    await connect(first.token, second.token, second.member.id)

    const res = await request(app)
      .post('/api/mentorship/requests')
      .set(asAuth(first.token))
      .send({
        mentorId: second.member.id,
        careerGoal: CAREER_GOAL,
        interestArea: 'Product',
      })

    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body.message, /Only an alumni member can offer mentorship/i)
  })

  it('notifies the mentor of the new request', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    const feed = await notificationsFor(mentor.token, 'mentorship_request')
    assert.ok(feed.length >= 1, 'the mentor should be notified')
    assert.equal(feed[0].actorId, student.member.id)
  })

  it('blocks a second request while one is pending', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    const again = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(again.status, 409, JSON.stringify(again.body))
    assert.match(again.body.message, /already pending/i)
  })

  it('refuses mentorship across a block in either direction', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)
    await request(app).post(`/api/connections/${student.member.id}/block`)
      .set(asAuth(mentor.token))

    const res = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 403, JSON.stringify(res.body))
    assert.match(res.body.message, /not available for mentorship/i)
  })

  it('rejects an unsupported preferred communication mode', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const res = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({
        mentorId: mentor.member.id,
        careerGoal: CAREER_GOAL,
        interestArea: 'Product',
        preferredCommunication: 'carrier_pigeon',
      })

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })
})

describe('phase 3: reading mentorship requests', () => {
  async function pendingPair() {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    return { mentor, student, id: created.body.data.id }
  }

  it('shows the request to the mentee and the mentor', async () => {
    const { mentor, student, id } = await pendingPair()

    for (const [token, role, peerId] of [
      [student.token, 'mentee', mentor.member.id],
      [mentor.token, 'mentor', student.member.id],
    ]) {
      const res = await request(app)
        .get(`/api/mentorship/requests/${id}`)
        .set(asAuth(token))
      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.role, role)
      assert.equal(res.body.data.peer.id, peerId)
      assert.equal(res.body.data.status, 'PENDING')
    }
  })

  it('hides the request from everyone else, including an administrator', async () => {
    const { id } = await pendingPair()
    const admin = await memberWithToken({ role: 'ADMIN' })
    const outsider = await memberWithToken({})

    for (const who of [admin, outsider]) {
      const res = await request(app)
        .get(`/api/mentorship/requests/${id}`)
        .set(asAuth(who.token))
      assert.equal(res.status, 403, JSON.stringify(res.body))
    }
  })

  it('lists a member own requests and filters by role', async () => {
    const { mentor, student, id } = await pendingPair()

    const inbox = await request(app)
      .get('/api/mentorship/requests?role=mentor&status=PENDING')
      .set(asAuth(mentor.token))
    assert.equal(inbox.status, 200, JSON.stringify(inbox.body))
    assert.ok(inbox.body.data.some((row) => row.id === id))
    assert.equal(inbox.body.meta.counts.pending, 1)

    const outbox = await request(app)
      .get('/api/mentorship/requests?role=mentee')
      .set(asAuth(student.token))
    assert.equal(outbox.status, 200, JSON.stringify(outbox.body))
    assert.equal(outbox.body.data.length, 1)
    assert.equal(outbox.body.data[0].role, 'mentee')
  })

  it('rejects an unknown request state', async () => {
    const { mentor } = await pendingPair()
    const res = await request(app)
      .get('/api/mentorship/requests?status=BANANA')
      .set(asAuth(mentor.token))

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('returns 404 for an unknown request id', async () => {
    const { mentor } = await pendingPair()
    const res = await request(app)
      .get('/api/mentorship/requests/6f1b2c34-0000-4000-8000-000000000000')
      .set(asAuth(mentor.token))

    assert.equal(res.status, 404, JSON.stringify(res.body))
  })
})

describe('phase 3: answering a mentorship request', () => {
  async function pendingPair() {
    const mentor = await memberWithToken({ mentorshipCapacity: 2 })
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    return { mentor, student, id: created.body.data.id }
  }

  it('lets the mentor accept and opens a relationship', async () => {
    const { mentor, student, id } = await pendingPair()

    const res = await request(app)
      .patch(`/api/mentorship/requests/${id}/accept`)
      .set(asAuth(mentor.token))
      .send({ responseNote: 'Happy to help.' })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.request.status, 'ACCEPTED')
    assert.equal(res.body.data.relationship.status, 'ACTIVE')
    assert.equal(res.body.data.relationship.role, 'mentor')
    assert.equal(res.body.data.relationship.peer.id, student.member.id)
  })

  it('notifies the mentee of the acceptance', async () => {
    const { mentor, student, id } = await pendingPair()
    await request(app).patch(`/api/mentorship/requests/${id}/accept`).set(asAuth(mentor.token))

    const feed = await notificationsFor(student.token, 'mentorship_accepted')
    assert.ok(feed.length >= 1, 'the mentee should be told the request was accepted')
  })

  it('lets the mentor reject without opening a relationship', async () => {
    const { mentor, id } = await pendingPair()

    const res = await request(app)
      .patch(`/api/mentorship/requests/${id}/reject`)
      .set(asAuth(mentor.token))
      .send({ responseNote: 'At capacity right now.' })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.request.status, 'REJECTED')
    assert.equal(res.body.data.relationship, null)
  })

  it('notifies the mentee of the rejection', async () => {
    const { mentor, student, id } = await pendingPair()
    await request(app).patch(`/api/mentorship/requests/${id}/reject`).set(asAuth(mentor.token))

    const feed = await notificationsFor(student.token, 'mentorship_declined')
    assert.ok(feed.length >= 1, 'the mentee should be told the request was declined')
  })

  it('refuses an answer from the mentee', async () => {
    const { student, id } = await pendingPair()

    const res = await request(app)
      .patch(`/api/mentorship/requests/${id}/accept`)
      .set(asAuth(student.token))

    assert.equal(res.status, 403, JSON.stringify(res.body))
    assert.match(res.body.message, /requested mentor/i)
  })

  it('refuses an answer from an unrelated member', async () => {
    const { id } = await pendingPair()
    const intruder = await memberWithToken({})
    const admin = await memberWithToken({ role: 'ADMIN' })

    for (const who of [intruder, admin]) {
      const res = await request(app)
        .patch(`/api/mentorship/requests/${id}/accept`)
        .set(asAuth(who.token))
      assert.equal(res.status, 403, JSON.stringify(res.body))
    }
  })

  it('rejects a second answer to the same request', async () => {
    const { mentor, id } = await pendingPair()
    await request(app).patch(`/api/mentorship/requests/${id}/accept`).set(asAuth(mentor.token))

    const again = await request(app)
      .patch(`/api/mentorship/requests/${id}/reject`)
      .set(asAuth(mentor.token))
    assert.equal(again.status, 409, JSON.stringify(again.body))
    assert.match(again.body.message, /already been answered/i)
  })

  it('rejects a cancellation by anyone but the mentee', async () => {
    const { mentor, id } = await pendingPair()

    const res = await request(app)
      .patch(`/api/mentorship/requests/${id}/cancel`)
      .set(asAuth(mentor.token))

    assert.equal(res.status, 403, JSON.stringify(res.body))
    assert.match(res.body.message, /Only the mentee/i)
  })

  it('rejects a cancellation once the request has been answered', async () => {
    const { mentor, student, id } = await pendingPair()
    await request(app).patch(`/api/mentorship/requests/${id}/accept`).set(asAuth(mentor.token))

    const res = await request(app)
      .patch(`/api/mentorship/requests/${id}/cancel`)
      .set(asAuth(student.token))

    assert.equal(res.status, 409, JSON.stringify(res.body))
    assert.match(res.body.message, /pending request/i)
  })

  it('refuses an acceptance once the mentor is at capacity', async () => {
    const mentor = await createMember({
      mentorshipCapacity: 1, verificationStatus: 'verified', isOpenToMentor: true,
    })
    const mentorToken = await tokenFor(mentor)
    const first = await memberWithToken({ role: 'STUDENT' })
    const second = await memberWithToken({ role: 'STUDENT' })

    for (const student of [first, second]) {
      await connect(student.token, mentorToken, mentor.id)
      await request(app).post('/api/mentorship/requests')
        .set(asAuth(student.token))
        .send({ mentorId: mentor.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    }

    const inbox = await request(app)
      .get('/api/mentorship/requests?role=mentor&status=PENDING')
      .set(asAuth(mentorToken))
    const firstId = inbox.body.data[0].id

    const accepted = await request(app)
      .patch(`/api/mentorship/requests/${firstId}/accept`)
      .set(asAuth(mentorToken))
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

    const secondRes = await request(app)
      .patch(`/api/mentorship/requests/${inbox.body.data[1].id}/accept`)
      .set(asAuth(mentorToken))
    assert.equal(secondRes.status, 409, JSON.stringify(secondRes.body))
    assert.match(secondRes.body.message, /at capacity/i)
  })

  it('rejects a mentee who asks again while a mentorship is active', async () => {
    const { mentor, student, id } = await pendingPair()
    await request(app).patch(`/api/mentorship/requests/${id}/accept`).set(asAuth(mentor.token))

    const res = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    assert.equal(res.status, 409, JSON.stringify(res.body))
    assert.match(res.body.message, /active mentorship/i)
  })

  it('lets the pair try again after a rejection or cancellation', async () => {
    const { mentor, student, id } = await pendingPair()

    await request(app).patch(`/api/mentorship/requests/${id}/reject`).set(asAuth(mentor.token))
    const afterReject = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(afterReject.status, 201, JSON.stringify(afterReject.body))

    await request(app).patch(`/api/mentorship/requests/${afterReject.body.data.id}/cancel`)
      .set(asAuth(student.token))

    const afterCancel = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(afterCancel.status, 201, JSON.stringify(afterCancel.body))
    assert.equal(afterCancel.body.data.status, 'PENDING')
  })
})

describe('phase 3: cancelling a mentorship request', () => {
  it('lets the mentee cancel a pending request', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    const cancelled = await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/cancel`)
      .set(asAuth(student.token))

    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body))
    assert.equal(cancelled.body.data.status, 'CANCELLED')
  })
})

// =====================================================================
// Relationships
// =====================================================================

describe('phase 3: mentorship relationships', () => {
  async function activePair() {
    const mentor = await memberWithToken({ mentorshipCapacity: 3 })
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    const accepted = await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/accept`)
      .set(asAuth(mentor.token))
    return {
      mentor, student,
      requestId: created.body.data.id,
      relationshipId: accepted.body.data.relationship.id,
    }
  }

  it('lists the relationship for both participants', async () => {
    const { mentor, student, relationshipId } = await activePair()

    for (const [token, role] of [[mentor.token, 'mentor'], [student.token, 'mentee']]) {
      const res = await request(app)
        .get('/api/mentorship/relationships')
        .set(asAuth(token))
      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.data.length, 1, JSON.stringify(res.body))
      assert.equal(res.body.data[0].id, relationshipId)
      assert.equal(res.body.data[0].status, 'ACTIVE')
      assert.equal(res.body.data[0].role, role)
    }
  })

  it('keeps the older /mentorships path working', async () => {
    const { mentor } = await activePair()
    const res = await request(app).get('/api/mentorship/mentorships').set(asAuth(mentor.token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
  })

  it('lets a participant complete the mentorship and tells the other', async () => {
    const { mentor, student, relationshipId, requestId } = await activePair()

    const completed = await request(app)
      .patch(`/api/mentorship/relationships/${relationshipId}/complete`)
      .set(asAuth(mentor.token))

    assert.equal(completed.status, 200, JSON.stringify(completed.body))
    assert.equal(completed.body.data.status, 'COMPLETED')
    assert.ok(completed.body.data.endedAt)

    const feed = await notificationsFor(student.token, 'mentorship_completed')
    assert.ok(feed.length >= 1, 'the other participant should be told it finished')

    // The originating request follows the relationship to COMPLETED.
    const afterCompletion = await request(app)
      .get(`/api/mentorship/requests/${requestId}`)
      .set(asAuth(mentor.token))
    assert.equal(afterCompletion.body.data.status, 'COMPLETED')
  })

  it('frees the mentor capacity once a mentorship completes', async () => {
    const mentor = await createMember({
      mentorshipCapacity: 1, verificationStatus: 'verified', isOpenToMentor: true,
    })
    const mentorToken = await tokenFor(mentor)
    const first = await memberWithToken({ role: 'STUDENT' })
    const second = await memberWithToken({ role: 'STUDENT' })

    const asks = async (student) => {
      await connect(student.token, mentorToken, mentor.id)
      return request(app).post('/api/mentorship/requests')
        .set(asAuth(student.token))
        .send({ mentorId: mentor.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    }

    const created = await asks(first)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const accepted = await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/accept`)
      .set(asAuth(mentorToken))
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

    // The single slot is taken, so a second mentee cannot even ask.
    const tooMany = await asks(second)
    assert.equal(tooMany.status, 400, JSON.stringify(tooMany.body))
    assert.match(tooMany.body.message, /capacity/i)

    const completed = await request(app)
      .patch(`/api/mentorship/relationships/${accepted.body.data.relationship.id}/complete`)
      .set(asAuth(mentorToken))
    assert.equal(completed.status, 200, JSON.stringify(completed.body))

    // Completing the mentorship is what frees the slot, so the request now goes
    // through. A second connection is needed first, since the pair is still the
    // one that was accepted.
    const retried = await request(app).post('/api/mentorship/requests')
      .set(asAuth(second.token))
      .send({ mentorId: mentor.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(retried.status, 201, JSON.stringify(retried.body))
  })

  it('rejects a second completion of the same relationship', async () => {
    const { mentor, relationshipId } = await activePair()
    await request(app)
      .patch(`/api/mentorship/relationships/${relationshipId}/complete`)
      .set(asAuth(mentor.token))

    const again = await request(app)
      .patch(`/api/mentorship/relationships/${relationshipId}/complete`)
      .set(asAuth(mentor.token))
    assert.equal(again.status, 409, JSON.stringify(again.body))
    assert.match(again.body.message, /active mentorship/i)
  })

  it('refuses a completion by an unrelated member, including an administrator', async () => {
    const { relationshipId } = await activePair()
    const outsider = await memberWithToken({})
    const admin = await memberWithToken({ role: 'ADMIN' })

    for (const who of [outsider, admin]) {
      const res = await request(app)
        .patch(`/api/mentorship/relationships/${relationshipId}/complete`)
        .set(asAuth(who.token))
      assert.equal(res.status, 403, JSON.stringify(res.body))
      assert.match(res.body.message, /not part of this mentorship/i)
    }
  })

  it('returns 404 for an unknown relationship', async () => {
    const { mentor } = await activePair()
    const res = await request(app)
      .patch('/api/mentorship/relationships/6f1b2c34-0000-4000-8000-000000000000/complete')
      .set(asAuth(mentor.token))

    assert.equal(res.status, 404, JSON.stringify(res.body))
  })

  it('ends a mentorship early and leaves the request accepted', async () => {
    const { student, relationshipId, requestId } = await activePair()

    const ended = await request(app)
      .patch(`/api/mentorship/relationships/${relationshipId}/end`)
      .set(asAuth(student.token))
      .send({ endReason: 'Goal reached' })

    assert.equal(ended.status, 200, JSON.stringify(ended.body))
    assert.equal(ended.body.data.status, 'ENDED')
    assert.equal(ended.body.data.endReason, 'Goal reached')

    const afterEnd = await request(app)
      .get(`/api/mentorship/requests/${requestId}`)
      .set(asAuth(student.token))
    assert.equal(afterEnd.body.data.status, 'ACCEPTED',
      'an early end is not the same as a completed mentorship')
  })

  it('rejects an unknown relationship state filter', async () => {
    const { mentor } = await activePair()
    const res = await request(app)
      .get('/api/mentorship/relationships?status=BANANA')
      .set(asAuth(mentor.token))

    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('requires authentication for every mentorship route', async () => {
    const paths = [
      ['get', '/api/mentorship/requests'],
      ['post', '/api/mentorship/requests'],
      ['get', '/api/mentorship/requests/6f1b2c34-0000-4000-8000-000000000000'],
      ['patch', '/api/mentorship/requests/6f1b2c34-0000-4000-8000-000000000000/accept'],
      ['patch', '/api/mentorship/requests/6f1b2c34-0000-4000-8000-000000000000/reject'],
      ['patch', '/api/mentorship/requests/6f1b2c34-0000-4000-8000-000000000000/cancel'],
      ['get', '/api/mentorship/relationships'],
      ['patch', '/api/mentorship/relationships/6f1b2c34-0000-4000-8000-000000000000/complete'],
    ]
    for (const [method, path] of paths) {
      const res = await request(app)[method](path).send({})
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path} should require auth`)
    }
  })
})

// =====================================================================
// Notifications
// =====================================================================

describe('phase 3: notifications', () => {
  it('records every event the networking and mentorship flows produce', async () => {
    const mentor = await memberWithToken({ mentorshipCapacity: 2 })
    const student = await memberWithToken({ role: 'STUDENT' })

    // connection request
    await request(app).post(`/api/connections/${mentor.member.id}`)
      .set(asAuth(student.token)).send({ message: 'Hi' })
    assert.ok((await notificationsFor(mentor.token, 'connection_request')).length >= 1)

    // connection accepted
    const requests = await request(app).get('/api/connections/requests')
      .set(asAuth(mentor.token))
    await request(app).patch(`/api/connections/${requests.body.data[0].id}/accept`)
      .set(asAuth(mentor.token))
    assert.ok((await notificationsFor(student.token, 'connection_accepted')).length >= 1)

    // mentorship request
    const mentorship = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.ok((await notificationsFor(mentor.token, 'mentorship_request')).length >= 1)

    // mentorship accepted, then completed
    const accepted = await request(app)
      .patch(`/api/mentorship/requests/${mentorship.body.data.id}/accept`)
      .set(asAuth(mentor.token))
    assert.ok((await notificationsFor(student.token, 'mentorship_accepted')).length >= 1)

    await request(app)
      .patch(`/api/mentorship/relationships/${accepted.body.data.relationship.id}/complete`)
      .set(asAuth(mentor.token))
    assert.ok((await notificationsFor(student.token, 'mentorship_completed')).length >= 1)
  })

  it('records a mentorship rejection for the mentee', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)

    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/reject`)
      .set(asAuth(mentor.token))
      .send({ responseNote: 'Too busy this term.' })

    const feed = await notificationsFor(student.token, 'mentorship_declined')
    assert.ok(feed.length >= 1)
    assert.match(feed[0].body, /Too busy this term/)
  })

  it('does not notify anyone about a private request', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await connect(student.token, mentor.token, mentor.member.id)
    await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })

    const outsider = await memberWithToken({})
    const feed = await notificationsFor(outsider.token, 'mentorship_request')
    assert.equal(feed.length, 0)
  })

  it('rolls the notification back with the state change it describes', async () => {
    // The mentor has one slot, so accepting the second request must fail and must
    // not leave a "mentorship accepted" notification behind for the mentee whose
    // acceptance was refused.
    const mentor = await createMember({
      mentorshipCapacity: 1, verificationStatus: 'verified', isOpenToMentor: true,
    })
    const mentorToken = await tokenFor(mentor)
    const first = await memberWithToken({ role: 'STUDENT' })
    const second = await memberWithToken({ role: 'STUDENT' })

    const asks = {}
    for (const student of [first, second]) {
      await connect(student.token, mentorToken, mentor.id)
      // Capacity is measured in live mentorships, so both requests are allowed to
      // exist while the first one is still pending. That is what makes the accept
      // below a genuine race to fill the last slot.
      asks[student.member.id] = await request(app).post('/api/mentorship/requests')
        .set(asAuth(student.token))
        .send({ mentorId: mentor.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    }
    const firstId = asks[first.member.id].body.data.id
    const secondId = asks[second.member.id].body.data.id

    const winner = await request(app)
      .patch(`/api/mentorship/requests/${firstId}/accept`)
      .set(asAuth(mentorToken))
    assert.equal(winner.status, 200, JSON.stringify(winner.body))

    const failed = await request(app)
      .patch(`/api/mentorship/requests/${secondId}/accept`)
      .set(asAuth(mentorToken))
    assert.equal(failed.status, 409, JSON.stringify(failed.body))

    const { rows } = await query(
      'SELECT status FROM mentorship_requests WHERE id = $1', [secondId],
    )
    assert.equal(rows[0].status, 'pending',
      'the refused request stays pending, so it can be answered later')

    const feed = await notificationsFor(second.token, 'mentorship_accepted')
    assert.equal(feed.length, 0,
      'a rolled-back acceptance must not leave an acceptance notification')
  })

  it('respects a muted notification type', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await query(
      `UPDATE notification_preferences SET muted_types = ARRAY['connection_request']
       WHERE user_id = $1`,
      [b.member.id],
    )

    await request(app).post(`/api/connections/${b.member.id}`).set(asAuth(a.token)).send({})

    const feed = await notificationsFor(b.token, 'connection_request')
    assert.equal(feed.length, 0, 'a muted type should not be stored')
  })

  it('lets a member read their own feed but not another member', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await request(app).post(`/api/connections/${b.member.id}`).set(asAuth(a.token)).send({})

    const res = await request(app).get('/api/notifications').set(asAuth(a.token))
    assert.equal(res.status, 200)
    assert.ok(!res.body.data.some((n) => n.actorId === b.member.id),
      'a member should not see notifications addressed to someone else')
  })

  it('marks the whole feed read through either spelling of the route', async () => {
    for (const [method, path] of [['post', '/api/notifications/read-all'], ['patch', '/api/notifications/read-all']]) {
      const sender = await memberWithToken({})
      const reader = await memberWithToken({})
      await request(app)
        .post(`/api/connections/${reader.member.id}`)
        .set(asAuth(sender.token)).send({})

      const before = await request(app).get('/api/notifications').set(asAuth(reader.token))
      assert.ok(before.body.data.length >= 1, `${method} ${path}: nothing to mark read`)

      const marked = await request(app)[method](path).set(asAuth(reader.token))
      assert.equal(marked.status, 200, `${method} ${path}: ${JSON.stringify(marked.body)}`)
      assert.ok(marked.body.data.markedRead >= 1)

      const unread = await request(app)
        .get('/api/notifications/unread-count').set(asAuth(reader.token))
      assert.equal(unread.body.data.unread, 0)
    }
  })

  it('saves preferences through either spelling of the route', async () => {
    for (const method of ['patch', 'put']) {
      const member = await memberWithToken({})
      const res = await request(app)[method]('/api/notifications/preferences')
        .set(asAuth(member.token))
        .send({ emailEnabled: true, mutedTypes: ['connection_request', 'event_rsvp'] })

      assert.equal(res.status, 200, `${method}: ${JSON.stringify(res.body)}`)

      const stored = await request(app).get('/api/notifications/preferences').set(asAuth(member.token))
      assert.equal(stored.status, 200)
      assert.equal(stored.body.data.emailEnabled, true)
      assert.deepEqual(
        [...stored.body.data.mutedTypes].sort(),
        ['connection_request', 'event_rsvp'],
      )
    }
  })

  it('rejects an unknown notification type in preferences', async () => {
    const member = await memberWithToken({})
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set(asAuth(member.token))
      .send({ mutedTypes: ['not_a_real_type'] })
    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('emails each mentorship event to the member who has to act on it', async () => {
    const mentorName = 'Maya Mentor'
    const studentName = 'Sam Student'
    const mentor = await memberWithToken({ firstName: 'Maya', lastName: 'Mentor' })
    const student = await memberWithToken({
      role: 'STUDENT', firstName: 'Sam', lastName: 'Student',
    })

    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    const asking = await mentorshipMail('mentorship_request')
    assert.ok(asking, 'the mentor is emailed about the new request')
    assert.equal(asking.to_email, mentor.member.email)
    // The mail names the mentee, not the mentor who is reading it.
    assert.match(asking.html, new RegExp(studentName))
    assert.ok(!asking.html.includes('undefined'),
      'every field the template reads has to be supplied')

    const accepted = await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/accept`)
      .set(asAuth(mentor.token))
      .send({ responseNote: 'Happy to help.' })
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

    const acceptance = await mentorshipMail('mentorship_accepted')
    assert.ok(acceptance, 'the mentee is emailed about the acceptance')
    assert.equal(acceptance.to_email, student.member.email)

    await request(app)
      .patch(`/api/mentorship/relationships/${accepted.body.data.relationship.id}/complete`)
      .set(asAuth(student.token))

    const completion = await mentorshipMail('mentorship_completed')
    assert.ok(completion, 'the peer is emailed about the completion')
    // A mentor can be the reader of this one, so it must not call them "your mentor".
    assert.match(completion.html, new RegExp(mentorName))
    assert.ok(!completion.html.includes('undefined'))
  })

  it('names the mentor in the mails only a mentee reads', async () => {
    const mentorName = 'Maya Mentor'
    const mentor = await memberWithToken({ firstName: 'Maya', lastName: 'Mentor' })
    const student = await memberWithToken({
      role: 'STUDENT', firstName: 'Sam', lastName: 'Student',
    })

    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    const rejected = await request(app)
      .patch(`/api/mentorship/requests/${created.body.data.id}/reject`)
      .set(asAuth(mentor.token))
      .send({ responseNote: 'Too busy this term.' })
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body))

    const decline = await mentorshipMail('mentorship_declined')
    assert.ok(decline, 'the mentee is emailed about the decline')
    assert.match(decline.html, new RegExp(mentorName))
    assert.match(decline.html, /Too busy this term\./)
    assert.ok(!decline.html.includes('undefined'))
  })

  it('sends no email when the recipient has not enabled it', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await query(
      `UPDATE notification_preferences SET email_enabled = FALSE
       WHERE user_id = $1`,
      [mentor.member.id],
    )

    await connect(student.token, mentor.token, mentor.member.id)
    const created = await request(app).post('/api/mentorship/requests')
      .set(asAuth(student.token))
      .send({ mentorId: mentor.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    // The in-app notification still exists; only the mail is suppressed.
    assert.ok((await notificationsFor(mentor.token, 'mentorship_request')).length >= 1)
    assert.equal(await mentorshipMail('mentorship_request'), null)
  })
})

// =====================================================================
// Database guarantees
// =====================================================================

describe('phase 3: database guarantees', () => {
  it('keeps one row per pair regardless of direction', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})

    await query(
      `INSERT INTO connections (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')`,
      [a.member.id, b.member.id],
    )

    await expectPgError(
      () => query(
        `INSERT INTO connections (requester_id, addressee_id, status)
         VALUES ($1, $2, 'pending')`,
        [b.member.id, a.member.id],
      ),
      '23505',
      'the symmetric unique index should refuse the reversed pair',
    )
  })

  it('refuses a connection to yourself at the database level', async () => {
    const a = await memberWithToken({})
    await expectPgError(
      () => query(
        `INSERT INTO connections (requester_id, addressee_id, status)
         VALUES ($1, $1, 'pending')`,
        [a.member.id],
      ),
      '23514',
      'a self-connection must be refused by the constraint as well as the service',
    )
  })

  it('refuses an unknown connection state', async () => {
    const a = await memberWithToken({})
    const b = await memberWithToken({})
    await expectPgError(
      () => query(
        `INSERT INTO connections (requester_id, addressee_id, status)
         VALUES ($1, $2, 'maybe')`,
        [a.member.id, b.member.id],
      ),
      '23514',
      'only the documented connection states may be stored',
    )
  })

  it('refuses an unknown mentorship request state', async () => {
    const mentor = await memberWithToken({})
    const student = await memberWithToken({ role: 'STUDENT' })
    await expectPgError(
      () => query(
        `INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, status)
         VALUES ($1, $2, 'goal', 'area', 'maybe')`,
        [mentor.member.id, student.member.id],
      ),
      '23514',
      'only the documented mentorship request states may be stored',
    )
  })

  it('accepts every documented mentorship request state', async () => {
    const mentor = await memberWithToken({ mentorshipCapacity: 10 })
    const states = ['pending', 'accepted', 'rejected', 'cancelled', 'completed']

    for (const [index, state] of states.entries()) {
      const student = await createMember({ role: 'STUDENT' })
      const { rows } = await query(
        `INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, status)
         VALUES ($1, $2, $3, 'area', $4) RETURNING status`,
        [mentor.member.id, student.id, `goal ${index}`, state],
      )
      assert.equal(rows[0].status, state)
    }
  })

  it('cascades connections, requests and relationships when an account is deleted', async () => {
    const { mentor, student, relationshipId } = await (async () => {
      const m = await memberWithToken({ mentorshipCapacity: 3 })
      const s = await memberWithToken({ role: 'STUDENT' })
      await connect(s.token, m.token, m.member.id)
      const created = await request(app).post('/api/mentorship/requests')
        .set(asAuth(s.token))
        .send({ mentorId: m.member.id, careerGoal: CAREER_GOAL, interestArea: 'Product' })
      const accepted = await request(app)
        .patch(`/api/mentorship/requests/${created.body.data.id}/accept`)
        .set(asAuth(m.token))
      return { mentor: m, student: s, relationshipId: accepted.body.data.relationship.id }
    })()

    await query('DELETE FROM users WHERE id = $1', [student.member.id])

    // Each table names the two sides differently, so the predicate is built per
    // table rather than assuming a shared column set.
    const participants = {
      connections: ['requester_id', 'addressee_id'],
      mentorship_requests: ['mentor_id', 'mentee_id'],
      mentorship_relationships: ['mentor_id', 'mentee_id'],
    }
    for (const [table, columns] of Object.entries(participants)) {
      const { rows } = await query(
        `SELECT COUNT(*)::int AS c FROM ${table}
         WHERE ${columns.map((c) => `${c} = $1`).join(' OR ')}`,
        [student.member.id],
      )
      assert.equal(rows[0].c, 0, `${table} should have cascaded`)
    }

    const rel = await query(
      'SELECT COUNT(*)::int AS c FROM mentorship_relationships WHERE id = $1',
      [relationshipId],
    )
    assert.equal(rel.rows[0].c, 0)
    assert.ok(mentor.member.id, 'sanity: the mentor account survived')
  })

  it('keeps the indexes the networking queries rely on', async () => {
    const { rows } = await query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'connections_pair_symmetric_unique',
           'idx_connections_requester',
           'idx_connections_addressee',
           'idx_connections_blocked_pair',
           'idx_mentorship_req_mentor',
           'idx_mentorship_req_mentee',
           'idx_mentorship_req_mentor_status_created',
           'idx_mentorship_req_mentee_created',
           'idx_mentorship_rel_active_mentor',
           'idx_mentorship_rel_active_mentee',
           'idx_notifications_user_type'
         )
       ORDER BY indexname`,
    )
    assert.deepEqual(rows.map((r) => r.indexname), [
      'connections_pair_symmetric_unique',
      'idx_connections_addressee',
      'idx_connections_blocked_pair',
      'idx_connections_requester',
      'idx_mentorship_rel_active_mentee',
      'idx_mentorship_rel_active_mentor',
      'idx_mentorship_req_mentee',
      'idx_mentorship_req_mentee_created',
      'idx_mentorship_req_mentor',
      'idx_mentorship_req_mentor_status_created',
      'idx_notifications_user_type',
    ])
  })

  it('uses the verified mentor listing for the discovery query', async () => {
    const { rows } = await query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = 'idx_alumni_mentor'`,
    )
    assert.ok(rows.length, 'the mentor listing index should exist')
    assert.match(rows[0].indexdef, /is_open_to_mentor/)
    assert.match(rows[0].indexdef, /verification_status/)
  })

  it('guards the mentor listing with a trigger rather than a check constraint', async () => {
    // The upsert the profile service uses proposes a candidate row whose
    // verification_status is still the column default, so a CHECK constraint
    // would reject a verified alumnus editing their own profile. The AFTER
    // trigger only sees rows that are really written.
    const { rows } = await query(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'alumni_profiles'::regclass AND NOT tgisinternal
         AND tgname = 'alumni_mentor_listing_requires_verification'`,
    )
    assert.equal(rows.length, 1, 'the mentor listing trigger should exist')

    const constraints = await query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'alumni_profiles'::regclass
         AND conname = 'alumni_open_to_mentor_needs_verified'`,
    )
    assert.equal(constraints.rows.length, 0,
      'the check-constraint form should not be present')
  })

  it('rolls migration 011 back and forward again', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { PGlite } = await import('@electric-sql/pglite')
    const path = await import('node:path')

    const instance = await PGlite.create({ dataDir: 'memory://' })
    const repoRoot = path.resolve(import.meta.dirname, '..', '..')
    const dir = path.join(repoRoot, 'database', 'migrations')
    const up = await readFile(path.join(dir, '011_networking_mentorship.sql'), 'utf8')
    const down = await readFile(path.join(dir, '011_networking_mentorship.down.sql'), 'utf8')

    // 011 widens constraints and creates a trigger on tables earlier migrations
    // own, so its rollback can only be judged on a database that has them. Every
    // other migration is replayed here to reach that starting point.
    const files = (await readdir(dir))
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.startsWith('011_'))
      .sort()
    for (const file of files) {
      await instance.exec(await readFile(path.join(dir, file), 'utf8'))
    }

    await instance.exec(up)
    await instance.exec(down)

    const constraints = await instance.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'alumni_profiles'::regclass AND conname = 'mentorship_requests_status_check'`,
    )
    assert.equal(constraints.rows.length, 0,
      'the constraint lives on mentorship_requests, so this should be empty')

    const requestCheck = await instance.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'mentorship_requests'::regclass
         AND conname = 'mentorship_requests_status_check'`,
    )
    assert.ok(!requestCheck.rows[0].def.includes('completed'),
      'rolling back should restore the pre-011 status list')

    const notificationCheck = await instance.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'notifications'::regclass
         AND conname = 'notifications_type_check'`,
    )
    assert.ok(!notificationCheck.rows[0].def.includes('mentorship_completed'),
      'rolling back should restore the pre-011 notification type list')

    const triggers = await instance.query(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'alumni_profiles'::regclass AND NOT tgisinternal
         AND tgname = 'alumni_mentor_listing_requires_verification'`,
    )
    assert.equal(triggers.rows.length, 0, 'the trigger should be dropped')

    await instance.exec(up)
    const reapplied = await instance.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'mentorship_requests'::regclass
         AND conname = 'mentorship_requests_status_check'`,
    )
    assert.ok(reapplied.rows[0].def.includes('completed'),
      're-applying should restore the completed state')

    const indexes = await instance.query(
      `SELECT count(*)::int AS c FROM pg_indexes WHERE indexname = 'idx_notifications_user_type'`,
    )
    assert.equal(indexes.rows[0].c, 1, 're-applying should recreate the index')

    await instance.close()
  })
})
