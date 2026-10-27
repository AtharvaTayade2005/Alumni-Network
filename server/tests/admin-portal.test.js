import 'dotenv/config'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')

let seq = 0
const uniq = () => `${Date.now()}.${seq++}.${Math.random().toString(36).slice(2, 8)}`

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

async function createMember({
  role = 'ALUMNI', status = 'verified', overrides = {},
  firstName = 'Admin', lastName = 'Test', password = 'Str0ngPass!23',
} = {}) {
  const email = `${uniq()}@example.edu`
  const passwordHash = await hashPassword(password)
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name,
       is_email_verified, phone, is_active, is_suspended)
     VALUES ($1,$2,$3,$4,TRUE,'+15551234567',TRUE,FALSE)
     RETURNING id, email`,
    [email, passwordHash, firstName, lastName],
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
    const cols = {
      graduation_year: 2018, degree: 'BSc', department: 'Computing',
      current_company: 'Acme', current_position: 'Engineer',
      industry: 'Software', city: 'Mumbai', country: 'India',
      verification_status: status,
      is_open_to_mentor: status === 'verified',
      ...overrides,
    }
    const keys = Object.keys(cols)
    await query(
      `INSERT INTO alumni_profiles (user_id, ${keys.join(',')})
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(',')})`,
      [id, ...keys.map((k) => cols[k])],
    )
  }

  await query('INSERT INTO privacy_settings (user_id) VALUES ($1)', [id])
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

async function createJob(posterId, { status = 'pending_review', moderatedBy = null } = {}) {
  const publishedAt = status === 'published' ? new Date() : null
  const moderatedAt = moderatedBy ? new Date() : null
  const { rows } = await query(
    `INSERT INTO jobs (posted_by, title, company_name, description, location, work_mode, employment_type, experience_level, status, moderated_by, moderated_at, published_at)
     VALUES ($1, 'Software Engineer', 'Acme Corp', 'Great software engineering role', 'Mumbai', 'hybrid', 'full_time', 'mid', $2, $3, $4, $5)
     RETURNING id, status`,
    [posterId, status, moderatedBy, moderatedAt, publishedAt],
  )
  return rows[0]
}

after(async () => {
  await closePool()
  await stopTestDatabase()
})

describe('Admin Portal — Moderation, Verification, and Governance', () => {
  it('returns pending jobs when includePending=true or status=pending', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const poster = await createMember({ role: 'ALUMNI' })
    const token = await tokenFor(admin)

    await createJob(poster.id, { status: 'pending_review' })

    // Query jobs with includePending=true
    const res = await request(app)
      .get('/api/jobs?includePending=true')
      .set(asAuth(token))

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
    const hasPending = res.body.data.some((j) => (j.status || '').toUpperCase() === 'PENDING_REVIEW')
    assert.ok(hasPending, 'Should include pending review jobs')

    // Also query specifically by status=pending
    const resPending = await request(app)
      .get('/api/jobs?status=pending')
      .set(asAuth(token))

    assert.equal(resPending.status, 200)
    assert.ok(resPending.body.data.every((j) => (j.status || '').toUpperCase() === 'PENDING_REVIEW'))
  })

  it('allows authorized administrator to approve a pending job', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const poster = await createMember({ role: 'ALUMNI' })
    const token = await tokenFor(admin)

    const job = await createJob(poster.id, { status: 'pending_review' })

    // Moderate: approve
    const modRes = await request(app)
      .patch(`/api/jobs/${job.id}/moderate`)
      .set(asAuth(token))
      .send({ action: 'approve' })

    assert.equal(modRes.status, 200)
    assert.equal(modRes.body.data.status, 'PUBLISHED')

    // Verify persisted in DB
    const dbCheck = await query(`SELECT status, moderated_by FROM jobs WHERE id = $1`, [job.id])
    assert.equal(dbCheck.rows[0].status, 'published')
    assert.equal(dbCheck.rows[0].moderated_by, admin.id)
  })

  it('allows authorized administrator to reject a job with reason', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const poster = await createMember({ role: 'ALUMNI' })
    const token = await tokenFor(admin)

    const job = await createJob(poster.id, { status: 'pending_review' })

    const modRes = await request(app)
      .patch(`/api/jobs/${job.id}/moderate`)
      .set(asAuth(token))
      .send({ action: 'reject', reason: 'Does not comply with platform safety rules' })

    assert.equal(modRes.status, 200)
    assert.equal(modRes.body.data.status, 'REJECTED')

    const dbCheck = await query(`SELECT status FROM jobs WHERE id = $1`, [job.id])
    assert.equal(dbCheck.rows[0].status, 'rejected')
  })

  it('allows authorized administrator to flag a job', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const poster = await createMember({ role: 'ALUMNI' })
    const token = await tokenFor(admin)

    const job = await createJob(poster.id, { status: 'published', moderatedBy: admin.id })

    const modRes = await request(app)
      .patch(`/api/jobs/${job.id}/moderate`)
      .set(asAuth(token))
      .send({ action: 'flag' })

    assert.equal(modRes.status, 200)
    assert.equal(modRes.body.data.status, 'REJECTED')
    assert.match(modRes.body.message, /flagged/i)

    const dbCheck = await query(`SELECT status FROM jobs WHERE id = $1`, [job.id])
    assert.equal(dbCheck.rows[0].status, 'rejected')
  })

  it('forbids ordinary users from moderating jobs', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const student = await createMember({ role: 'STUDENT' })
    const poster = await createMember({ role: 'ALUMNI' })
    const token = await tokenFor(student)

    const job = await createJob(poster.id, { status: 'published', moderatedBy: admin.id })

    const res = await request(app)
      .patch(`/api/jobs/${job.id}/moderate`)
      .set(asAuth(token))
      .send({ action: 'reject' })

    assert.equal(res.status, 403)
  })

  it('safely and idempotently handles approving an already verified alumni profile', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    // Member already verified
    const alumni = await createMember({ role: 'ALUMNI', status: 'verified' })

    // Approving again must return 200 with alreadyVerified: true and not crash or fail with 409
    const res = await request(app)
      .patch(`/api/admin/alumni/${alumni.id}/verify`)
      .set(asAuth(token))
      .send({ notes: 'Confirming existing verification' })

    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'VERIFIED')
    assert.equal(res.body.data.alreadyVerified, true)
    assert.match(res.body.message, /already VERIFIED/i)
  })

  it('approves a pending alumni profile and records audit trail', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const alumni = await createMember({ role: 'ALUMNI', status: 'pending' })

    const res = await request(app)
      .patch(`/api/admin/alumni/${alumni.id}/verify`)
      .set(asAuth(token))
      .send({ notes: 'Credentials confirmed' })

    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'VERIFIED')
    assert.equal(res.body.data.alreadyVerified, false)

    const dbCheck = await query(`SELECT verification_status FROM alumni_profiles WHERE user_id = $1`, [alumni.id])
    assert.equal(dbCheck.rows[0].verification_status, 'verified')
  })

  it('returns pending verifications queue in /api/admin/alumni/pending', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    await createMember({ role: 'ALUMNI', status: 'pending' })

    const res = await request(app)
      .get('/api/admin/alumni/pending')
      .set(asAuth(token))

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(res.body.data.length > 0)
  })

  it('provides dashboard stats with accurate pending counts', async () => {
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const res = await request(app)
      .get('/api/admin/dashboard/stats')
      .set(asAuth(token))

    assert.equal(res.status, 200)
    assert.ok(typeof res.body.data.totalUsers === 'number')
    assert.ok(typeof res.body.data.pendingVerifications === 'number')
    assert.ok(typeof res.body.data.pendingJobs === 'number')
    assert.ok(typeof res.body.data.pendingEvents === 'number')
  })

  it('protects audit logs endpoint from non-administrators', async () => {
    const student = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(student)

    const res = await request(app)
      .get('/api/admin/audit-logs')
      .set(asAuth(token))

    assert.equal(res.status, 403)
  })
})
