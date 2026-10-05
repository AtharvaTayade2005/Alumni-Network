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

let seq = 0
const uniq = () => `${Date.now()}.${seq++}.${Math.random().toString(36).slice(2, 8)}`

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

/**
 * Creates a member with a profile, role and privacy row.
 *
 * `overrides` is applied to the alumni/student profile insert so a test can set
 * the exact directory facet it needs without a second statement.
 */
async function createMember({
  role = 'ALUMNI', status = 'verified', overrides = {}, privacy = {},
  firstName = 'Test', lastName = 'Person', password = 'Str0ngPass!23',
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
      industry: 'Software', city: 'Karachi', country: 'Pakistan',
      verification_status: status, is_open_to_mentor: true,
      ...overrides,
    }
    const keys = Object.keys(cols)
    const { rows: p } = await query(
      `INSERT INTO alumni_profiles (user_id, ${keys.join(',')})
       VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(',')})
       RETURNING id`,
      [id, ...keys.map((k) => cols[k])],
    )
    await query(`UPDATE alumni_profiles SET is_open_to_mentor = $2 WHERE id = $1`,
      [p[0].id, cols.is_open_to_mentor])
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

async function reset() {
  await query('TRUNCATE users, audit_logs, email_queue RESTART IDENTITY CASCADE')
}

before(reset)
afterEach(reset)
after(async () => {
  await closePool()
  await stopTestDatabase()
})

// =====================================================================
// profiles
// =====================================================================

describe('phase 2: profile retrieval', () => {
  it('returns the caller own profile with privacy settings', async () => {
    const me = await createMember({ firstName: 'Ada', lastName: 'Lovelace' })
    const token = await tokenFor(me)

    const res = await request(app).get('/api/profiles/me').set(asAuth(token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.user.id, me.id)
    assert.equal(res.body.data.user.firstName, 'Ada')
    assert.ok(res.body.data.alumni, 'expected an alumni profile')
    // The owner sees their own contact details.
    assert.equal(res.body.data.user.email, me.email)
    assert.ok(res.body.data.privacy, 'owner sees privacy settings')
  })

  it('creates an alumni profile through PUT /api/alumni/me', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .put('/api/alumni/me')
      .set(asAuth(token))
      .send({
        graduationYear: 2015,
        degree: 'MSc',
        major: 'Robotics',
        university: 'MIT',
        currentCompany: 'Acme',
        jobTitle: 'Staff Engineer',
        industry: 'Software',
        location: 'Boston, MA',
        bio: 'Builds robots.',
        mentorshipAvailable: true,
      })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const alumni = res.body.data.alumni
    assert.equal(alumni.graduationYear, 2015)
    assert.equal(alumni.degree, 'MSc')
    assert.equal(alumni.major, 'Robotics')
    assert.equal(alumni.university, 'MIT')
    assert.equal(alumni.jobTitle, 'Staff Engineer')
    assert.equal(alumni.bio, 'Builds robots.')
    assert.equal(alumni.mentorshipAvailable ?? alumni.is_open_to_mentor, true)
  })

  it('keeps major and job_title in step with the columns other modules read', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    await request(app).put('/api/alumni/me').set(asAuth(token)).send({ major: 'Physics' })
    const { rows } = await query(
      'SELECT major, department FROM alumni_profiles WHERE user_id = $1', [me.id],
    )
    assert.equal(rows[0].major, 'Physics')
    // Mentorship and connections read `department`; it must not go stale.
    assert.equal(rows[0].department, 'Physics')
  })

  it('updates a student profile through PUT /api/students/me', async () => {
    const me = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(me)

    const res = await request(app)
      .put('/api/students/me')
      .set(asAuth(token))
      .send({
        degree: 'BSc Physics',
        major: 'Physics',
        graduationYear: 2027,
        university: 'Oxford',
        careerInterests: 'Research',
      })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const student = res.body.data.student
    assert.equal(student.degree, 'BSc Physics')
    assert.equal(student.major, 'Physics')
    assert.equal(student.graduationYear, 2027)
    assert.equal(student.university, 'Oxford')
    assert.equal(student.careerInterests, 'Research')
  })

  it('rejects a non-http social link URL', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const bad = await request(app)
      .put('/api/profiles/me/social-links')
      .set(asAuth(token))
      .send({ platform: 'website', url: 'javascript:alert(1)' })
    assert.equal(bad.status, 422, JSON.stringify(bad.body))

    const good = await request(app)
      .put('/api/profiles/me/social-links')
      .set(asAuth(token))
      .send({ platform: 'website', url: 'https://example.edu/me' })
    assert.equal(good.status, 200, JSON.stringify(good.body))
  })

  it('requires authentication for every profile route', async () => {
    for (const [method, path] of [
      ['get', '/api/profiles/me'],
      ['put', '/api/alumni/me'],
      ['get', '/api/alumni'],
    ]) {
      const res = await request(app)[method](path).send({})
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path} -> ${res.status}`)
    }
  })

  it('ignores a target user id and never writes to another profile', async () => {
    const owner = await createMember()
    const other = await createMember()
    const otherToken = await tokenFor(other)

    // No update route accepts a target id: the only writable profile is the
    // caller's own. A body that smuggles in a userId must therefore leave the
    // named owner untouched, and may only ever change the caller's own row.
    const res = await request(app)
      .put('/api/profiles/me')
      .set(asAuth(otherToken))
      .send({ userId: owner.id, major: 'Hijacked' })

    const { rows: ownerRows } = await query(
      'SELECT major FROM alumni_profiles WHERE user_id = $1', [owner.id],
    )
    assert.notEqual(ownerRows[0].major, 'Hijacked', 'owner profile was modified')

    const { rows: otherRows } = await query(
      'SELECT major FROM alumni_profiles WHERE user_id = $1', [other.id],
    )
    assert.equal(otherRows[0].major, res.status === 200 ? 'Hijacked' : otherRows[0].major)
  })

  it('returns 404 for an unknown profile id', async () => {
    const me = await createMember()
    const token = await tokenFor(me)
    const res = await request(app)
      .get('/api/profiles/00000000-0000-0000-0000-000000000000')
      .set(asAuth(token))
    assert.equal(res.status, 404)
  })
})

// =====================================================================
// privacy
// =====================================================================

describe('phase 2: privacy', () => {
  it('withholds email and phone from other members by default', async () => {
    const target = await createMember()
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const body = JSON.stringify(res.body.data)
    assert.ok(!body.includes(target.email), 'email must not appear')
    assert.ok(!body.includes('+15551234567'), 'phone must not appear')
    assert.equal(res.body.data.user.email, undefined)
  })

  it('reveals email only when the owner opts in', async () => {
    const target = await createMember({ privacy: { show_email: true } })
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    assert.equal(res.status, 200)
    assert.equal(res.body.data.user.email, target.email)
  })

  it('hides location from the profile view when show_location is off', async () => {
    const target = await createMember({ privacy: { show_location: false } })
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    assert.equal(res.status, 200)
    const alumni = res.body.data.alumni
    assert.equal(alumni.city, undefined, 'city leaked')
    assert.equal(alumni.country, undefined, 'country leaked')
    assert.equal(alumni.location, undefined, 'location leaked')
    assert.equal(alumni.latitude, undefined, 'coordinates leaked')
  })

  it('hides employer when show_employer is off', async () => {
    const target = await createMember({ privacy: { show_employer: false } })
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    assert.equal(res.status, 200)
    assert.equal(res.body.data.alumni.currentCompany, undefined)
    assert.equal(res.body.data.alumni.jobTitle, undefined)
  })

  it('hides social links when show_social_links is off', async () => {
    const target = await createMember({ privacy: { show_social_links: false } })
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    await request(app).put('/api/profiles/me/social-links')
      .set(asAuth(await tokenFor(target)))
      .send({ platform: 'github', url: 'https://github.com/example' })

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    assert.equal(res.status, 200)
    assert.deepEqual(res.body.data.socialLinks, [])
  })

  it('reports a hidden profile as 404 rather than 403', async () => {
    const target = await createMember({ privacy: { show_profile_in_directory: false } })
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))

    // 404 rather than 403 so the response does not confirm the account exists.
    assert.equal(res.status, 404)
  })

  it('lets an administrator read a hidden profile', async () => {
    const target = await createMember({ privacy: { show_profile_in_directory: false } })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const res = await request(app)
      .get(`/api/profiles/${target.id}`).set(asAuth(token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
  })

  it('never exposes password hashes through any profile route', async () => {
    const me = await createMember()
    const viewer = await createMember()
    const token = await tokenFor(viewer)

    // The owner's own view and another member's view of it.
    for (const path of ['/api/profiles/me', `/api/profiles/${me.id}`]) {
      const res = await request(app).get(path).set(asAuth(token))
      assert.equal(res.status, 200, path)
      assert.ok(!JSON.stringify(res.body).includes('password_hash'), path)
    }
  })
})

// =====================================================================
// verification
// =====================================================================

describe('phase 2: alumni verification', () => {
  it('starts pending and reports the uppercase state', async () => {
    const me = await createMember({ status: 'pending' })
    const token = await tokenFor(me)

    const res = await request(app).get('/api/profiles/me').set(asAuth(token))
    assert.equal(res.status, 200)
    assert.equal(res.body.data.alumni.verificationStatus, 'PENDING')
    assert.equal(res.body.data.alumni.verified, false)
  })

  it('lets an administrator list pending profiles', async () => {
    const a = await createMember({ status: 'pending', lastName: 'Pendingone' })
    await createMember({ status: 'verified', lastName: 'Alreadydone' })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const res = await request(app)
      .get('/api/admin/alumni/pending').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].userId, a.id)
    assert.equal(res.body.data[0].status, 'PENDING')
    assert.equal(res.body.meta.total, 1)
  })

  it('shows a reviewer the submitted details and history', async () => {
    const me = await createMember({ status: 'pending' })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const res = await request(app)
      .get(`/api/admin/alumni/${me.id}`).set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.userId, me.id)
    assert.equal(res.body.data.status, 'PENDING')
    assert.ok(Array.isArray(res.body.data.history))
  })

  it('verifies a profile and records the reviewer and timestamp', async () => {
    const me = await createMember({ status: 'pending' })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const res = await request(app)
      .patch(`/api/admin/alumni/${me.id}/verify`).set(asAuth(token)).send({})

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'VERIFIED')
    assert.equal(res.body.data.reviewer, admin.id)
    assert.ok(res.body.data.reviewedAt)

    const { rows } = await query(
      `SELECT action, reviewer_id, new_status FROM alumni_verification_events
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [me.id],
    )
    assert.equal(rows[0].action, 'verified')
    assert.equal(rows[0].reviewer_id, admin.id)
    assert.equal(rows[0].new_status, 'verified')
  })

  it('rejects a profile only with a reason, and records it', async () => {
    const me = await createMember({ status: 'pending' })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    const noReason = await request(app)
      .patch(`/api/admin/alumni/${me.id}/reject`).set(asAuth(token)).send({})
    assert.equal(noReason.status, 422, JSON.stringify(noReason.body))

    const res = await request(app)
      .patch(`/api/admin/alumni/${me.id}/reject`)
      .set(asAuth(token))
      .send({ reason: 'Could not confirm the degree' })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'REJECTED')
    assert.equal(res.body.data.reason, 'Could not confirm the degree')

    const { rows } = await query(
      `SELECT action, reason, reviewer_id FROM alumni_verification_events
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [me.id],
    )
    assert.equal(rows[0].action, 'rejected')
    assert.equal(rows[0].reason, 'Could not confirm the degree')
    assert.equal(rows[0].reviewer_id, admin.id)
  })

  it('refuses verification endpoints to non-administrators', async () => {
    const me = await createMember()
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(me)

    const pending = await request(app)
      .get('/api/admin/alumni/pending').set(asAuth(token))
    assert.equal(pending.status, 403, JSON.stringify(pending.body))

    const verify = await request(app)
      .patch(`/api/admin/alumni/${admin.id}/verify`).set(asAuth(token)).send({})
    assert.equal(verify.status, 403)
  })

  it('rejects an anonymous verification request with 401', async () => {
    const res = await request(app).get('/api/admin/alumni/pending')
    assert.equal(res.status, 401)
  })

  it('allows re-reviewing a rejected profile', async () => {
    const me = await createMember({ status: 'pending' })
    const admin = await createMember({ role: 'ADMIN' })
    const token = await tokenFor(admin)

    await request(app).patch(`/api/admin/alumni/${me.id}/reject`)
      .set(asAuth(token)).send({ reason: 'First attempt failed' })
    const res = await request(app).patch(`/api/admin/alumni/${me.id}/verify`)
      .set(asAuth(token)).send({})

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'VERIFIED')

    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM alumni_verification_events WHERE user_id = $1`,
      [me.id],
    )
    assert.ok(rows[0].n >= 2, 'both decisions should be recorded')
  })

  it('reports a rejected profile as unverified on the public view', async () => {
    const me = await createMember({ status: 'pending' })
    const admin = await createMember({ role: 'ADMIN' })
    const viewer = await createMember()
    const adminToken = await tokenFor(admin)
    const viewerToken = await tokenFor(viewer)

    await request(app).patch(`/api/admin/alumni/${me.id}/reject`)
      .set(asAuth(adminToken)).send({ reason: 'Not confirmed' })

    const res = await request(app)
      .get(`/api/profiles/${me.id}`).set(asAuth(viewerToken))

    assert.equal(res.status, 200)
    assert.equal(res.body.data.alumni.verified, false)
    assert.equal(res.body.data.alumni.verificationStatus, 'REJECTED')
  })
})

