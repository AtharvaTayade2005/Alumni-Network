import 'dotenv/config'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')

let seq = 0
const uniq = () => `prof.${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`

after(async () => {
  await stopTestDatabase()
})

async function createUser({ role = 'PROFESSOR', email } = {}) {
  const address = email ?? `${uniq()}@example.com`
  const password = 'Password123!'
  const hash = await hashPassword(password)
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, 'Dr. Rajesh', 'Kulkarni', TRUE) RETURNING id, email`,
    [address, hash],
  )
  const user = rows[0]
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)`,
    [user.id, role],
  )
  if (role === 'PROFESSOR' || role === 'ALUMNI') {
    await query(
      `INSERT INTO alumni_profiles (user_id, department, current_position, current_company, is_open_to_mentor, mentorship_capacity, verification_status)
       VALUES ($1, 'Computer Engineering', 'Professor & Head', 'Vidyalankar Institute of Technology', TRUE, 5, 'verified')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    )
  }
  if (role === 'STUDENT') {
    await query(
      `INSERT INTO student_profiles (user_id, degree, department, major, year_of_study, is_open_to_mentorship)
       VALUES ($1, 'B.Tech', 'Computer Engineering', 'Computer Science', 3, TRUE)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
    )
  }
  const login = await request(app).post('/api/auth/login').send({ email: address, password })
  return { user, token: login.body.data.accessToken }
}

describe('professor role audit and regression suite', () => {
  it('allows a professor to create, list, and delete an announcement', async () => {
    const prof = await createUser({ role: 'PROFESSOR' })

    // Create announcement
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${prof.token}`)
      .send({
        title: 'Department Research Colloquium 2026',
        department: 'Computer Science',
        targetAudience: 'ALL_STUDENTS',
        content: 'Call for undergraduate paper submissions.',
        status: 'published',
        isPinned: true,
      })

    assert.equal(res.status, 201)
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.title, 'Department Research Colloquium 2026')
    const annId = res.body.data.id

    // List announcements
    const listRes = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${prof.token}`)

    assert.equal(listRes.status, 200)
    assert.ok(listRes.body.data.some((a) => a.id === annId))

    // Delete announcement
    const delRes = await request(app)
      .delete(`/api/announcements/${annId}`)
      .set('Authorization', `Bearer ${prof.token}`)

    assert.equal(delRes.status, 200)
  })

  it('prevents a student from creating an announcement (403 forbidden)', async () => {
    const student = await createUser({ role: 'STUDENT' })

    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        title: 'Unauthorized Student Post',
        department: 'Computer Science',
        targetAudience: 'ALL',
        content: 'Should be rejected by role authorization.',
        status: 'published',
      })

    assert.equal(res.status, 403)
  })

  it('allows students to read published campus announcements', async () => {
    const prof = await createUser({ role: 'PROFESSOR' })
    const student = await createUser({ role: 'STUDENT' })

    await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${prof.token}`)
      .send({
        title: 'Midterm Exam Schedule',
        department: 'Computer Science',
        targetAudience: 'ALL_STUDENTS',
        content: 'Exams start on Monday.',
        status: 'published',
      })

    const res = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${student.token}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
  })

  it('allows a professor to access student analytics and blocks students from accessing it', async () => {
    const prof = await createUser({ role: 'PROFESSOR' })
    const student = await createUser({ role: 'STUDENT' })

    const profRes = await request(app)
      .get('/api/professor/analytics')
      .set('Authorization', `Bearer ${prof.token}`)

    assert.equal(profRes.status, 200)
    assert.equal(profRes.body.success, true)
    assert.ok('totalStudents' in profRes.body.data.metrics)
    assert.ok('activeMentees' in profRes.body.data.metrics)
    assert.ok('pendingRequests' in profRes.body.data.metrics)

    const studentRes = await request(app)
      .get('/api/professor/analytics')
      .set('Authorization', `Bearer ${student.token}`)

    assert.equal(studentRes.status, 403)
  })

  it('allows a student to submit a mentorship advising request to a professor and professor to accept it', async () => {
    const prof = await createUser({ role: 'PROFESSOR' })
    const student = await createUser({ role: 'STUDENT' })

    // Student requests mentorship
    const reqRes = await request(app)
      .post('/api/mentorship/requests')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        mentorId: prof.user.id,
        careerGoal: 'I want to pursue research in distributed storage engines and databases.',
        areaOfInterest: 'Distributed Systems',
        message: 'Looking for advising on my final year capstone thesis.',
        preferredMode: 'video',
      })

    assert.equal(reqRes.status, 201)
    const requestId = reqRes.body.data.id

    // Professor lists incoming requests
    const profRequests = await request(app)
      .get('/api/mentorship/requests')
      .set('Authorization', `Bearer ${prof.token}`)

    assert.equal(profRequests.status, 200)
    const found = profRequests.body.data.find((r) => r.id === requestId)
    assert.ok(found)
    assert.equal(found.direction, 'incoming')

    // Professor accepts request
    const acceptRes = await request(app)
      .patch(`/api/mentorship/requests/${requestId}`)
      .set('Authorization', `Bearer ${prof.token}`)
      .send({
        status: 'accepted',
        responseNote: 'Welcome to the lab. Let us meet during Thursday office hours.',
      })

    assert.equal(acceptRes.status, 200)

    // Verify active mentorship relationship exists
    const relationships = await request(app)
      .get('/api/mentorship/mentorships')
      .set('Authorization', `Bearer ${prof.token}`)

    assert.equal(relationships.status, 200)
    assert.ok(relationships.body.data.length >= 1)
  })
})
