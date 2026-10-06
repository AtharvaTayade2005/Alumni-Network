import 'dotenv/config'
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { io as ioClient } from 'socket.io-client'
import {
  directQuery, startTestDatabase, stopTestDatabase,
} from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

// The pool is built when config/database.js is first imported, so the test
// database has to be up and the environment has to be in place before that.
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')
const { initialiseRealtime } = await import('../src/sockets/index.js')
const { default: config } = await import('../src/config/env.js')
const scheduler = await import('../src/services/scheduler.js')
const eventService = await import('../src/services/eventService.js')
const jobModel = await import('../src/models/backgroundJobModel.js')
const { dateOnly } = await import('../src/models/eventModel.js')

let seq = 0
const uniq = () => `p5.${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`
const newEmail = () => `${uniq()}@example.com`

// One hash for the whole file: the tests create a lot of users and scrypt does
// not care that they all share a password.
const passwordHash = await hashPassword('Str0ngPass!23')
const PASSWORD = 'Str0ngPass!23'

let httpServer
let io

async function resetAll() {
  await query(
    `TRUNCATE users, events, event_rsvps, event_attendees, notifications,
     notification_preferences, email_queue, connections, messages,
     conversation_participants, conversations, message_read_status, background_jobs
     RESTART IDENTITY CASCADE`,
  )
}

/** Polls until `check` is true, for work that finishes on a timer rather than on a request. */
async function waitFor(check, what = 'the condition', timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

async function createUser({ role = 'ALUMNI', privacy = 'everyone', email: address = newEmail() } = {}) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1,$2,'Test','Person',TRUE) RETURNING id, email`,
    [address, passwordHash],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)`,
    [id, role],
  )
  await query(
    `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department,
       current_company, current_position, industry, bio, city, country,
       latitude, longitude, is_open_to_mentor, show_on_map, verification_status)
     VALUES ($1,2018,'BSc Computer Science','Computing','Acme','Engineer',
       'Software','Builds things','Karachi','Pakistan',24.8607,67.0011,TRUE,TRUE,'verified')`,
    [id],
  )
  await query(
    'INSERT INTO privacy_settings (user_id, allow_messages_from) VALUES ($1,$2)',
    [id, privacy],
  )
  await query('INSERT INTO notification_preferences (user_id) VALUES ($1)', [id])
  return { id, email: address, password: PASSWORD }
}

async function acceptConnection(requesterId, addresseeId) {
  await query(
    `INSERT INTO connections (requester_id, addressee_id, status, responded_at)
     VALUES ($1,$2,'accepted',NOW())`,
    [requesterId, addresseeId],
  )
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

function instantOnDay(offset, hour = 18) {
  const day = new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `${day}T${String(hour).padStart(2, '0')}:00:00Z`
}

async function publishEvent(organizerToken, offset, overrides = {}) {
  const created = await request(app)
    .post('/api/events')
    .set(asAuth(organizerToken))
    .send({
      title: 'Alumni Winter Meetup',
      description: 'An evening of talks and introductions for alumni and students.',
      startTime: instantOnDay(offset),
      endTime: instantOnDay(offset, 21),
      venue: 'Engineering Hall',
      city: 'Karachi',
      ...overrides,
    })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const published = await request(app)
    .post(`/api/events/${created.body.data.id}/publish`)
    .set(asAuth(organizerToken))
  assert.equal(published.status, 200, JSON.stringify(published.body))
  return published.body.data
}

async function rsvpGoing(token, eventId) {
  const res = await request(app)
    .post(`/api/events/${eventId}/rsvp`)
    .set(asAuth(token))
    .send({ status: 'going' })
  assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.body))
  return res.body.data
}

async function notificationsFor(userId, type = null) {
  const { rows } = await query(
    type
      ? 'SELECT * FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at ASC'
      : 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at ASC',
    type ? [userId, type] : [userId],
  )
  return rows
}

