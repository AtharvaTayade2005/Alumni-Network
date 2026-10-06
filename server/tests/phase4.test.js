import 'dotenv/config'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import {
  directQuery, startTestDatabase, stopTestDatabase,
} from './helpers/testDatabase.js'

process.env.NODE_ENV = 'test'
// Uploads go to a temporary directory so a test run never writes into the repository
// and never reads a file left by an earlier one. Set before anything imports config.
const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase4-uploads-'))
process.env.LOCAL_UPLOAD_DIR = uploadRoot

// Must happen before anything imports config/database.js, because the pool is built at
// module load time.
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')
const storage = await import('../src/services/storageService.js')

let seq = 0
const uniq = () => `${Date.now()}.${seq++}.${Math.floor(Math.random() * 1e6)}`

async function resetAll() {
  await query(
    `TRUNCATE users, stored_files, jobs, companies, skills, job_skills,
     saved_jobs, job_applications, audit_logs, email_queue, notifications
     RESTART IDENTITY CASCADE`,
  )
}

/**
 * Runs a statement the database is expected to refuse.
 *
 * It goes straight to the test database rather than through the pool, because a rejected
 * statement ends the socket session it arrived on and PGlite serves one session at a time.
 * Through the socket the second refused statement in a run would fail with a connection
 * reset instead of the database's own message.
 */
const refusedStatement = directQuery

async function createUser({ role = 'ALUMNI', email, password = 'Str0ngPass!23' }) {
  const passwordHash = await hashPassword(password)
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
  return { id, email, password }
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

const asAuth = (token) => ({ Authorization: `Bearer ${token}` })

/**
 * Smallest byte sequences that pass signature detection.
 *
 * A real PDF needs a cross-reference table and a real .docx a valid central directory;
 * the endpoints only ever read and hash what they were given, so the headers are
 * enough and the tests stay fast.
 */
function pdfBytes(marker = 'resume') {
  return Buffer.from(
    `%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n${marker}`,
    'latin1',
  )
}

function docxBytes() {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
    Buffer.from('word/document.xml some words about a career so far'),
    Buffer.from([0x50, 0x4b, 0x01, 0x02, 0x50, 0x00]),
    Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00]),
  ])
}

/** An .xlsx is a zip too, so it must not be accepted as a resume. */
function xlsxBytes() {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
    Buffer.from('xl/workbook.xml and a sheet of numbers'),
    Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00]),
  ])
}

const upload = (token, buffer, filename, contentType, field = 'file') =>
  request(app)
    .post('/api/files')
    .set(asAuth(token))
    .attach(field, buffer, { filename, contentType })

const longDescription = 'We are hiring a backend engineer to work on a payments platform. '
  + 'You will design APIs, own services in production and mentor junior engineers.'

/** Creates a posting and, unless told otherwise, has a moderator publish it. */
async function postJob(token, overrides = {}, { publish = true, moderatorToken } = {}) {
  const res = await request(app)
    .post('/api/jobs')
    .set(asAuth(token))
    .send({
      title: 'Backend Engineer',
      companyName: 'Northwind Labs',
      description: longDescription,
      workMode: 'onsite',
      employmentType: 'full_time',
      experienceLevel: 'mid',
      ...overrides,
    })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  if (!publish) return res.body.data
  const approved = await request(app)
    .patch(`/api/jobs/${res.body.data.id}/status`)
    .set(asAuth(moderatorToken))
    .send({ status: 'PUBLISHED' })
  assert.equal(approved.status, 200, JSON.stringify(approved.body))
  return approved.body.data
}

after(async () => {
  await closePool()
  await stopTestDatabase()
  await fs.rm(uploadRoot, { recursive: true, force: true })
})