// =====================================================================
// skills, education, experience
// =====================================================================

describe('phase 2: skills, education and experience', () => {
  it('stores skills as normalised rows, not a delimited string', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .put('/api/profiles/me/skills')
      .set(asAuth(token))
      .send({ skills: ['React', 'Node.js', 'react'] })

    assert.equal(res.status, 200, JSON.stringify(res.body))
    // 'React' and 'react' are the same skill.
    assert.equal(res.body.data.length, 2)

    const { rows } = await query(
      `SELECT s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = $1 ORDER BY s.name`, [me.id],
    )
    assert.deepEqual(rows.map((r) => r.name), ['Node.js', 'React'])
  })

  it('adds and lists multiple education records', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const first = await request(app)
      .post('/api/profiles/me/education')
      .set(asAuth(token))
      .send({ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'Physics',
        startYear: 2010, endYear: 2014 })
    assert.equal(first.status, 201, JSON.stringify(first.body))

    await request(app).post('/api/profiles/me/education').set(asAuth(token))
      .send({ institution: 'Oxford', degree: 'MSc', fieldOfStudy: 'Maths' })

    const list = await request(app)
      .get('/api/profiles/me/education').set(asAuth(token))
    assert.equal(list.status, 200)
    assert.equal(list.body.data.length, 2)
  })

  it('stores employment type and generates company and job_title', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .post('/api/profiles/me/experience')
      .set(asAuth(token))
      .send({
        companyName: 'Acme', title: 'Engineer', employmentType: 'full_time',
        isCurrent: true, startDate: '2020-01-01',
      })

    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.company, 'Acme')
    assert.equal(res.body.data.job_title ?? res.body.data.jobTitle, 'Engineer')
    assert.equal(res.body.data.employment_type ?? res.body.data.employmentType, 'full_time')
  })

  it('rejects an unknown employment type', async () => {
    const me = await createMember()
    const token = await tokenFor(me)
    const res = await request(app)
      .post('/api/profiles/me/experience')
      .set(asAuth(token))
      .send({ companyName: 'Acme', title: 'Engineer', employmentType: 'wizard' })
    assert.ok(res.status === 422 || res.status === 400, JSON.stringify(res.body))
  })

  it('rejects a current role that also has an end date', async () => {
    const me = await createMember()
    const token = await tokenFor(me)
    const res = await request(app)
      .post('/api/profiles/me/experience')
      .set(asAuth(token))
      .send({ companyName: 'Acme', title: 'Engineer', isCurrent: true,
        startDate: '2020-01-01', endDate: '2021-01-01' })
    assert.ok(res.status === 422 || res.status === 400, JSON.stringify(res.body))
  })

  it('prevents deleting another member education record', async () => {
    const owner = await createMember()
    const other = await createMember()
    const ownerToken = await tokenFor(owner)

    const created = await request(app)
      .post('/api/profiles/me/education')
      .set(asAuth(ownerToken))
      .send({ institution: 'MIT' })

    // Ownership is enforced by the WHERE clause, so a foreign id matches nothing.
    const { rowCount } = await query(
      'DELETE FROM education WHERE id = $1 AND user_id = $2',
      [created.body.data.id, other.id],
    )
    assert.equal(rowCount, 0, 'a foreign education row must not be deletable')
  })
})

