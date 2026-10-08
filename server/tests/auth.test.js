/**
 * Native Node.js + Supertest test suite for Authentication & Registration.
 * Validates Express routes, Zod schemas, database constraints, and session lifecycles.
 *
 * Run with:
 *   npm run test:auth
 *   (or: node --test tests/auth.test.js)
 */
import 'dotenv/config'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

// Spin up isolated ephemeral PGlite test database
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')

let seq = 0
const uniqEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${seq++}@university.edu`

describe('Native MERN Stack Tests: Authentication & Registration', () => {
  after(async () => {
    await closePool()
    await stopTestDatabase()
  })

  // =========================================================================
  // 1. REGISTRATION TESTS
  // =========================================================================
  describe('POST /api/auth/register', () => {
    it('TC-AUTH-01: Successfully registers a student with valid fields', async () => {
      const email = uniqEmail('student')
      const payload = {
        email,
        password: 'ValidPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT',
        yearOfStudy: 3,
        studentIdNumber: 'STU-9901',
        department: 'Computer Science',
        acceptTerms: true,
      }

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload)

      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.user.email, email)
      assert.equal(res.body.data.user.firstName, 'John')
      assert.equal(res.body.data.user.lastName, 'Doe')
      assert.ok(res.body.data.user.id)
    })

    it('TC-AUTH-02: Successfully registers an alumni with graduation year', async () => {
      const email = uniqEmail('alumni')
      const payload = {
        email,
        password: 'ValidAlumPassword456#',
        firstName: 'Sarah',
        lastName: 'Connor',
        role: 'ALUMNI',
        graduationYear: 2021,
        degree: 'BS Mechanical Engineering',
        department: 'Mechanical',
        acceptTerms: true,
      }

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload)

      assert.equal(res.status, 201)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.user.email, email)
    })

    it('TC-AUTH-03: Rejects invalid email format with 422 Unprocessable Entity', async () => {
      const payload = {
        email: 'invalid-email-format',
        password: 'ValidPassword123!',
        firstName: 'Alice',
        lastName: 'Wonder',
        role: 'STUDENT',
        acceptTerms: true,
      }

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload)

      assert.equal(res.status, 422)
      assert.equal(res.body.success, false)
      assert.match(JSON.stringify(res.body), /email/i)
    })

    it('TC-AUTH-04: Rejects passwords that do not meet complexity requirements', async () => {
      const weakPasswords = [
        'Short1!',           // Less than 10 chars
        'alllowercase123!',  // Missing uppercase
        'ALLUPPERCASE123!',  // Missing lowercase
        'NoNumbersHere!!',   // Missing digit
        'NoSymbolsPass123',  // Missing symbol
      ]

      for (const pwd of weakPasswords) {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            email: uniqEmail('pwd'),
            password: pwd,
            firstName: 'Weak',
            lastName: 'Pass',
            role: 'STUDENT',
            acceptTerms: true,
          })

        assert.equal(res.status, 422, `Expected 422 for password: ${pwd}`)
        assert.equal(res.body.success, false)
      }
    })

    it('TC-AUTH-05: Rejects registration when terms are not accepted', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqEmail('terms'),
          password: 'ValidPassword123!',
          firstName: 'No',
          lastName: 'Terms',
          role: 'STUDENT',
          acceptTerms: false,
        })

      assert.equal(res.status, 422)
      assert.equal(res.body.success, false)
      assert.match(JSON.stringify(res.body), /terms/i)
    })

    it('TC-AUTH-06: Rejects duplicate email registration with 409 Conflict', async () => {
      const email = uniqEmail('duplicate')
      const payload = {
        email,
        password: 'ValidPassword123!',
        firstName: 'Original',
        lastName: 'User',
        role: 'STUDENT',
        acceptTerms: true,
      }

      // First registration should succeed
      const firstRes = await request(app).post('/api/auth/register').send(payload)
      assert.equal(firstRes.status, 201)

      // Second registration with the same email must fail with 409
      const secondRes = await request(app).post('/api/auth/register').send(payload)
      assert.equal(secondRes.status, 409)
      assert.equal(secondRes.body.success, false)
      assert.match(secondRes.body.error?.message || secondRes.body.message, /already exists/i)
    })

    it('TC-AUTH-07: Rejects alumni registration if graduationYear is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqEmail('alumni.nograd'),
          password: 'ValidPassword123!',
          firstName: 'No',
          lastName: 'GradYear',
          role: 'ALUMNI',
          acceptTerms: true,
        })

      assert.equal(res.status, 422)
      assert.equal(res.body.success, false)
      assert.match(JSON.stringify(res.body), /graduation year is required/i)
    })

    it('TC-AUTH-08: Rejects alumni registration if yearOfStudy is provided', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: uniqEmail('alumni.yearstudy'),
          password: 'ValidPassword123!',
          firstName: 'Invalid',
          lastName: 'Alumni',
          role: 'ALUMNI',
          graduationYear: 2022,
          yearOfStudy: 3,
          acceptTerms: true,
        })

      assert.equal(res.status, 422)
      assert.equal(res.body.success, false)
      assert.match(JSON.stringify(res.body), /applies to student accounts only/i)
    })

    it('TC-AUTH-09: Rejects student registration if yearOfStudy is out of range', async () => {
      for (const invalidYear of [0, 7, 10, -1]) {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            email: uniqEmail('student.badyear'),
            password: 'ValidPassword123!',
            firstName: 'Bad',
            lastName: 'Year',
            role: 'STUDENT',
            yearOfStudy: invalidYear,
            acceptTerms: true,
          })

        assert.equal(res.status, 422)
        assert.equal(res.body.success, false)
      }
    })
  })

  // =========================================================================
  // 2. LOGIN & SESSION TESTS
  // =========================================================================
  describe('POST /api/auth/login and protected routes', () => {
    it('TC-AUTH-10: Successfully logs in a registered user and returns access token', async () => {
      const email = uniqEmail('login.success')
      const password = 'StrongPassword999!'

      // Register user first
      await request(app).post('/api/auth/register').send({
        email,
        password,
        firstName: 'Active',
        lastName: 'Member',
        role: 'STUDENT',
        acceptTerms: true,
      })

      // Attempt login
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(res.body.data.accessToken)
      assert.equal(res.body.data.user.email, email)

      // Verify Set-Cookie header contains refresh_token
      const cookies = res.headers['set-cookie']
      assert.ok(cookies)
      assert.ok(cookies.some((c) => c.includes('refresh_token')))
    })

    it('TC-AUTH-11: Rejects login with non-existent email with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent.ghost@university.edu',
          password: 'SomePassword123!',
        })

      assert.equal(res.status, 401)
      assert.equal(res.body.success, false)
      assert.match(res.body.error?.message || res.body.message, /invalid email or password/i)
    })

    it('TC-AUTH-12: Rejects login with incorrect password with 401 Unauthorized', async () => {
      const email = uniqEmail('login.wrongpass')
      const correctPassword = 'StrongPassword123!'

      await request(app).post('/api/auth/register').send({
        email,
        password: correctPassword,
        firstName: 'Correct',
        lastName: 'User',
        role: 'STUDENT',
        acceptTerms: true,
      })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword999!' })

      assert.equal(res.status, 401)
      assert.equal(res.body.success, false)
      assert.match(res.body.error?.message || res.body.message, /invalid email or password/i)
    })

    it('TC-AUTH-13: Rejects login when account is suspended with 403 Forbidden', async () => {
      const email = uniqEmail('login.suspended')
      const password = 'StrongPassword123!'

      const regRes = await request(app).post('/api/auth/register').send({
        email,
        password,
        firstName: 'Suspended',
        lastName: 'User',
        role: 'STUDENT',
        acceptTerms: true,
      })
      const userId = regRes.body.data.user.id

      // Suspend account directly in database
      await query('UPDATE users SET is_suspended = TRUE WHERE id = $1', [userId])

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      assert.equal(res.status, 403)
      assert.equal(res.body.success, false)
      assert.match(res.body.error?.message || res.body.message, /suspended/i)
    })

    it('TC-AUTH-14: Protected GET /api/auth/me returns profile when valid Bearer token provided', async () => {
      const email = uniqEmail('me.success')
      const password = 'StrongPassword123!'

      await request(app).post('/api/auth/register').send({
        email,
        password,
        firstName: 'Verified',
        lastName: 'Student',
        role: 'STUDENT',
        acceptTerms: true,
      })

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password })

      const token = loginRes.body.data.accessToken

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)

      assert.equal(meRes.status, 200)
      assert.equal(meRes.body.success, true)
      assert.equal(meRes.body.data.user.email, email)
    })

    it('TC-AUTH-15: Protected GET /api/auth/me returns 401 Unauthorized without token', async () => {
      const res = await request(app).get('/api/auth/me')
      assert.equal(res.status, 401)
      assert.equal(res.body.success, false)
    })
  })
})