describe('phase 4: document storage', () => {
  before(resetAll)

  it('detects document types by signature rather than by name', () => {
    assert.equal(storage.detectDocumentType(pdfBytes()), 'application/pdf')
    assert.equal(
      storage.detectDocumentType(docxBytes()),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    // A zip that is not a Word document, an OLE file, and a script named .docx.
    assert.equal(storage.detectDocumentType(xlsxBytes()), null)
    assert.equal(
      storage.detectDocumentType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])),
      'application/msword',
    )
    assert.equal(storage.detectDocumentType(Buffer.from('<?php echo 1;')), null)
    assert.equal(storage.detectDocumentType(Buffer.alloc(0)), null)
  })

  it('reduces an uploaded name to a display name', () => {
    assert.equal(storage.sanitiseDisplayName('../../etc/passwd'), 'passwd')
    assert.equal(storage.sanitiseDisplayName('C:\\Users\\me\\cv.pdf'), 'cv.pdf')
    assert.equal(storage.sanitiseDisplayName('  '), null)
    assert.equal(storage.sanitiseDisplayName('..'), null)
  })

  it('gives a document key that says nothing about who uploaded it', () => {
    const key = storage.buildDocumentKey('.pdf')
    assert.match(key, /^\d+-[0-9a-f]{48}\.pdf$/)
    assert.notEqual(key, storage.buildDocumentKey('.pdf'))
  })

  it('refuses a key that would leave its scope', () => {
    const driver = storage.getStorageDriver()
    assert.throws(() => driver.resolve('../../secrets.txt', 'documents'), /upload directory/)
    assert.throws(() => driver.resolve('a/../../b.pdf', 'documents'), /upload directory/)
    // A key with no traversal is fine, and stays inside the documents directory.
    const resolved = driver.resolve('nested/name.pdf', 'documents')
    assert.ok(resolved.startsWith(path.resolve(uploadRoot, 'documents') + path.sep))
  })

  it('stores a resume, records its metadata and streams it back', async () => {
    const user = await createUser({ email: `files.${uniq()}@example.edu` })
    const token = await loginAs(user)
    const bytes = pdfBytes()

    const res = await upload(token, bytes, 'Ada Lovelace.pdf', 'application/pdf')
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const file = res.body.data
    assert.equal(file.kind, 'resume')
    assert.equal(file.filename, 'Ada Lovelace.pdf')
    assert.equal(file.contentType, 'application/pdf')
    assert.equal(file.size, bytes.length)
    assert.equal(file.downloadPath, `/api/files/${file.id}/download`)

    // The response is metadata, not a way in: no key, no public path.
    const serialised = JSON.stringify(res.body)
    assert.ok(!serialised.includes('storageKey'), 'the storage key must not be exposed')
    assert.ok(!serialised.includes('"url"'), 'a stored document has no public url')

    const meta = await request(app)
      .get(`/api/files/${file.id}`).set(asAuth(token))
    assert.equal(meta.status, 200)
    assert.equal(meta.body.data.id, file.id)

    const download = await request(app)
      .get(`/api/files/${file.id}/download`).set(asAuth(token))
    assert.equal(download.status, 200)
    assert.equal(download.headers['content-type'], 'application/pdf')
    assert.equal(download.headers['content-length'], String(bytes.length))
    assert.equal(download.headers['x-content-type-options'], 'nosniff')
    assert.match(download.headers['content-disposition'], /^attachment; filename="/)
    assert.match(download.headers['content-disposition'], /filename\*=UTF-8''Ada%20Lovelace\.pdf/)
    assert.deepEqual(download.body, bytes)
  })

  it('names a non-ascii file in both header forms', async () => {
    const user = await createUser({ email: `utf8.${uniq()}@example.edu` })
    const token = await loginAs(user)
    const res = await upload(token, pdfBytes(), 'résumé.pdf', 'application/pdf')
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.filename, 'résumé.pdf')

    const download = await request(app)
      .get(`/api/files/${res.body.data.id}/download`).set(asAuth(token))
const disposition = download.headers['content-disposition']
    // The ASCII form exists for old clients, so it drops what it cannot carry rather
    // than emitting bytes a header cannot hold; the real name travels in filename*.
    assert.match(disposition, /filename="r_sum_\.pdf"/)
    assert.match(disposition, /filename\*=UTF-8''r%C3%A9sum%C3%A9\.pdf/)
  })

  it('accepts a docx and refuses a zip that is a spreadsheet', async () => {
    const user = await createUser({ email: `docx.${uniq()}@example.edu` })
    const token = await loginAs(user)
    const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    const good = await upload(token, docxBytes(), 'cv.docx', type)
    assert.equal(good.status, 201, JSON.stringify(good.body))

    const bad = await upload(token, xlsxBytes(), 'salary.docx', type)
    assert.equal(bad.status, 422, JSON.stringify(bad.body))
  })

  it('refuses bytes that are not a document at all', async () => {
    const user = await createUser({ email: `script.${uniq()}@example.edu` })
    const token = await loginAs(user)

    // A script with a PDF name and a PDF content type: the name and the claim are both
    // checked, and so are the bytes.
    const spoofed = await upload(token, Buffer.from('<?php system($_GET["c"]); ?>'),
      'cv.pdf', 'application/pdf')
    assert.equal(spoofed.status, 422, JSON.stringify(spoofed.body))

    const png = await upload(token, Buffer.alloc(64), 'cv.pdf', 'application/pdf')
    assert.equal(png.status, 422, JSON.stringify(png.body))

    const extension = await upload(token, pdfBytes(), 'cv.exe', 'application/pdf')
    assert.equal(extension.status, 422, JSON.stringify(extension.body))
  })

  it('refuses an anonymous upload', async () => {
    const res = await request(app)
      .post('/api/files')
      .attach('file', pdfBytes(), { filename: 'cv.pdf', contentType: 'application/pdf' })
    assert.equal(res.status, 401)
  })
})