before(async () => {
  httpServer = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener))
  })
  io = initialiseRealtime(httpServer)
})

after(async () => {
  scheduler.stopScheduler()
  await io?.close()
  await new Promise((resolve) => httpServer.close(resolve))
  await closePool()
  await stopTestDatabase()
})

describe('phase 5 conversations', () => {
  let alice
  let bob
  let carol
  let aliceToken
  let bobToken

  beforeEach(async () => {
    await resetAll()
    alice = await createUser()
    bob = await createUser()
    carol = await createUser({ privacy: 'nobody' })
    aliceToken = await loginAs(alice)
    bobToken = await loginAs(bob)
  })

  it('opens a direct conversation and returns the same one on a retry', async () => {
    const first = await request(app)
      .post('/api/conversations')
      .set(asAuth(aliceToken))
      .send({ peerId: bob.id })
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.equal(first.body.data.peerId, bob.id)

    const again = await request(app)
      .post('/api/conversations')
      .set(asAuth(bobToken))
      .send({ peerId: alice.id })
    assert.equal(again.status, 200)
    assert.equal(again.body.data.id, first.body.data.id, 'a retry must not open a second thread')
    assert.equal(again.body.data.peerId, alice.id, 'the other side sees you as the peer')
  })

  it('refuses to open a conversation with yourself, a stranger, or a bad id', async () => {
    const withSelf = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: alice.id })
    assert.equal(withSelf.status, 400)

    const withClosedPeer = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: carol.id })
    assert.equal(withClosedPeer.status, 403, 'privacy is decided by the recipient')

    const unknown = await request(app)
      .post('/api/conversations')
      .set(asAuth(aliceToken))
      .send({ peerId: '00000000-0000-4000-8000-000000000000' })
    assert.equal(unknown.status, 403)

    const malformed = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: 'not-a-uuid' })
    assert.equal(malformed.status, 422)

    const anonymous = await request(app).post('/api/conversations').send({ peerId: bob.id })
    assert.equal(anonymous.status, 401)
  })

  it('follows the recipient\'s connections-only setting', async () => {
    const careful = await createUser({ privacy: 'connections' })
    const carefulToken = await loginAs(careful)

    const beforeConnecting = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: careful.id })
    assert.equal(beforeConnecting.status, 403, 'a stranger may not open a thread')

    await acceptConnection(careful.id, alice.id)

    const afterConnecting = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: careful.id })
    assert.equal(afterConnecting.status, 200, 'a connection may')

    const theyMayToo = await request(app)
      .post('/api/conversations').set(asAuth(carefulToken)).send({ peerId: alice.id })
    assert.equal(theyMayToo.status, 200, 'the setting does not depend on who sent first')
  })

  it('lists the caller\'s conversations and nobody else\'s', async () => {
    await request(app).post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: bob.id })

    const mine = await request(app).get('/api/conversations').set(asAuth(aliceToken))
    assert.equal(mine.status, 200)
    assert.equal(mine.body.data.length, 1)
    assert.equal(mine.body.data[0].peerId, bob.id)

    const carolToken = await loginAs(carol)
    const theirs = await request(app).get('/api/conversations').set(asAuth(carolToken))
    assert.equal(theirs.body.data.length, 0)
  })

  it('hides a conversation from somebody who is not a member', async () => {
    const opened = await request(app)
      .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: bob.id })

    const carolToken = await loginAs(carol)
    const stranger = await request(app)
      .get(`/api/conversations/${opened.body.data.id}`).set(asAuth(carolToken))
    assert.equal(stranger.status, 404, 'a 404 must not disclose that the thread exists')

    const messages = await request(app)
      .get(`/api/conversations/${opened.body.data.id}/messages`).set(asAuth(carolToken))
    assert.equal(messages.status, 404)
  })

  describe('messages', () => {
    let conversationId

    beforeEach(async () => {
      const opened = await request(app)
        .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: bob.id })
      conversationId = opened.body.data.id
    })

    it('posts a message that both sides can then read', async () => {
      const posted = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken))
        .send({ body: 'Are you still coming on Thursday?' })
      assert.equal(posted.status, 201, JSON.stringify(posted.body))
      assert.equal(posted.body.data.body, 'Are you still coming on Thursday?')
      assert.equal(posted.body.data.recipientId, bob.id)
      assert.equal(posted.body.data.senderId, alice.id)

      const thread = await request(app)
        .get(`/api/conversations/${conversationId}/messages`).set(asAuth(bobToken))
      assert.equal(thread.status, 200)
      assert.equal(thread.body.data.length, 1)
      assert.equal(thread.body.data[0].id, posted.body.data.id)
      assert.equal(thread.body.data[0].isRead, false)
    })

    it('returns the original message when a client retries with the same client id', async () => {
      const body = { body: 'Sent twice by a flaky connection', clientMessageId: uniq() }

      const first = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send(body)
      assert.equal(first.status, 201)

      const retry = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send(body)
      assert.equal(retry.status, 201)
      assert.equal(retry.body.data.id, first.body.data.id, 'a retry must not duplicate')

      const { rows } = await query(
        'SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id = $1',
        [conversationId],
      )
      assert.equal(rows[0].n, 1)
    })

    it('lets two people use the same client id', async () => {
      const clientMessageId = uniq()
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'from alice', clientMessageId })
      const fromBob = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(bobToken)).send({ body: 'from bob', clientMessageId })
      assert.equal(fromBob.status, 201)
      assert.notEqual(fromBob.body.data.id, undefined)
    })

    it('rejects an empty or oversized body', async () => {
      const empty = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: '   ' })
      assert.equal(empty.status, 422)

      const long = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'x'.repeat(5001) })
      assert.equal(long.status, 422)
    })

    it('will not post into a conversation the caller is not in', async () => {
      const other = await request(app)
        .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: carol.id })
      assert.equal(other.status, 403)
    })

    it('pages backwards from a cursor rather than an offset', async () => {
      for (const body of ['first', 'second', 'third']) {
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set(asAuth(aliceToken)).send({ body })
      }

      const newest = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2`).set(asAuth(bobToken))
      assert.equal(newest.body.data.length, 2)
      assert.equal(newest.body.data[0].body, 'third')

      const older = await request(app)
        .get(
          `/api/conversations/${conversationId}/messages?limit=2&before=${newest.body.data.at(-1).id}`,
        ).set(asAuth(bobToken))
      assert.equal(older.body.data.length, 1)
      assert.equal(older.body.data[0].body, 'first')
    })

    it('soft-deletes a message the caller sent, and hides it from the thread', async () => {
      const posted = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'never mind' })

      const removed = await request(app)
        .delete(`/api/conversations/messages/${posted.body.data.id}`).set(asAuth(aliceToken))
      assert.equal(removed.status, 200, JSON.stringify(removed.body))

      const thread = await request(app)
        .get(`/api/conversations/${conversationId}/messages`).set(asAuth(bobToken))
      assert.equal(thread.body.data.length, 0)

      const notMine = await request(app)
        .delete(`/api/conversations/messages/${posted.body.data.id}`).set(asAuth(bobToken))
      assert.equal(notMine.status, 404, 'a message can only be deleted by its sender')
    })

    it('tells the recipient once, not once per layer that sent it', async () => {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'only one of these please' })

      const told = await notificationsFor(bob.id, 'new_message')
      assert.equal(told.length, 1, JSON.stringify(told))
      assert.equal(
        (await notificationsFor(alice.id, 'new_message')).length,
        0,
        'the sender is not notified about their own message',
      )
    })

    it('keeps the Phase 1 message routes working', async () => {
      const posted = await request(app)
        .post('/api/messages')
        .set(asAuth(aliceToken))
        .send({ recipientId: bob.id, body: 'sent through the old route' })
      assert.equal(posted.status, 201, JSON.stringify(posted.body))

      const legacy = await request(app)
        .get(`/api/messages/with/${alice.id}`).set(asAuth(bobToken))
      assert.equal(legacy.status, 200)
      assert.equal(legacy.body.data.length, 1)

      const { rows } = await query(
        'SELECT conversation_id FROM messages WHERE body = $1', ['sent through the old route'],
      )
      assert.ok(rows[0].conversation_id, 'a legacy send joins the thread it belongs to')
    })
  })

  describe('read positions', () => {
    let conversationId

    beforeEach(async () => {
      const opened = await request(app)
        .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: bob.id })
      conversationId = opened.body.data.id
      for (const body of ['one', 'two']) {
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set(asAuth(aliceToken)).send({ body })
      }
    })

    it('counts unread messages per thread and per account', async () => {
      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(total.status, 200)
      assert.equal(total.body.data.unread, 2)

      const list = await request(app).get('/api/conversations').set(asAuth(bobToken))
      assert.equal(list.body.data[0].unreadCount, 2)
    })

    it('clears the unread count when the thread is read, and still writes receipts', async () => {
      const read = await request(app)
        .patch(`/api/conversations/${conversationId}/read`).set(asAuth(bobToken)).send({})
      assert.equal(read.status, 200, JSON.stringify(read.body))

      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(total.body.data.unread, 0)

      const receipts = await query(
        'SELECT COUNT(*)::int AS n FROM message_read_status WHERE user_id = $1', [bob.id],
      )
      assert.equal(receipts.rows[0].n, 2, 'Phase 1 read receipts must still be written')

      const thread = await request(app)
        .get(`/api/conversations/${conversationId}/messages`).set(asAuth(aliceToken))
      assert.ok(
        thread.body.data.every((m) => m.readByPeer),
        'the sender sees them as read',
      )
    })

    it('counts a message that arrives after the read position', async () => {
      await request(app)
        .patch(`/api/conversations/${conversationId}/read`).set(asAuth(bobToken)).send({})

      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'one more thing' })

      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(total.body.data.unread, 1)
    })

    it('does not count your own messages as unread', async () => {
      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(aliceToken))
      assert.equal(total.body.data.unread, 0)
    })

    it('only reads as far as it says, and never un-reads', async () => {
      const thread = await request(app)
        .get(`/api/conversations/${conversationId}/messages`).set(asAuth(bobToken))
      const [first, second] = thread.body.data.slice().reverse()

      const partial = await request(app)
        .patch(`/api/conversations/${conversationId}/read`)
        .set(asAuth(bobToken)).send({ upTo: first.id })
      assert.equal(partial.status, 200, JSON.stringify(partial.body))
      assert.equal(partial.body.data.lastReadMessageId, first.id)

      const receipts = await query(
        `SELECT m.body FROM message_read_status rs
           JOIN messages m ON m.id = rs.message_id
          WHERE rs.user_id = $1`,
        [bob.id],
      )
      assert.deepEqual(receipts.rows.map((r) => r.body), ['one'],
        'a receipt is a claim about what has been read, not about the whole thread')

      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(total.body.data.unread, 1, 'the message past the cursor is still unread')

      const backwards = await request(app)
        .patch(`/api/conversations/${conversationId}/read`)
        .set(asAuth(bobToken)).send({ upTo: first.id })
      assert.equal(backwards.status, 200)
      assert.equal(backwards.body.data.lastReadMessageId, first.id)

      const all = await request(app)
        .patch(`/api/conversations/${conversationId}/read`)
        .set(asAuth(bobToken)).send({ upTo: second.id })
      assert.equal(all.body.data.lastReadMessageId, second.id)
      const after = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(after.body.data.unread, 0)
    })

    it('will not read this thread up to a message from another thread', async () => {
      const dave = await createUser()
      const elsewhere = await request(app)
        .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: dave.id })
      assert.equal(elsewhere.status, 200)
      const posted = await request(app)
        .post(`/api/conversations/${elsewhere.body.data.id}/messages`)
        .set(asAuth(aliceToken)).send({ body: 'a different thread entirely' })
      assert.equal(posted.status, 201)

      const read = await request(app)
        .patch(`/api/conversations/${conversationId}/read`)
        .set(asAuth(bobToken)).send({ upTo: posted.body.data.id })
      assert.equal(read.status, 404)

      const total = await request(app)
        .get('/api/conversations/unread-count').set(asAuth(bobToken))
      assert.equal(total.body.data.unread, 2, 'a rejected read marks nothing')
    })
  })
})

describe('phase 5 realtime messaging', () => {
  let alice
  let bob
  let carol
  let aliceToken
  let socketUrl

  beforeEach(async () => {
    await resetAll()
    alice = await createUser()
    bob = await createUser()
    carol = await createUser({ privacy: 'nobody' })
    aliceToken = await loginAs(alice)
    socketUrl = `http://127.0.0.1:${httpServer.address().port}`
  })

  const connect = async (token) => {
    const socket = ioClient(socketUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
    })
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    return socket
  }

  const collect = (socket, event) => {
    const seen = []
    socket.on(event, (payload) => seen.push(payload))
    return seen
  }

  it('pushes a message to each participant exactly once', async () => {
    const aliceSocket = await connect(aliceToken)
    const bobToken = await loginAs(bob)
    const bobSocket = await connect(bobToken)

    try {
      const opened = await request(app)
        .post('/api/conversations').set(asAuth(aliceToken)).send({ peerId: bob.id })

      const forAlice = collect(aliceSocket, 'message:new')
      const forBob = collect(bobSocket, 'message:new')

      const ack = await new Promise((resolve) => {
        aliceSocket.emit('message:send', { recipientId: bob.id, body: 'sent over the socket' }, resolve)
      })
      assert.equal(ack.ok, true, JSON.stringify(ack))
      await new Promise((resolve) => setTimeout(resolve, 200))

      assert.equal(forAlice.length, 1, 'the sender must get its own message once')
      assert.equal(forBob.length, 1, 'the recipient must get the message once')
      assert.equal(forBob[0].body, 'sent over the socket')
      assert.equal(forBob[0].conversationId, opened.body.data.id)

      const { rows } = await query('SELECT conversation_id FROM messages ORDER BY created_at DESC LIMIT 1')
      assert.equal(rows[0].conversation_id, opened.body.data.id)
    } finally {
      aliceSocket.close()
      bobSocket.close()
    }
  })

  it('never accepts an unauthenticated socket', async () => {
    const socket = ioClient(socketUrl, { transports: ['websocket'] })
    const error = await new Promise((resolve) => {
      socket.once('connect_error', resolve)
      socket.once('connect', () => resolve(null))
    })
    socket.close()
    assert.ok(error, 'a socket with no token must not connect')
  })

  it('refuses to send to somebody the sender may not message', async () => {
    const socket = await connect(aliceToken)
    try {
      const ack = await new Promise((resolve) => {
        socket.emit('message:send', { recipientId: carol.id, body: 'hello' }, resolve)
      })
      assert.equal(ack.ok, false)
      assert.equal(ack.error, 'You cannot message this person')
    } finally {
      socket.close()
    }
  })

  it('rate limits a socket that sends faster than a person could type', async () => {
    const socket = await connect(aliceToken)
    try {
      const acks = []
      for (let i = 0; i < 40; i += 1) {
        acks.push(await new Promise((resolve) => {
          socket.emit('message:send', { recipientId: bob.id, body: `spam ${i}` }, resolve)
        }))
      }

      const accepted = acks.filter((a) => a.ok).length
      assert.equal(accepted, 30, 'the 31st message in a minute is refused')
      assert.match(acks.at(-1).error, /Too many/)

      const { rows } = await query('SELECT COUNT(*)::int AS n FROM messages')
      assert.equal(rows[0].n, accepted, 'a refused send must not be stored')
    } finally {
      socket.close()
    }
  })

  it('will not let a socket join a conversation it is not part of', async () => {
    const socket = await connect(aliceToken)
    try {
      const ack = await new Promise((resolve) => {
        socket.emit('conversation:join', { peerId: carol.id }, resolve)
      })
      assert.equal(ack.ok, false)
      assert.equal(ack.error, 'not authorised')

      const withBadId = await new Promise((resolve) => {
        socket.emit('conversation:join', { peerId: '../../etc/passwd' }, resolve)
      })
      assert.equal(withBadId.ok, false)
    } finally {
      socket.close()
    }
  })

  it('relays typing to the peer only', async () => {
    const bobToken = await loginAs(bob)
    const carolToken = await loginAs(carol)
    const aliceSocket = await connect(aliceToken)
    const bobSocket = await connect(bobToken)
    const carolSocket = await connect(carolToken)

    try {
      for (const socket of [aliceSocket, bobSocket]) {
        await new Promise((resolve) => {
          socket.emit('conversation:join', { peerId: alice.id }, resolve)
        })
      }

      const forBob = collect(bobSocket, 'typing')
      const forCarol = collect(carolSocket, 'typing')

      aliceSocket.emit('typing', { recipientId: bob.id, isTyping: true })
      await new Promise((resolve) => setTimeout(resolve, 200))

      assert.equal(forBob.length, 1)
      assert.equal(forBob[0].userId, alice.id)
      assert.equal(forCarol.length, 0, 'somebody outside the thread hears nothing')
    } finally {
      aliceSocket.close()
      bobSocket.close()
      carolSocket.close()
    }
  })
})