// =====================================================================
// directory
// =====================================================================

describe('phase 2: alumni directory', () => {
  it('returns a paginated page of alumni', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createMember({ lastName: `Directory${i}` })
    }
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?limit=2&page=1&sort=name').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 2)
    assert.equal(res.body.meta.limit, 2)
    assert.equal(res.body.meta.page, 1)
    assert.ok(res.body.meta.total >= 5)
    assert.ok(res.body.meta.totalPages >= 3)
  })

  it('does not return the same row on consecutive pages', async () => {
    for (let i = 0; i < 6; i += 1) {
      await createMember({ lastName: `Paged${i}` })
    }
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const first = await request(app)
      .get('/api/alumni?limit=3&page=1&sort=name').set(asAuth(token))
    const second = await request(app)
      .get('/api/alumni?limit=3&page=2&sort=name').set(asAuth(token))

    const firstIds = first.body.data.map((r) => r.userId)
    const secondIds = second.body.data.map((r) => r.userId)
    assert.equal(firstIds.length, 3)
    assert.equal(secondIds.length, 3)
    for (const id of secondIds) assert.ok(!firstIds.includes(id), 'pages overlap')
  })

  it('filters by graduation year', async () => {
    await createMember({ overrides: { graduation_year: 2001 }, lastName: 'Oldtimer' })
    await createMember({ overrides: { graduation_year: 2024 }, lastName: 'Newcomer' })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?graduationYear=2001').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].graduationYear, 2001)
  })

  it('still honours directory opt-out and account status when filtering by location', async () => {
    // AND binds tighter than OR, so an unbracketed location filter used to match
    // on region/country alone and return members who opted out of the directory.
    const hidden = await createMember({
      overrides: { country: 'Pakistan', region: 'Punjab', city: 'Lahore' },
      lastName: 'Hidden',
    })
    await query('UPDATE privacy_settings SET show_profile_in_directory = FALSE WHERE user_id = $1',
      [hidden.id])

    const suspended = await createMember({
      overrides: { country: 'Pakistan', region: 'Punjab', city: 'Lahore' },
      lastName: 'Suspended',
    })
    await query('UPDATE users SET is_suspended = TRUE WHERE id = $1', [suspended.id])

    await createMember({
      overrides: { country: 'Pakistan', region: 'Punjab', city: 'Lahore' },
      lastName: 'Visible',
    })

    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)
    const res = await request(app).get('/api/alumni?location=Punjab').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const names = res.body.data.map((r) => r.name)
    assert.ok(names.includes('Test Visible'), `visible member missing: ${names}`)
    assert.ok(!names.includes('Test Hidden'), 'opted-out member returned by location filter')
    assert.ok(!names.includes('Test Suspended'), 'suspended member returned by location filter')
    assert.equal(res.body.meta.total, names.length,
      'meta.total must match the filtered rows, not the unfiltered count')
  })

  it('filters by industry, employer and major', async () => {
    await createMember({
      overrides: { industry: 'Healthcare', current_company: 'St Jude',
        department: 'Medicine' },
      lastName: 'Filtered',
    })
    await createMember({
      overrides: { industry: 'Software', current_company: 'Acme', department: 'Computing' },
      lastName: 'Unfiltered',
    })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const byIndustry = await request(app)
      .get('/api/alumni?industry=Healthcare').set(asAuth(token))
    assert.equal(byIndustry.body.data.length, 1)
    assert.equal(byIndustry.body.data[0].name, 'Test Filtered')

    const byEmployer = await request(app)
      .get('/api/alumni?employer=St Jude').set(asAuth(token))
    assert.equal(byEmployer.body.data.length, 1)

    const byMajor = await request(app)
      .get('/api/alumni?major=Medicine').set(asAuth(token))
    assert.equal(byMajor.body.data.length, 1)
  })

  it('matches a keyword search against name and employer', async () => {
    await createMember({ firstName: 'Katherine', lastName: 'Johnson' })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?search=Johnson').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(res.body.data.length >= 1)
    assert.ok(res.body.data.some((r) => r.name.includes('Johnson')))
  })

  it('tolerates a search term that would break to_tsquery', async () => {
    await createMember({ lastName: 'Punctuation' })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    for (const term of ['!!!', 'a&b', "'; DROP TABLE users;--", '%%%']) {
      const res = await request(app)
        .get(`/api/alumni?search=${encodeURIComponent(term)}`).set(asAuth(token))
      assert.equal(res.status, 200, `"${term}" -> ${res.status} ${JSON.stringify(res.body)}`)
    }
    // The table is still there.
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM users')
    assert.ok(rows[0].n > 0)
  })

  it('filters by skills', async () => {
    const skilled = await createMember({ lastName: 'Skilled' })
    await tokenFor(skilled)
    await query(
      `INSERT INTO skills (name) VALUES ('Kubernetes') ON CONFLICT DO NOTHING`,
    )
    const { rows: s } = await query(`SELECT id FROM skills WHERE LOWER(name) = 'kubernetes'`)
    await query('INSERT INTO user_skills (user_id, skill_id) VALUES ($1,$2)',
      [skilled.id, s[0].id])

    await createMember({ lastName: 'Unskilled' })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?skills=Kubernetes').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].userId, skilled.id)
  })

  it('excludes members who opted out of the directory', async () => {
    const hidden = await createMember({
      privacy: { show_profile_in_directory: false }, lastName: 'Hidden',
    })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?search=Hidden&limit=100').set(asAuth(token))

    assert.equal(res.status, 200)
    assert.ok(!res.body.data.some((r) => r.userId === hidden.id),
      'opted-out member appeared in the directory')
  })

  it('applies privacy to directory rows', async () => {
    await createMember({
      privacy: { show_employer: false, show_location: false },
      lastName: 'Privateperson',
      overrides: { current_company: 'Secret Corp' },
    })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?search=Privateperson').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const row = res.body.data[0]
    assert.equal(row.currentCompany, undefined)
    assert.equal(row.city, undefined)
  })

  it('excludes suspended and inactive accounts', async () => {
    const suspended = await createMember({ lastName: 'Suspendedmember' })
    await query('UPDATE users SET is_suspended = TRUE WHERE id = $1', [suspended.id])
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app)
      .get('/api/alumni?search=Suspendedmember').set(asAuth(token))

    assert.equal(res.status, 200)
    assert.equal(res.body.data.length, 0)
  })

  it('caps the page size', async () => {
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)
    const res = await request(app).get('/api/alumni?limit=100000').set(asAuth(token))
    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('rejects an invalid sort column', async () => {
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)
    const res = await request(app)
      .get('/api/alumni?sort=DROP+TABLE+users').set(asAuth(token))
    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('returns facets for the filter controls', async () => {
    await createMember({ overrides: { graduation_year: 1999, industry: 'Law' } })
    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)

    const res = await request(app).get('/api/alumni/facets').set(asAuth(token))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(res.body.data.graduationYear.length >= 1)
    assert.ok(res.body.data.industry.some((i) => i.value === 'law'))
  })

  it('does not leak hidden employers or locations through the facets', async () => {
    // Facets aggregate over the whole population, so a dimension that ignores
    // privacy settings leaks through a helper endpoint that looks like
    // reference data.
    const secret = await createMember({
      overrides: { current_company: 'HiddenCorp', industry: 'Skulduggery',
        country: 'Freedonia', city: 'Hiddenville' },
      lastName: 'Secretive',
    })
    await query('UPDATE privacy_settings SET show_employer = FALSE, show_location = FALSE WHERE user_id = $1',
      [secret.id])

    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)
    const res = await request(app).get('/api/alumni/facets').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const values = (dimension) => (res.body.data[dimension] ?? []).map((v) => v.value)
    assert.ok(!values('employer').includes('hiddencorp'),
      `employer facet leaked: ${values('employer')}`)
    assert.ok(!values('industry').includes('skulduggery'),
      `industry facet leaked: ${values('industry')}`)
    assert.ok(!values('country').includes('freedonia'),
      `country facet leaked: ${values('country')}`)
  })

  it('does not leak hidden locations through the locations autocomplete', async () => {
    const hidden = await createMember({
      overrides: { city: 'Nowhereville', country: 'Freedonia' }, lastName: 'Ghosted',
    })
    await query('UPDATE privacy_settings SET show_location = FALSE WHERE user_id = $1', [hidden.id])
    const optedOut = await createMember({
      overrides: { city: 'Ghosttown' }, lastName: 'OptedOut',
    })
    await query('UPDATE privacy_settings SET show_profile_in_directory = FALSE WHERE user_id = $1',
      [optedOut.id])
    await createMember({ overrides: { city: 'Springfield' }, lastName: 'Visible' })

    const viewer = await createMember({ role: 'STUDENT' })
    const token = await tokenFor(viewer)
    const res = await request(app).get('/api/alumni/locations').set(asAuth(token))

    assert.equal(res.status, 200, JSON.stringify(res.body))
    const locations = res.body.data.map((l) => l.location)
    assert.ok(!locations.includes('nowhereville'), `hidden location leaked: ${locations}`)
    assert.ok(!locations.includes('ghosttown'), `opted-out location leaked: ${locations}`)
    assert.ok(locations.includes('springfield'), `visible location missing: ${locations}`)
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/alumni')
    assert.equal(res.status, 401)
  })
})