describe('phase 4: who may read a stored file', () => {
  before(resetAll)

  let owner, ownerToken, poster, posterToken, admin, adminToken, other, otherToken
  let moderatorToken
  let jobId, fileId

  before(async () => {
    owner = await createUser({ email: `owner.${uniq()}@example.edu` })
    ownerToken = await loginAs(owner)
    poster = await createUser({ email: `poster.${uniq()}@example.edu` })
    posterToken = await loginAs(poster)
    const moderator = await createUser({ role: 'MODERATOR', email: `mod.${uniq()}@example.edu` })
    moderatorToken = await loginAs(moderator)
    // Administrators are a separate role from moderators: reading and deleting any file
    // is an administrator power, so the test uses one.
    admin = await createUser({ role: 'ADMIN', email: `admin.${uniq()}@example.edu` })
    adminToken = await loginAs(admin)
    other = await createUser({ email: `other.${uniq()}@example.edu` })
    otherToken = await loginAs(other)

    const uploaded = await upload(ownerToken, pdfBytes(), 'cv.pdf', 'application/pdf')
    fileId = uploaded.body.data.id
    const job = await postJob(posterToken, { title: 'Platform Engineer' },
      { moderatorToken })
    jobId = job.id
  })

  it('answers 404 to a member with no claim on the file', async () => {
    for (const path of ['', '/download']) {
      const res = await request(app)
        .get(`/api/files/${fileId}${path}`).set(asAuth(otherToken))
      assert.equal(res.status, 404, `${path} should be hidden, not forbidden`)
    }
  })

  it('refuses to let an applicant attach somebody else’s file', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(asAuth(otherToken))
      .send({ coverLetter: 'Please read my CV.', resumeFileId: fileId })
    assert.equal(res.status, 422, JSON.stringify(res.body))
  })

  it('lets the owner, an administrator and the job’s poster read it', async () => {
    const applied = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(asAuth(ownerToken))
      .send({ coverLetter: 'Here is my work.', resumeFileId: fileId })
    assert.equal(applied.status, 201, JSON.stringify(applied.body))
    assert.equal(applied.body.data.resume.id, fileId)
    assert.equal(
      applied.body.data.resume.downloadPath, `/api/files/${fileId}/download`,
    )

    // The recruiter, because the file is attached to an application on their posting.
    const recruiter = await request(app)
      .get(`/api/files/${fileId}/download`).set(asAuth(posterToken))
    assert.equal(recruiter.status, 200)

    const admin = await request(app)
      .get(`/api/files/${fileId}/download`).set(asAuth(adminToken))
    assert.equal(admin.status, 200)

    // A moderator is not an administrator: moderating a posting does not include
    // reading every resume in the system.
    const moderator = await request(app)
      .get(`/api/files/${fileId}/download`).set(asAuth(moderatorToken))
    assert.equal(moderator.status, 404)
  })

  it('does not give a different poster access through somebody else’s application', async () => {
    const strangerPoster = await createUser({ email: `rival.${uniq()}@example.edu` })
    const strangerToken = await loginAs(strangerPoster)
    await postJob(strangerToken, { title: 'Data Analyst' }, { moderatorToken })

    const res = await request(app)
      .get(`/api/files/${fileId}/download`).set(asAuth(strangerToken))
    assert.equal(res.status, 404)
  })

  it('refuses to delete a file an application still points at', async () => {
    const res = await request(app)
      .delete(`/api/files/${fileId}`).set(asAuth(ownerToken))
    assert.equal(res.status, 409, JSON.stringify(res.body))
  })

  it('lets only the owner or an administrator delete a file', async () => {
    const strangerUpload = await upload(otherToken, pdfBytes('other'), 'other.pdf',
      'application/pdf')
    const strangerId = strangerUpload.body.data.id

    const byStranger = await request(app)
      .delete(`/api/files/${strangerId}`).set(asAuth(ownerToken))
    assert.equal(byStranger.status, 404)

    const byModerator = await request(app)
      .delete(`/api/files/${strangerId}`).set(asAuth(moderatorToken))
    assert.equal(byModerator.status, 404)

    const byAdmin = await request(app)
      .delete(`/api/files/${strangerId}`).set(asAuth(adminToken))
    assert.equal(byAdmin.status, 204, JSON.stringify(byAdmin.body))
  })

  it('removes the bytes as well as the row when a file is deleted', async () => {
    const uploaded = await upload(ownerToken, pdfBytes('scratch'), 'scratch.pdf',
      'application/pdf')
    const id = uploaded.body.data.id
    const { rows } = await query('SELECT storage_key FROM stored_files WHERE id = $1', [id])
    const stored = path.join(uploadRoot, 'documents', rows[0].storage_key)
    assert.ok(await fs.stat(stored), 'the bytes should exist while the row does')

    const res = await request(app).delete(`/api/files/${id}`).set(asAuth(ownerToken))
    assert.equal(res.status, 204)
    const left = await query('SELECT 1 FROM stored_files WHERE id = $1', [id])
    assert.equal(left.rows.length, 0)
    await assert.rejects(fs.stat(stored), 'the bytes should be gone too')
  })
})

