import 'dotenv/config'
import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import crypto from 'node:crypto'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_suite_12345'

// Start the isolated test database before importing app/db modules
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')

let seq = 0
const uniq = () => `p6.${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`

async function resetAll() {
  await query(
    `TRUNCATE users, alumni_profiles, student_profiles, donations, payment_transactions,
              donation_receipts, reports, moderation_actions, content_moderation,
              jobs, events, notifications, audit_logs
     RESTART IDENTITY CASCADE`,
  )
}

async function createUser({ role = 'ALUMNI', email } = {}) {
  const mail = email || `${uniq()}@example.edu`
  const passwordHash = await hashPassword('Str0ngPass!23')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1,$2,'Test','Person',TRUE) RETURNING id, email`,
    [mail, passwordHash],
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
       VALUES ($1,'BS Computer Science','Computing',3)`,
      [id],
    )
  } else if (role === 'ALUMNI') {
    await query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department,
         current_company, current_position, industry, bio, city, country,
         latitude, longitude, is_open_to_mentor, show_on_map, verification_status)
       VALUES ($1,2018,'BSc Computer Science','Computing','Acme','Engineer',
         'Software','Bio','London','UK',51.5074,-0.1278,TRUE,TRUE,'verified')`,
      [id],
    )
  }
  return { id, email: mail, password: 'Str0ngPass!23' }
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

function makeStripeSignature(rawBody, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

describe('Phase 6 — Donations, Payments, Moderation & Admin System', () => {
  beforeEach(async () => {
    await resetAll()
  })

  after(async () => {
    await stopTestDatabase()
  })

  // =========================================================================
  // 1. Donations & Payments
  // =========================================================================
  describe('Donation and Payment Lifecycle', () => {
    it('creates a donation and confirms payment with receipt and notification', async () => {
      const donor = await createUser({ role: 'ALUMNI' })
      const token = await loginAs(donor)

      // Step 1: Initiate donation
      const createRes = await request(app)
        .post('/api/donations/create')
        .set(asAuth(token))
        .send({
          amount: 150.00,
          currency: 'USD',
          purpose: 'Computer Science Lab Upgrade',
          message: 'Happy to support the department!',
          isAnonymous: false,
        })

      assert.equal(createRes.status, 201)
      assert.equal(createRes.body.success, true)
      assert.ok(createRes.body.data.donation.id)
      assert.equal(createRes.body.data.donation.amount, 150)
      assert.equal(createRes.body.data.donation.status, 'PENDING')
      const donationId = createRes.body.data.donation.id
      const providerRef = createRes.body.data.providerReference

      // Step 2: Confirm donation
      const confirmRes = await request(app)
        .post('/api/donations/confirm')
        .set(asAuth(token))
        .send({
          donationId,
          providerReference: providerRef,
        })

      assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body))
      assert.equal(confirmRes.body.success, true)
      assert.equal(confirmRes.body.data.donation.status, 'SUCCESS')
      assert.ok(confirmRes.body.data.receipt)
      assert.match(confirmRes.body.data.receipt.receiptNumber, /^RCPT-\d{4}-\d{6}$/)
      assert.equal(confirmRes.body.data.receipt.amount, 150)

      // Step 3: Check notification generated
      const notifRes = await request(app)
        .get('/api/notifications')
        .set(asAuth(token))
      assert.equal(notifRes.status, 200)
      const donationNotif = notifRes.body.data.find((n) => n.type === 'donation_confirmation')
      assert.ok(donationNotif, 'Should generate in-app confirmation notification')

      // Step 4: List my donations
      const listRes = await request(app)
        .get('/api/donations/my')
        .set(asAuth(token))
      assert.equal(listRes.status, 200)
      assert.equal(listRes.body.data.length, 1)
      assert.equal(listRes.body.data[0].id, donationId)

      // Step 5: Retrieve receipt by donation id
      const receiptRes = await request(app)
        .get(`/api/donations/receipts/${donationId}`)
        .set(asAuth(token))
      assert.equal(receiptRes.status, 200)
      assert.equal(receiptRes.body.data.amount, 150)

      // Step 6: IDOR test - another user cannot see this receipt
      const stranger = await createUser({ role: 'STUDENT' })
      const strangerToken = await loginAs(stranger)
      const forbiddenReceiptRes = await request(app)
        .get(`/api/donations/receipts/${donationId}`)
        .set(asAuth(strangerToken))
      assert.equal(forbiddenReceiptRes.status, 404)
    })

    it('rejects invalid donation amounts', async () => {
      const donor = await createUser({ role: 'ALUMNI' })
      const token = await loginAs(donor)

      const resNegative = await request(app)
        .post('/api/donations/create')
        .set(asAuth(token))
        .send({ amount: -50 })
      assert.equal(resNegative.status, 422)

      const resZero = await request(app)
        .post('/api/donations/create')
        .set(asAuth(token))
        .send({ amount: 0 })
      assert.equal(resZero.status, 422)
    })

    it('handles Stripe webhook verification, execution, and idempotent replays', async () => {
      const donor = await createUser({ role: 'ALUMNI' })
      const token = await loginAs(donor)

      // Create donation
      const createRes = await request(app)
        .post('/api/donations/create')
        .set(asAuth(token))
        .send({
          amount: 250.00,
          currency: 'USD',
          purpose: 'Scholarship fund',
        })
      const donationId = createRes.body.data.donation.id
      const providerRef = createRes.body.data.providerReference

      // Construct Stripe payment_intent.succeeded event
      const eventPayload = JSON.stringify({
        id: `evt_test_${uniq()}`,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: providerRef,
            status: 'succeeded',
            amount: 25000,
            currency: 'usd',
            metadata: { donation_id: donationId },
          },
        },
      })

      // Delivery with valid signature
      const validSig = makeStripeSignature(eventPayload)
      const webhookRes = await request(app)
        .post('/api/payments/stripe/webhook')
        .set('stripe-signature', validSig)
        .set('Content-Type', 'application/json')
        .send(eventPayload)

      assert.equal(webhookRes.status, 200)
      assert.equal(webhookRes.body.success, true)

      // Verify donation updated to SUCCESS in database
      const checkRes = await request(app)
        .get(`/api/donations/receipts/${donationId}`)
        .set(asAuth(token))
      assert.equal(checkRes.status, 200)
      assert.equal(checkRes.body.data.amount, 250)

      // Replay same webhook event -> must be idempotent
      const replayRes = await request(app)
        .post('/api/payments/stripe/webhook')
        .set('stripe-signature', validSig)
        .set('Content-Type', 'application/json')
        .send(eventPayload)

      assert.equal(replayRes.status, 200)
      assert.equal(replayRes.body.data.replayed, true)

      // Reject webhook with invalid signature
      const badSigRes = await request(app)
        .post('/api/payments/stripe/webhook')
        .set('stripe-signature', 't=123456,v1=deadbeefbadsignature')
        .set('Content-Type', 'application/json')
        .send(eventPayload)
      assert.equal(badSigRes.status, 400)
    })
  })

  // =========================================================================
  // 2. Admin Dashboard & Metrics
  // =========================================================================
  describe('Admin Dashboard Statistics', () => {
    it('aggregates platform metrics correctly for administrators', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const adminToken = await loginAs(admin)

      const alumni1 = await createUser({ role: 'ALUMNI' })
      const alumniToken = await loginAs(alumni1)
      await createUser({ role: 'STUDENT' })

      // Create a successful donation
      const donRes = await request(app)
        .post('/api/donations/create')
        .set(asAuth(alumniToken))
        .send({ amount: 500, currency: 'USD' })
      await request(app)
        .post('/api/donations/confirm')
        .set(asAuth(alumniToken))
        .send({ providerReference: donRes.body.data.providerReference })

      // Fetch dashboard metrics
      const statsRes = await request(app)
        .get('/api/admin/dashboard/stats')
        .set(asAuth(adminToken))

      assert.equal(statsRes.status, 200)
      assert.equal(statsRes.body.success, true)
      const data = statsRes.body.data
      assert.ok(data.totalUsers >= 3)
      assert.ok(data.totalAlumni >= 1)
      assert.ok(data.totalStudents >= 1)
      assert.equal(data.donations.count, 1)
      assert.equal(data.donations.totalAmount, 500)
    })

    it('denies non-admin access to admin dashboard stats', async () => {
      const student = await createUser({ role: 'STUDENT' })
      const studentToken = await loginAs(student)

      const res = await request(app)
        .get('/api/admin/dashboard/stats')
        .set(asAuth(studentToken))
      assert.equal(res.status, 403)
    })
  })

  // =========================================================================
  // 3. User Administration & RBAC
  // =========================================================================
  describe('User Administration and Role Controls', () => {
    it('allows admin to suspend, reactivate, and change user role with audit logging', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const adminToken = await loginAs(admin)

      const target = await createUser({ role: 'STUDENT' })
      const targetToken = await loginAs(target)

      // Step 1: Suspend user
      const suspendRes = await request(app)
        .patch(`/api/admin/users/${target.id}/suspend`)
        .set(asAuth(adminToken))
        .send({ reason: 'Violated community guidelines' })
      assert.equal(suspendRes.status, 200)

      // Verify suspended user cannot access authenticated routes with old token
      const checkBlocked = await request(app)
        .get('/api/profiles/me')
        .set(asAuth(targetToken))
      assert.equal(checkBlocked.status, 403)

      // Step 2: Reactivate user
      const reactivateRes = await request(app)
        .patch(`/api/admin/users/${target.id}/reactivate`)
        .set(asAuth(adminToken))
      assert.equal(reactivateRes.status, 200)

      // Target can log in again
      const newToken = await loginAs(target)
      assert.ok(newToken)

      // Step 3: Change user role to ALUMNI
      const roleRes = await request(app)
        .patch(`/api/admin/users/${target.id}/role`)
        .set(asAuth(adminToken))
        .send({ role: 'ALUMNI' })
      assert.equal(roleRes.status, 200)
      assert.ok(roleRes.body.data.user.roles.includes('ALUMNI'))

      // Step 4: Audit logs verify these actions were recorded
      const logsRes = await request(app)
        .get('/api/admin/audit-logs')
        .set(asAuth(adminToken))
        .query({ actorId: admin.id })
      assert.equal(logsRes.status, 200)
      assert.ok(logsRes.body.data.length >= 3)
      const actions = logsRes.body.data.map((l) => l.action)
      assert.ok(actions.includes('USER_SUSPENDED'))
      assert.ok(actions.includes('USER_REACTIVATED'))
      assert.ok(actions.includes('USER_ROLE_CHANGED'))
    })

    it('protects against demoting the last administrator', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const adminToken = await loginAs(admin)

      const demoteRes = await request(app)
        .patch(`/api/admin/users/${admin.id}/role`)
        .set(asAuth(adminToken))
        .send({ role: 'STUDENT' })
      assert.equal(demoteRes.status, 403)
      assert.match(demoteRes.body.error.message, /last remaining administrator/i)
    })
  })

  // =========================================================================
  // 4. Content Moderation & Reports
  // =========================================================================
  describe('Reports and Content Moderation', () => {
    it('allows user to report content and admin to review and take action', async () => {
      const admin = await createUser({ role: 'ADMIN' })
      const adminToken = await loginAs(admin)

      const alumni = await createUser({ role: 'ALUMNI' })
      const alumniToken = await loginAs(alumni)

      const student = await createUser({ role: 'STUDENT' })
      const studentToken = await loginAs(student)

      // Alumni creates a job
      const jobRes = await request(app)
        .post('/api/jobs')
        .set(asAuth(alumniToken))
        .send({
          title: 'Software Developer',
          companyName: 'Acme Corp',
          description: 'Great role for graduating seniors looking to build modern distributed systems and scalable applications.',
          location: 'Remote',
          workMode: 'remote',
          employmentType: 'full_time',
        })
      assert.equal(jobRes.status, 201)
      const jobId = jobRes.body.data.id

      // Student reports the job
      const reportRes = await request(app)
        .post('/api/reports')
        .set(asAuth(studentToken))
        .send({
          targetType: 'job',
          targetId: jobId,
          reason: 'spam',
          details: 'Suspicious job post requesting upfront fees.',
        })
      assert.equal(reportRes.status, 201)
      assert.equal(reportRes.body.success, true)
      const reportId = reportRes.body.data.report.id

      // Admin lists reports
      const listReportsRes = await request(app)
        .get('/api/admin/reports')
        .set(asAuth(adminToken))
      assert.equal(listReportsRes.status, 200)
      assert.equal(listReportsRes.body.data.length, 1)

      // Admin reviews report
      const reviewRes = await request(app)
        .patch(`/api/admin/reports/${reportId}`)
        .set(asAuth(adminToken))
        .send({
          status: 'RESOLVED',
          description: 'Reviewed and confirmed suspicious',
        })
      assert.equal(reviewRes.status, 200)
      assert.equal(reviewRes.body.data.report.status, 'RESOLVED')

      // Admin executes moderation action (hide target job)
      const modRes = await request(app)
        .post('/api/admin/moderation')
        .set(asAuth(adminToken))
        .send({
          action: 'hide',
          targetType: 'job',
          targetId: jobId,
          reason: 'Confirmed fraudulent job posting',
        })
      assert.equal(modRes.status, 200)
      assert.equal(modRes.body.success, true)

      // Verify content_moderation ledger has entry
      const { rows } = await query(
        `SELECT * FROM content_moderation WHERE target_type = 'job' AND target_id = $1`,
        [jobId],
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0].state, 'hidden')
    })

    it('rejects reports for nonexistent target entities', async () => {
      const student = await createUser({ role: 'STUDENT' })
      const studentToken = await loginAs(student)

      const nonExistentId = '99999999-9999-9999-9999-999999999999'
      const res = await request(app)
        .post('/api/reports')
        .set(asAuth(studentToken))
        .send({
          targetType: 'job',
          targetId: nonExistentId,
          reason: 'spam',
        })
      assert.equal(res.status, 404)
    })
  })
})