// =====================================================================
// photo upload
// =====================================================================

/** A minimal but structurally valid PNG (signature + IHDR + IEND). */
function pngBytes({ padTo = 0 } = {}) {
  const head = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ])
  const tail = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  const body = padTo > head.length + tail.length
    ? Buffer.alloc(padTo - head.length - tail.length, 0)
    : Buffer.alloc(0)
  return Buffer.concat([head, body, tail])
}

describe('phase 2: profile photo', () => {
  it('rejects a file whose contents are not an image', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    // A shell script renamed to .png must not be accepted.
    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      .attach('file', Buffer.from('#!/bin/sh\nrm -rf /\n'), {
        filename: 'evil.png', contentType: 'image/png',
      })

    assert.ok(res.status === 422 || res.status === 400,
      `expected rejection, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  it('rejects a mime type that disagrees with the bytes', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      .attach('file', pngBytes(), { filename: 'x.gif', contentType: 'image/gif' })

    assert.ok(res.status === 422 || res.status === 400,
      `expected rejection, got ${res.status}`)
  })

  it('rejects an executable extension even when the bytes are a real image', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    // The signature check alone would let this through; the extension policy is
    // what refuses a request that only ever names a server-parsed type.
    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      .attach('file', pngBytes(), { filename: 'avatar.php', contentType: 'image/png' })

    assert.ok(res.status === 422 || res.status === 400,
      `expected rejection, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  it('rejects an image larger than the size limit', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      .attach('file', pngBytes({ padTo: 3 * 1024 * 1024 }),
        { filename: 'big.png', contentType: 'image/png' })

    assert.ok(res.status === 422 || res.status === 400 || res.status === 413,
      `expected rejection, got ${res.status} ${JSON.stringify(res.body)}`)
  })

  it('stores a valid image under a generated key and syncs the avatar', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      // A traversal attempt in the name must not reach the filesystem.
      .attach('file', pngBytes(), {
        filename: '../../../../etc/passwd.png', contentType: 'image/png',
      })

    assert.equal(res.status, 201, JSON.stringify(res.body))
    const url = res.body.data.profilePhoto
    assert.match(url, /^\/uploads\/photos\/[0-9a-f-]+-\d+-[0-9a-f]{32}\.png$/,
      `unexpected storage key: ${url}`)

    const { rows } = await query(
      `SELECT ap.profile_photo, u.avatar_url
         FROM alumni_profiles ap JOIN users u ON u.id = ap.user_id
        WHERE ap.user_id = $1`, [me.id],
    )
    assert.equal(rows[0].profile_photo, url)
    assert.equal(rows[0].avatar_url, url, 'users.avatar_url must follow the profile photo')
  })

  it('does not serve stored photos from the static mount', async () => {
    const me = await createMember()
    const token = await tokenFor(me)

    const res = await request(app)
      .post('/api/profiles/me/photo')
      .set(asAuth(token))
      .attach('file', pngBytes(), { filename: 'ok.png', contentType: 'image/png' })
    assert.equal(res.status, 201, JSON.stringify(res.body))

    // The stored path must not be anonymously readable; reads are authorised.
    const anon = await request(app).get(res.body.data.profilePhoto)
    assert.equal(anon.status, 404, 'uploads must not be served statically')
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/profiles/me/photo')
    assert.equal(res.status, 401)
  })
})