import 'dotenv/config'
import { after, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'

// Start the isolated test database before importing app/db modules
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')
const { cosineSimilarity } = await import('../src/services/ai/embeddingService.js')

let seq = 0
const uniq = () => `ai.${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`

async function resetAll() {
  await query(
    `TRUNCATE users, alumni_profiles, student_profiles, ai_embeddings,
              jobs, events, notifications
     RESTART IDENTITY CASCADE`,
  )
}

async function createStudentUser() {
  const mail = `${uniq()}@student.edu`
  const passwordHash = await hashPassword('Str0ngPass!23')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, 'Jane', 'Student', TRUE) RETURNING id, email`,
    [mail, passwordHash],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'student'`,
    [id],
  )
  await query(
    `INSERT INTO student_profiles (user_id, degree, department, year_of_study)
     VALUES ($1, 'B.Tech IT', 'Information Technology', 3)`,
    [id],
  )
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

async function createAlumniUser({
  firstName = 'Pooja',
  lastName = 'Iyer',
  company = 'Atlassian',
  position = 'Frontend Engineer',
  isOpenToMentor = true,
  skills = ['React', 'TypeScript'],
} = {}) {
  const mail = `${uniq()}@alumni.edu`
  const passwordHash = await hashPassword('Str0ngPass!23')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, email`,
    [mail, passwordHash, firstName, lastName],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'alumni'`,
    [id],
  )
  await query(
    `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department, current_company, current_position, industry, is_open_to_mentor, verification_status)
     VALUES ($1, 2021, 'B.Tech CS', 'Computer Engineering', $2, $3, 'Technology', $4, 'verified')`,
    [id, company, position, isOpenToMentor],
  )
  for (const skillName of skills) {
    let { rows: existing } = await query(
      `SELECT id FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [skillName],
    )
    let skillId = existing[0]?.id
    if (!skillId) {
      const { rows: inserted } = await query(
        `INSERT INTO skills (name, category) VALUES ($1, 'Technical') RETURNING id`,
        [skillName],
      )
      skillId = inserted[0]?.id
    }
    if (skillId) {
      await query(
        `INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT (user_id, skill_id) DO NOTHING`,
        [id, skillId],
      )
    }
  }
  return { id, email: mail, firstName, lastName, company, position }
}

async function createJobPosting({
  title = 'Staff Backend Engineer',
  companyName = 'Google',
  description = 'Build scalable distributed systems with Node.js and PostgreSQL.',
  location = 'Bangalore, India',
  status = 'published',
  postedBy,
} = {}) {
  const posterId = postedBy || (await createAlumniUser({ firstName: 'Poster', lastName: 'Alum' })).id

  const adminMail = `${uniq()}@admin.mod`
  const pwHash = await hashPassword('Str0ngPass!23')
  const { rows: adminRows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, 'Admin', 'Moderator', TRUE) RETURNING id`,
    [adminMail, pwHash],
  )
  const adminId = adminRows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'admin'`,
    [adminId],
  )

  const { rows } = await query(
    `INSERT INTO jobs (posted_by, title, company_name, description, location, status, moderated_by, moderated_at, published_at, work_mode, employment_type)
     VALUES ($1, $2, $3, $4, $5, 'published', $6, NOW(), NOW(), 'remote', 'full_time') RETURNING id, title, company_name`,
    [posterId, title, companyName, description, location, adminId],
  )
  return rows[0]
}

async function createEventRecord({
  title = 'AI & Machine Learning Symposium',
  description = 'Deep dive into LLMs, RAG, and neural architectures.',
  venue = 'Main Auditorium',
  city = 'Mumbai',
  status = 'published',
  organizerId,
} = {}) {
  const orgId = organizerId || (await createAlumniUser({ firstName: 'Event', lastName: 'Organizer' })).id
  const { rows } = await query(
    `INSERT INTO events (organizer_id, title, description, event_date, start_time, end_time, venue, city, status)
     VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '5 days', '10:00:00', '13:00:00', $4, $5, $6)
     RETURNING id, title, venue, city, status`,
    [orgId, title, description, venue, city, status]
  )
  return rows[0]
}

describe('AI Foundation & Architecture Test Suite', () => {
  beforeEach(async () => {
    await resetAll()
  })

  after(async () => {
    await stopTestDatabase()
  })

  describe('1. Math & Similarity Engine', () => {
    it('computes exact match cosine similarity as 1.0', () => {
      const v = [0.2, 0.4, 0.6, 0.8]
      const sim = cosineSimilarity(v, v)
      assert.ok(Math.abs(sim - 1.0) < 1e-6)
    })

    it('computes orthogonal vector similarity as 0.0', () => {
      const v1 = [1, 0]
      const v2 = [0, 1]
      const sim = cosineSimilarity(v1, v2)
      assert.equal(sim, 0)
    })

    it('handles empty or invalid vectors gracefully without throwing', () => {
      assert.equal(cosineSimilarity([], []), 0)
      assert.equal(cosineSimilarity(null, [1, 2]), 0)
      assert.equal(cosineSimilarity([0, 0], [0, 0]), 0)
    })
  })

  describe('2. Authentication Guards on AI Endpoints', () => {
    it('rejects unauthenticated requests to POST /api/ai/chat with 401', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Hello' })
      assert.equal(res.status, 401)
    })

    it('rejects unauthenticated requests to POST /api/ai/search with 401', async () => {
      const res = await request(app)
        .post('/api/ai/search')
        .send({ query: 'React Engineer' })
      assert.equal(res.status, 401)
    })

    it('rejects unauthenticated requests to POST /api/ai/resume/analyze with 401', async () => {
      const res = await request(app)
        .post('/api/ai/resume/analyze')
        .send({ resumeText: 'John Doe, 5 years experience in React' })
      assert.equal(res.status, 401)
    })

    it('rejects unauthenticated requests to POST /api/ai/career/analyze with 401', async () => {
      const res = await request(app)
        .post('/api/ai/career/analyze')
        .send({ targetRole: 'Backend Engineer' })
      assert.equal(res.status, 401)
    })
  })

  describe('3. Request Validation & Input Hygiene', () => {
    it('rejects empty message on POST /api/ai/chat with 422', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(token))
        .send({ message: '   ' })
      assert.equal(res.status, 422)
    })

    it('rejects empty query on POST /api/ai/search with 422', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: '' })
      assert.equal(res.status, 422)
    })

    it('rejects short resume text (< 20 chars) on POST /api/ai/resume/analyze with 422', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/resume/analyze')
        .set(asAuth(token))
        .send({ resumeText: 'Too short' })
      assert.equal(res.status, 422)
    })

    it('rejects missing targetRole on POST /api/ai/career/analyze with 422', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/career/analyze')
        .set(asAuth(token))
        .send({})
      assert.equal(res.status, 422)
    })
  })

  describe('4. AI Assistant Endpoint (/api/ai/chat)', () => {
    it('successfully processes chat message and returns text and suggested actions', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(token))
        .send({
          message: 'How do I prepare for a Full Stack Developer interview?',
          history: [],
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(typeof res.body.data.text === 'string')
      assert.ok(res.body.data.text.length > 0)
      assert.ok(Array.isArray(res.body.data.suggestedActions))
    })
  })

  describe('5. Semantic Search Endpoint (/api/ai/search)', () => {
    it('performs semantic vector search across entity types', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({
          query: 'Machine Learning specialist at Google',
          type: 'ALL',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.query, 'Machine Learning specialist at Google')
      assert.ok(Array.isArray(res.body.data.results))
      assert.equal(typeof res.body.data.total, 'number')
    })
  })

  describe('6. Resume Analysis Endpoint (/api/ai/resume/analyze)', () => {
    it('performs structured ATS scan and returns standardized scorecard', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const sampleResume = `
        Jane Student - Software Engineer
        Skills: JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, Git.
        Experience:
        Software Engineer Intern at Acme Corp (2023 - Present)
        - Developed responsive web applications using React and Tailwind CSS.
        - Optimized database queries in PostgreSQL, improving response time by 35%.
        Education:
        B.Tech in Information Technology, Vidyalankar Institute of Technology (2020 - 2024).
      `

      const res = await request(app)
        .post('/api/ai/resume/analyze')
        .set(asAuth(token))
        .send({
          resumeText: sampleResume,
          targetRole: 'Full Stack Engineer',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      const data = res.body.data
      assert.equal(typeof data.score, 'number')
      assert.ok(Array.isArray(data.detectedSkills))
      assert.ok(Array.isArray(data.recommendedSkills))
      assert.ok(Array.isArray(data.formatting))
      assert.ok(Array.isArray(data.improvements))
      assert.ok(Array.isArray(data.strengths))
      assert.equal(typeof data.summary, 'string')
    })
  })

  describe('7. Career Readiness Endpoint (/api/ai/career/analyze)', () => {
    it('performs structured career gap analysis and returns milestones', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const res = await request(app)
        .post('/api/ai/career/analyze')
        .set(asAuth(token))
        .send({
          targetRole: 'Cloud DevOps Architect',
          currentSkills: ['Linux', 'Docker', 'Python'],
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      const data = res.body.data
      assert.equal(data.targetRole, 'Cloud DevOps Architect')
      assert.equal(typeof data.readinessScore, 'number')
      assert.ok(Array.isArray(data.skillMatches))
      assert.ok(Array.isArray(data.missingSkills))
      assert.ok(Array.isArray(data.recommendedActions))
      assert.ok(Array.isArray(data.recommendedMentors))
    })
  })

  describe('8. AI Career & Networking Assistant (Deep Grounding & Retrieval Suite)', () => {
    it('rejects oversized message (> 3000 chars) with 422', async () => {
      const user = await createStudentUser()
      const token = await loginAs(user)

      const hugeMessage = 'a'.repeat(3001)
      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(token))
        .send({ message: hugeMessage })

      assert.equal(res.status, 422)
    })

    it('grounds alumni recommendations in actual PostgreSQL records', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      const alumni = await createAlumniUser({
        firstName: 'Pooja',
        lastName: 'Iyer',
        company: 'Atlassian',
        position: 'Staff Frontend Engineer',
        skills: ['React', 'TypeScript'],
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({
          message: 'Find alumni who work with React',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data.recommendations.people))
      assert.ok(res.body.data.recommendations.people.length > 0)
      const match = res.body.data.recommendations.people.find((p) => p.id === alumni.id)
      assert.ok(match, 'Alumni record from database was not found in recommendations')
      assert.equal(match.name, 'Pooja Iyer')
      assert.equal(match.currentCompany, 'Atlassian')
    })

    it('grounds mentor recommendations in actual available mentors and excludes unavailable mentors', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      const mentorAvailable = await createAlumniUser({
        firstName: 'Aarav',
        lastName: 'Mehta',
        company: 'Microsoft',
        position: 'Principal Architect',
        isOpenToMentor: true,
      })

      const mentorUnavailable = await createAlumniUser({
        firstName: 'Busy',
        lastName: 'Executive',
        company: 'Meta',
        position: 'Director',
        isOpenToMentor: false,
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({
          message: 'Who would be a good mentor for software architecture?',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data.recommendations.mentors))
      const availableMatch = res.body.data.recommendations.mentors.find((m) => m.id === mentorAvailable.id)
      assert.ok(availableMatch, 'Available mentor was not recommended')
      const unavailableMatch = res.body.data.recommendations.mentors.find((m) => m.id === mentorUnavailable.id)
      assert.equal(unavailableMatch, undefined, 'Unavailable mentor must not be recommended')
    })

    it('grounds job recommendations in actual active PostgreSQL job postings', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      const job = await createJobPosting({
        title: 'Senior Backend Engineer',
        companyName: 'Stripe Payments',
        description: 'PostgreSQL distributed database developer.',
        status: 'published',
      })

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({
          message: 'Which backend jobs match my profile?',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data.recommendations.jobs))
      const jobMatch = res.body.data.recommendations.jobs.find((j) => j.id === job.id)
      assert.ok(jobMatch, 'Database job posting was not found in recommendations')
      assert.equal(jobMatch.companyName, 'Stripe Payments')
    })

    it('responds honestly when no matching records exist in database', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      // In an empty jobs table, asking for non-existent company
      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({
          message: 'Find jobs at NonExistentCompanyXYZ',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.data.recommendations.jobs.length, 0)
    })

    it('receives conversation history and maintains multi-turn context', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      const history = [
        { role: 'user', text: 'I am aiming to become a backend engineer' },
        { role: 'assistant', text: 'I recommend mastering Node.js and SQL schema design.' },
      ]

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({
          message: 'What skills should I learn next for backend development?',
          history,
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(res.body.data.text.length > 0)
    })

    it('does not leak private passwords or tokens in recommendations', async () => {
      const student = await createStudentUser()
      const studentToken = await loginAs(student)

      await createAlumniUser({ firstName: 'Private', lastName: 'Check' })

      const res = await request(app)
        .post('/api/ai/chat')
        .set(asAuth(studentToken))
        .send({ message: 'Find alumni to connect with' })

      assert.equal(res.status, 200)
      for (const p of res.body.data.recommendations.people) {
        assert.equal(p.password_hash, undefined)
        assert.equal(p.password, undefined)
        assert.equal(p.token, undefined)
      }
    })
  })

  describe('9. AI Semantic Search & Intelligent Discovery Suite', () => {
    it('rejects oversized search query (> 500 chars) with 422', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const hugeQuery = 'q'.repeat(501)
      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: hugeQuery })

      assert.equal(res.status, 422)
    })

    it('rejects invalid entity type with 422', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'Machine Learning', type: 'INVALID_TYPE' })

      assert.equal(res.status, 422)
    })

    it('rejects invalid limit (< 1 or > 50) with 422', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const res1 = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'React', limit: 0 })
      assert.equal(res1.status, 422)

      const res2 = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'React', limit: 100 })
      assert.equal(res2.status, 422)
    })

    it('performs semantic search returning real PostgreSQL alumni with relevance score', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const alum = await createAlumniUser({
        firstName: 'Ananya',
        lastName: 'Sharma',
        company: 'Nvidia',
        position: 'AI Research Scientist',
        skills: ['Artificial Intelligence', 'PyTorch', 'Computer Vision'],
      })

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({
          query: 'Find alumni who work in artificial intelligence',
          type: 'PEOPLE',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data.results))
      assert.ok(res.body.data.results.length > 0)
      const found = res.body.data.results.find((r) => r.id === alum.id)
      assert.ok(found, 'Alumni was not found in semantic search results')
      assert.equal(found.entityType, 'PEOPLE')
      assert.equal(found.title, 'Ananya Sharma')
      assert.equal(found.company, 'Nvidia')
      assert.equal(typeof found.matchScore, 'number')
      assert.ok(found.matchScore > 0)
      assert.ok(found.relevance?.label)
      assert.ok(found.matchReason)
      assert.ok(Array.isArray(found.actions))
    })

    it('performs semantic search returning real active PostgreSQL jobs', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const job = await createJobPosting({
        title: 'Backend Systems Engineer',
        companyName: 'Datadog',
        description: 'Design distributed storage microservices with Node.js and PostgreSQL.',
        status: 'published',
      })

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({
          query: 'Backend engineering jobs for someone with Node.js experience',
          type: 'JOBS',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      const found = res.body.data.results.find((r) => r.id === job.id)
      assert.ok(found, 'Job was not found in semantic search results')
      assert.equal(found.entityType, 'JOBS')
      assert.equal(found.title, 'Backend Systems Engineer')
      assert.equal(found.company, 'Datadog')
      assert.ok(found.relevance?.label)
    })

    it('performs semantic search returning real PostgreSQL events', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const event = await createEventRecord({
        title: 'Mumbai Developer AI Summit',
        description: 'Annual gathering for software developers in Mumbai focusing on generative AI.',
        city: 'Mumbai',
        status: 'published',
      })

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({
          query: 'Events for software developers in Mumbai',
          type: 'EVENTS',
        })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      const found = res.body.data.results.find((r) => r.id === event.id)
      assert.ok(found, 'Event was not found in semantic search results')
      assert.equal(found.entityType, 'EVENTS')
      assert.equal(found.title, 'Mumbai Developer AI Summit')
    })

    it('strictly filters by entity type (PEOPLE does not return jobs or events)', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      await createAlumniUser({ firstName: 'Cloud', lastName: 'Dev', position: 'DevOps' })
      await createJobPosting({ title: 'DevOps Specialist', companyName: 'CloudCorp' })
      await createEventRecord({ title: 'DevOps Conference', city: 'Mumbai' })

      const resPeople = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'DevOps', type: 'PEOPLE' })
      assert.equal(resPeople.status, 200)
      for (const item of resPeople.body.data.results) {
        assert.equal(item.entityType, 'PEOPLE')
      }

      const resJobs = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'DevOps', type: 'JOBS' })
      assert.equal(resJobs.status, 200)
      for (const item of resJobs.body.data.results) {
        assert.equal(item.entityType, 'JOBS')
      }

      const resEvents = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'DevOps', type: 'EVENTS' })
      assert.equal(resEvents.status, 200)
      for (const item of resEvents.body.data.results) {
        assert.equal(item.entityType, 'EVENTS')
      }
    })

    it('respects privacy and does not return hidden or suspended profiles', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      // Hidden profile
      const hiddenAlum = await createAlumniUser({ firstName: 'Secret', lastName: 'Agent' })
      await query(
        `INSERT INTO privacy_settings (user_id, show_profile_in_directory)
         VALUES ($1, FALSE)
         ON CONFLICT (user_id) DO UPDATE SET show_profile_in_directory = FALSE`,
        [hiddenAlum.id]
      )

      // Suspended user
      const suspendedAlum = await createAlumniUser({ firstName: 'Bad', lastName: 'Actor' })
      await query(`UPDATE users SET is_suspended = TRUE WHERE id = $1`, [suspendedAlum.id])

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'Agent Actor', type: 'PEOPLE' })

      assert.equal(res.status, 200)
      const foundHidden = res.body.data.results.find((r) => r.id === hiddenAlum.id)
      const foundSuspended = res.body.data.results.find((r) => r.id === suspendedAlum.id)
      assert.equal(foundHidden, undefined, 'Hidden profile must not be returned in semantic search')
      assert.equal(foundSuspended, undefined, 'Suspended user must not be returned in semantic search')
    })

    it('never leaks private authentication fields (password_hash, tokens)', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      await createAlumniUser({ firstName: 'Secure', lastName: 'Alum' })

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'Secure Alum', type: 'PEOPLE' })

      assert.equal(res.status, 200)
      for (const item of res.body.data.results) {
        assert.equal(item.password_hash, undefined)
        assert.equal(item.password, undefined)
        assert.equal(item.token, undefined)
        assert.equal(item.refreshToken, undefined)
      }
    })

    it('ranks semantically relevant entities higher than unrelated entities', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const relevant = await createAlumniUser({
        firstName: 'Elena',
        lastName: 'Rostova',
        company: 'DeepMind',
        position: 'Machine Learning Research Engineer',
        skills: ['Machine Learning', 'TensorFlow', 'Neural Networks'],
      })

      const unrelated = await createAlumniUser({
        firstName: 'Bob',
        lastName: 'Baker',
        company: 'Bakery Co',
        position: 'Pastry Chef',
        skills: ['Baking', 'Culinary Arts'],
      })

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'Deep learning and neural networks research', type: 'PEOPLE' })

      assert.equal(res.status, 200)
      const results = res.body.data.results
      const relIndex = results.findIndex((r) => r.id === relevant.id)
      const unrelIndex = results.findIndex((r) => r.id === unrelated.id)

      assert.ok(relIndex !== -1, 'Relevant candidate was found')
      if (unrelIndex !== -1) {
        assert.ok(relIndex < unrelIndex, 'Relevant candidate must rank higher than unrelated candidate')
      }
    })

    it('handles empty matches gracefully without throwing', async () => {
      const student = await createStudentUser()
      const token = await loginAs(student)

      const res = await request(app)
        .post('/api/ai/search')
        .set(asAuth(token))
        .send({ query: 'ZzzzNonExistentQuery1234567890Xyz', type: 'ALL' })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.ok(Array.isArray(res.body.data.results))
    })
  })
})