describe('phase 4: the resume on a profile', () => {
  before(resetAll)

  let student, studentToken

  before(async () => {
    student = await createUser({ role: 'STUDENT', email: `stud.${uniq()}@example.edu` })
    studentToken = await loginAs(student)
  })

  const uploadResume = (buffer = pdfBytes('profile')) =>
    request(app)
      .post('/api/profiles/me/resume')
      .set(asAuth(studentToken))
      .attach('file', buffer, { filename: 'cv.pdf', contentType: 'application/pdf' })

  it('stores the resume, and reports it on the profile', async () => {
    const res = await uploadResume()
    assert.equal(res.status, 200, JSON.stringify(res.body))

    const mine = await request(app)
      .get('/api/profiles/me/resume').set(asAuth(studentToken))
    assert.equal(mine.status, 200)
    assert.equal(mine.body.data.id, res.body.data.id)

    const profile = await request(app)
      .get(`/api/profiles/${student.id}`).set(asAuth(studentToken))
    assert.equal(profile.status, 200, JSON.stringify(profile.body))
    assert.equal(profile.body.data.student.resume.id, res.body.data.id)
    assert.equal(
      profile.body.data.student.resume.downloadPath,
      `/api/files/${res.body.data.id}/download`,
    )
    // The raw column never reaches the wire.
    assert.equal(profile.body.data.student.resume_file_id, undefined)
  })

  it('reclaims the file it replaces', async () => {
    const first = await uploadResume(pdfBytes('first'))
    const firstId = first.body.data.id
    const { rows } = await query('SELECT storage_key FROM stored_files WHERE id = $1', [firstId])
    const firstPath = path.join(uploadRoot, 'documents', rows[0].storage_key)

    const second = await uploadResume(pdfBytes('second'))
    const secondId = second.body.data.id
    assert.notEqual(secondId, firstId)

    const replaced = await query('SELECT 1 FROM stored_files WHERE id = $1', [firstId])
    assert.equal(replaced.rows.length, 0, 'the replaced resume should not be left behind')
    await assert.rejects(fs.stat(firstPath))

    const kept = await query('SELECT 1 FROM stored_files WHERE id = $1', [secondId])
    assert.equal(kept.rows.length, 1, 'the new resume must survive the cleanup')
  })

  it('deletes the resume and the bytes with it', async () => {
    const current = await request(app)
      .get('/api/profiles/me/resume').set(asAuth(studentToken))
    const id = current.body.data.id
    const { rows } = await query('SELECT storage_key FROM stored_files WHERE id = $1', [id])
    const stored = path.join(uploadRoot, 'documents', rows[0].storage_key)

    const res = await request(app)
      .delete('/api/profiles/me/resume').set(asAuth(studentToken))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    await assert.rejects(fs.stat(stored))

    const empty = await request(app)
      .get('/api/profiles/me/resume').set(asAuth(studentToken))
    assert.equal(empty.body.data, null)
  })
})