describe('phase 5 background scheduler', () => {
  let organizer
  let attendee
  let organizerToken
  let attendeeToken

  beforeEach(async () => {
    await resetAll()
    organizer = await createUser()
    attendee = await createUser()
    organizerToken = await loginAs(organizer)
    attendeeToken = await loginAs(attendee)
  })

  it('does not run on an interval in tests', () => {
    assert.equal(config.scheduler.enabled, false)
  })

  it('reminds people about events today and tomorrow, and only once', async () => {
    const today = await publishEvent(organizerToken, 0)
    const tomorrow = await publishEvent(organizerToken, 1, { title: 'Tomorrow Meetup' })

    await rsvpGoing(organizerToken, today.id)
    await rsvpGoing(attendeeToken, today.id)
    await rsvpGoing(attendeeToken, tomorrow.id)

    const first = await scheduler.runEventSweepsJob()
    assert.equal(first.status, 'succeeded', JSON.stringify(first))
    assert.equal(first.result.reminders.events, 2)
    assert.equal(first.result.reminders.sent, 3)

    const titles = (await notificationsFor(attendee.id, 'event_reminder')).map((n) => n.title)
    assert.equal(titles.length, 2)
    assert.ok(titles.some((t) => t.includes('is today')), titles.join(' | '))
    assert.ok(titles.some((t) => t.includes('is tomorrow')), titles.join(' | '))

    const second = await scheduler.runEventSweepsJob()
    assert.equal(second.status, 'skipped', "the day's run is claimed once")
    assert.equal((await notificationsFor(attendee.id, 'event_reminder')).length, 2)
  })

  it('does not remind somebody who muted reminders', async () => {
    const today = await publishEvent(organizerToken, 0)
    await rsvpGoing(attendeeToken, today.id)
    await query(
      `UPDATE notification_preferences
          SET muted_types = ARRAY['event_reminder']::VARCHAR[]
        WHERE user_id = $1`,
      [attendee.id],
    )

    await scheduler.runEventSweepsJob()
    assert.equal((await notificationsFor(attendee.id, 'event_reminder')).length, 0)
  })

  it('does not remind somebody who only said they might come', async () => {
    const today = await publishEvent(organizerToken, 0)
    const res = await request(app)
      .post(`/api/events/${today.id}/rsvp`)
      .set(asAuth(attendeeToken))
      .send({ status: 'interested' })
    assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.body))

    await scheduler.runEventSweepsJob()
    assert.equal((await notificationsFor(attendee.id, 'event_reminder')).length, 0)
  })

  it('ignores a draft event', async () => {
    const created = await request(app)
      .post('/api/events')
      .set(asAuth(organizerToken))
      .send({
        title: 'Still Being Planned',
        description: 'Nothing is confirmed about this one yet, not even the day.',
        startTime: instantOnDay(0),
        endTime: instantOnDay(0, 20),
        venue: 'Room not yet booked',
      })
    assert.equal(created.status, 201, JSON.stringify(created.body))

    // A draft is not open for RSVPs, so the sweep never sees anybody to remind.
    const refused = await request(app)
      .post(`/api/events/${created.body.data.id}/rsvp`)
      .set(asAuth(organizerToken))
      .send({ status: 'going' })
    assert.equal(refused.status, 409)

    await scheduler.runEventSweepsJob()
    assert.equal((await notificationsFor(organizer.id, 'event_reminder')).length, 0)
  })

  it('completes an event whose day has passed and tells the people who came', async () => {
    const past = await publishEvent(organizerToken, -2)
    await rsvpGoing(attendeeToken, past.id)

    const checkedIn = await request(app)
      .patch(`/api/events/${past.id}/attendees/${attendee.id}`)
      .set(asAuth(organizerToken))
      .send({ checkedIn: true })
    assert.equal(checkedIn.status, 200, JSON.stringify(checkedIn.body))

    await scheduler.runEventSweepsJob()

    const { rows } = await query('SELECT status FROM events WHERE id = $1', [past.id])
    assert.equal(rows[0].status, 'completed')

    const thanks = await notificationsFor(attendee.id, 'event_updated')
    assert.equal(thanks.length, 1)
    assert.match(thanks[0].title, /finished/)
    assert.equal(thanks[0].actor_id, null, 'a sweep has nobody to credit')

    // A second pass must not tell them again.
    await scheduler.runEventSweepsJob()
    assert.equal((await notificationsFor(attendee.id, 'event_updated')).length, 1)
  })

  it('leaves an event that has not finished yet alone', async () => {
    const current = await publishEvent(organizerToken, 0)
    await scheduler.runEventSweepsJob()
    const { rows } = await query('SELECT status FROM events WHERE id = $1', [current.id])
    assert.equal(rows[0].status, 'published')
  })

  it('writes every run to the ledger', async () => {
    await scheduler.runEventSweepsJob()
    const runs = await jobModel.recentRuns()
    assert.equal(runs.length, 1)
    assert.equal(runs[0].status, 'succeeded')
    assert.ok(runs[0].run_key.startsWith('event-sweeps:'))
    assert.equal(runs[0].attempts, 1)
  })

  it('lets a crashed run be taken over once it is stale, and not before', async () => {
    const key = 'event-sweeps:1999-01-01'
    await jobModel.claimRun(key, 'event-sweeps')

    assert.equal(
      await jobModel.claimRun(key, 'event-sweeps', { staleAfterMinutes: 60 }),
      null,
      'a live run is not claimable',
    )

    await directQuery(
      `UPDATE background_jobs SET started_at = NOW() - INTERVAL '3 hours' WHERE run_key = $1`,
      [key],
    )

    const takenOver = await jobModel.claimRun(key, 'event-sweeps', { staleAfterMinutes: 60 })
    assert.ok(takenOver, 'a stale run must be claimable again')
    assert.equal(takenOver.attempts, 2)

    await jobModel.finishRun(key, { status: 'succeeded', result: { sent: 1 } })
    assert.equal(
      await jobModel.claimRun(key, 'event-sweeps', { staleAfterMinutes: 60 }),
      null,
      'a finished run is not retried while it is fresh',
    )
  })

  it('closes off a run that never finished', async () => {
    await jobModel.claimRun('event-sweeps:1999-01-02', 'event-sweeps')
    await directQuery(
      `UPDATE background_jobs SET started_at = NOW() - INTERVAL '5 hours'
        WHERE run_key = 'event-sweeps:1999-01-02'`,
    )

    const reaped = await scheduler.reapStaleRunsJob()
    assert.equal(reaped.reaped, 1)

    const { rows } = await query(
      `SELECT status, error FROM background_jobs WHERE run_key = 'event-sweeps:1999-01-02'`,
    )
    assert.equal(rows[0].status, 'failed')
    assert.match(rows[0].error, /never finished/)
  })

  it('records a failure instead of throwing', async () => {
    const outcome = await scheduler.runJob({
      name: 'always-fails',
      runKey: 'always-fails:1',
      work: async () => { throw new Error('mailer is down') },
    })
    assert.equal(outcome.status, 'failed')
    assert.match(outcome.error, /mailer is down/)

    const { rows } = await query(
      `SELECT status, error FROM background_jobs WHERE run_key = 'always-fails:1'`,
    )
    assert.equal(rows[0].status, 'failed')
    assert.match(rows[0].error, /mailer is down/)
  })

  it('stays idempotent when the sweep is called directly, without a claim', async () => {
    const today = await publishEvent(organizerToken, 0)
    await rsvpGoing(attendeeToken, today.id)

    const first = await eventService.runEventSweeps()
    assert.equal(first.reminders.sent, 1)

    const second = await eventService.runEventSweeps()
    assert.equal(second.reminders.sent, 0, 'the dedupe key stops a second email')
    assert.equal(second.reminders.skipped, 1)

    const { rows } = await query('SELECT COUNT(*)::int AS n FROM background_jobs')
    assert.equal(rows[0].n, 0, 'a direct call claims nothing')
  })

  it('reports its health from the ledger rather than from memory', async () => {
    await scheduler.runEventSweepsJob()
    const status = await scheduler.schedulerStatus()
    assert.equal(status.enabled, false)
    assert.equal(status.succeeded, 1)
    assert.equal(status.running, 0)
    assert.equal(status.failed, 0)
  })

  it('does not start a timer when it is disabled', () => {
    assert.equal(scheduler.startScheduler(), null)
    assert.equal(scheduler.schedulerRunning(), false)
  })

  it('reads the clock again on every pass instead of reusing the time it started', async () => {
    // The run key carries the day, so a scheduler that held onto the instant it
    // was started would re-run today's key every fifteen minutes forever and
    // tomorrow's reminders would never be sent.
    const enabled = config.scheduler.enabled
    const intervalMs = config.scheduler.intervalMs
    config.scheduler.enabled = true
    config.scheduler.intervalMs = 5

    try {
      const aYearOut = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)
      scheduler.startScheduler({ now: aYearOut })

      const realDay = dateOnly(new Date())
      await waitFor(async () => {
        const { rows } = await query('SELECT run_key FROM background_jobs')
        return rows.some((r) => r.run_key === `event-sweeps:${realDay}`)
      }, 'a pass for the real day')

      const { rows } = await query('SELECT run_key FROM background_jobs ORDER BY run_key')
      const keys = rows.map((r) => r.run_key)
      assert.ok(keys.includes(`event-sweeps:${dateOnly(aYearOut)}`), keys.join(' | '))
      assert.ok(keys.includes(`event-sweeps:${realDay}`), keys.join(' | '))
      assert.equal(scheduler.schedulerRunning(), true)
    } finally {
      scheduler.stopScheduler()
      config.scheduler.enabled = enabled
      config.scheduler.intervalMs = intervalMs
    }

    assert.equal(scheduler.schedulerRunning(), false)
  })
})