describe('phase 4: applications', () => {
  before(resetAll)

  let poster, posterToken, applicant, applicantToken, moderator, moderatorToken
  let jobId, resumeId

  before(async () => {
    poster = await createUser({ email: `boss.${uniq()}@example.edu` })
    posterToken = await loginAs(poster)
    applicant = await createUser({ email: `cand.${uniq()}@example.edu` })
    applicantToken = await loginAs(applicant)
    moderator = await createUser({ role: 'MODERATOR', email: `mod.${uniq()}@example.edu` })
    moderatorToken = await loginAs(moderator)

    const uploaded = await upload(applicantToken, pdfBytes('cv'), 'cv.pdf', 'application/pdf')
    resumeId = uploaded.body.data.id
    const job = await postJob(posterToken, {}, { moderatorToken })
    jobId = job.id
  })

  it('attaches an uploaded resume to the application', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/applications`)
      .set(asAuth(applicantToken))
      .send({ coverLetter: 'I would like to work on your payments platform.', resumeFileId: resumeId })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.status, 'SUBMITTED')
    assert.equal(res.body.data.resume.id, resumeId)

    const mine = await request(app)
      .get('/api/applications').set(asAuth(applicantToken))
    assert.equal(mine.status, 200, JSON.stringify(mine.body))
    assert.equal(mine.body.meta.total, 1)
    assert.equal(mine.body.data[0].jobId, jobId)

    // The applicant's own address is theirs to see; a stranger's is not.
    assert.equal(typeof mine.body.data[0].applicant.email, 'string')
  })

  it('withdraws, and refuses a review after that', async () => {
    const list = await request(app)
      .get('/api/applications').set(asAuth(applicantToken))
    const applicationId = list.body.data[0].id

    const withdrawn = await request(app)
      .patch(`/api/applications/${applicationId}/withdraw`).set(asAuth(applicantToken))
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body))
    assert.equal(withdrawn.body.data.status, 'WITHDRAWN')

    const review = await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .set(asAuth(posterToken))
      .send({ status: 'shortlisted' })
    assert.equal(review.status, 409, JSON.stringify(review.body))

    const again = await request(app)
      .patch(`/api/applications/${applicationId}/withdraw`).set(asAuth(applicantToken))
    assert.equal(again.status, 409, JSON.stringify(again.body))
  })

  it('lets a member withdraw only their own application', async () => {
    const stranger = await createUser({ email: `nosy.${uniq()}@example.edu` })
    const strangerToken = await loginAs(stranger)
    const list = await request(app)
      .get('/api/applications').set(asAuth(applicantToken))
    const applicationId = list.body.data[0].id

    const res = await request(app)
      .patch(`/api/applications/${applicationId}/withdraw`).set(asAuth(strangerToken))
    assert.equal(res.status, 403, JSON.stringify(res.body))
  })
})

describe('phase 4: board filters', () => {
  before(resetAll)

  let poster, posterToken, reader, readerToken, moderatorToken

  before(async () => {
    poster = await createUser({ email: `filters.poster.${uniq()}@example.edu` })
    posterToken = await loginAs(poster)
    reader = await createUser({ email: `filters.reader.${uniq()}@example.edu` })
    readerToken = await loginAs(reader)
    const moderator = await createUser({ role: 'MODERATOR', email: `filters.mod.${uniq()}@example.edu` })
    moderatorToken = await loginAs(moderator)

    const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

    await postJob(posterToken, {
      title: 'Node Engineer', skills: ['Node.js', 'PostgreSQL'],
      salaryMin: 90_000, salaryMax: 120_000, deadline: inDays(30),
    }, { moderatorToken })
    await postJob(posterToken, {
      title: 'React Engineer', skills: ['React', 'Node.js'],
      salaryMin: 150_000, salaryMax: 200_000,
    }, { moderatorToken })
    // Kept out of the board: still in review, because a draft nobody has sent anywhere
    // would not tell the poster what they are looking at.
    await postJob(posterToken, { title: 'Draft Role', status: 'DRAFT' },
      { publish: false, moderatorToken })
  })

  const search = async (queryString) => {
    const res = await request(app)
      .get(`/api/jobs?${queryString}`).set(asAuth(readerToken))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    return res.body.data
  }

  it('requires every requested skill', async () => {
    assert.deepEqual((await search('skills=node.js')).map((j) => j.title).sort(),
      ['Node Engineer', 'React Engineer'])
    assert.deepEqual((await search('skills=node.js,postgresql')).map((j) => j.title),
      ['Node Engineer'])
    assert.deepEqual(await search('skills=node.js,rust'), [])
  })

  it('matches a salary range by overlap, not containment', async () => {
    // 150k-200k asks for anything paid at least that much.
    assert.deepEqual((await search('salaryMin=150000')).map((j) => j.title),
      ['React Engineer'])
    // 100k-160k overlaps both postings.
    assert.equal((await search('salaryMin=100000&salaryMax=160000')).length, 2)
    assert.deepEqual(await search('salaryMin=250000'), [])
  })

  it('asks for postings closing on or before a date', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const later = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    assert.deepEqual(await search(`deadline=${soon}`), [])
    assert.deepEqual((await search(`deadline=${later}`)).map((j) => j.title), ['Node Engineer'])
  })

  it('sorts by salary, with an id tiebreaker so paging is stable', async () => {
    const desc = await search('sort=salary')
    assert.deepEqual(desc.map((j) => j.title), ['React Engineer', 'Node Engineer'])
    const twice = await search('sort=salary')
    assert.deepEqual(twice.map((j) => j.id), desc.map((j) => j.id))

    const alphabetical = await search('sort=title')
    assert.deepEqual(alphabetical.map((j) => j.title), ['Node Engineer', 'React Engineer'])
  })

  it('shows a poster every state of their own work', async () => {
    const res = await request(app)
      .get('/api/jobs?postedByMe=true').set(asAuth(posterToken))
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const states = res.body.data.map((j) => j.status).sort()
    assert.deepEqual(states, ['DRAFT', 'PUBLISHED', 'PUBLISHED'])
  })

  it('keeps an unpublished posting out of the reader’s board', async () => {
    const res = await request(app).get('/api/jobs').set(asAuth(readerToken))
    assert.equal(res.body.meta.total, 2)
  })
})

/**
 * Each expectation below is its own test, and each one trips exactly one statement.
 *
 * A statement the server refuses leaves PGlite's single session needing a fresh
 * connection, so two refused statements in one test would fail the second one for the
 * wrong reason.
 */
describe('phase 4: the database refuses what the service refuses', () => {
  before(resetAll)

  let posterId, moderatorId, applicantId, jobId

  before(async () => {
    const poster = await createUser({ email: `db.poster.${uniq()}@example.edu` })
    const moderator = await createUser({ role: 'MODERATOR', email: `db.mod.${uniq()}@example.edu` })
    const applicant = await createUser({ email: `db.cand.${uniq()}@example.edu` })
    posterId = poster.id
    moderatorId = moderator.id
    applicantId = applicant.id

    const job = await postJob(await loginAs(poster), { title: 'Guarded Role' },
      { publish: false, moderatorToken: await loginAs(moderator) })
    jobId = job.id
  })

  it('will not publish a posting that nobody approved', async () => {
    await assert.rejects(
      refusedStatement('UPDATE jobs SET status = $2 WHERE id = $1',
        [jobId, 'published'],
      ),
      /requires the moderator who decided it/,
    )
  })

  it('will not accept the poster’s own name as the moderator', async () => {
    await assert.rejects(
      refusedStatement(
        `UPDATE jobs SET status = 'published', moderated_by = $2, moderated_at = NOW()
         WHERE id = $1`,
        [jobId, posterId],
      ),
      /only a moderator or admin may decide/,
    )
  })

  it('accepts the same decision when a moderator made it', async () => {
    const res = await query(
      `UPDATE jobs SET status = 'published', moderated_by = $2, moderated_at = NOW()
       WHERE id = $1 RETURNING status, published_at`,
      [jobId, moderatorId],
    )
    assert.equal(res.rows[0].status, 'published')
    assert.ok(res.rows[0].published_at, 'publishing stamps the moment it went live')
  })

  it('will not accept an application without something attached', async () => {
    await assert.rejects(
      refusedStatement(
        `INSERT INTO job_applications (job_id, applicant_id, cover_letter)
         VALUES ($1, $2, 'No attachment here')`,
        [jobId, applicantId],
      ),
      /applications_has_attachment/,
    )
  })

  it('will not record a review that nobody made', async () => {
    const uploader = await createUser({ email: `db.review.${uniq()}@example.edu` })
    const uploaded = await upload(await loginAs(uploader), pdfBytes('review'), 'cv.pdf',
      'application/pdf')
    await query(
      `INSERT INTO job_applications (job_id, applicant_id, cover_letter, resume_file_id)
       VALUES ($1, $2, 'Please consider me', $3)`,
      [jobId, applicantId, uploaded.body.data.id],
    )

    await assert.rejects(
      refusedStatement(
        `UPDATE job_applications SET status = 'accepted' WHERE job_id = $1`,
        [jobId],
      ),
      /must record who reviewed it/,
    )
  })

  it('will not move an application into a state the schema dropped', async () => {
    await assert.rejects(
      refusedStatement(
        `UPDATE job_applications SET status = 'interviewing' WHERE job_id = $1`,
        [jobId],
      ),
      /applications_status_check/,
    )
  })

  it('refuses a stored file row with a separator in its name', async () => {
    await assert.rejects(
      refusedStatement(
        `INSERT INTO stored_files (owner_id, storage_key, original_filename, content_type,
           byte_size, checksum_sha256)
         VALUES ($1,'key.pdf','etc/passwd','application/pdf',10,$2)`,
        [posterId, 'a'.repeat(64)],
      ),
      /stored_files_filename_safe/,
    )
  })

  it('keeps the uploader on the file row, so ownership can be checked later', async () => {
    const owner = await createUser({ email: `db.files.${uniq()}@example.edu` })
    const uploaded = await upload(await loginAs(owner), pdfBytes('mine'), 'mine.pdf',
      'application/pdf')
    const { rows } = await query('SELECT owner_id FROM stored_files WHERE id = $1',
      [uploaded.body.data.id])
    assert.equal(rows[0].owner_id, owner.id)
  })
})
