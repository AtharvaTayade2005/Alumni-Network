/**
 * Migration and schema verification harness.
 *
 * The dev server's PGlite is single-session, so each CLI invocation that opens
 * the database can knock the previous connection out. This script does the whole
 * check inside one PGlite instance instead, which makes the apply/rollback/
 * reapply cycle deterministic.
 *
 *   node scripts/verify-migrations.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(here, '..', '..', 'database', 'migrations')

let failures = 0
function check(label, ok, detail) {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`)
}

async function files(suffix = '.sql', { downs = false } = {}) {
  const all = await fs.readdir(migrationsDir)
  if (downs) return all.filter((f) => f.endsWith('.down.sql')).sort()
  return all.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort()
}

async function apply(db, list) {
  for (const f of list) {
    const sql = await fs.readFile(path.join(migrationsDir, f), 'utf8')
    await db.exec(sql)
  }
}

async function main() {
  const db = await PGlite.create()

  console.log('--- clean apply of every forward migration ---')
  const up = await files()
  try {
    await apply(db, up)
    check(`applied ${up.length} migrations on a clean database`, true)
  } catch (e) {
    check('clean apply', false, e.message)
    await db.close()
    process.exitCode = 1
    return
  }

  console.log('\n--- phase 2 columns are present ---')
  const cols = async (table) => {
    const r = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 ORDER BY column_name`, [table],
    )
    return new Set(r.rows.map((x) => x.column_name))
  }

  const alumni = await cols('alumni_profiles')
  for (const c of ['user_id', 'graduation_year', 'degree', 'major', 'university',
    'current_company', 'job_title', 'industry', 'location', 'bio', 'profile_photo']) {
    check(`alumni_profiles.${c}`, alumni.has(c))
  }

  const student = await cols('student_profiles')
  for (const c of ['user_id', 'degree', 'major', 'graduation_year', 'university',
    'location', 'bio', 'profile_photo', 'career_interests']) {
    check(`student_profiles.${c}`, student.has(c))
  }

  const edu = await cols('education')
  for (const c of ['institution', 'degree', 'field', 'start_year', 'end_year', 'description']) {
    check(`education.${c}`, edu.has(c))
  }

  const exp = await cols('experience')
  for (const c of ['company', 'job_title', 'employment_type', 'start_date',
    'end_date', 'description']) {
    check(`experience.${c}`, exp.has(c))
  }

  const links = await cols('social_links')
  for (const c of ['platform', 'url']) check(`social_links.${c}`, links.has(c))

  const evt = await cols('alumni_verification_events')
  for (const c of ['user_id', 'reviewer_id', 'reason', 'action', 'new_status', 'created_at']) {
    check(`alumni_verification_events.${c}`, evt.has(c))
  }

  console.log('\n--- generated columns mirror their source ---')
  const gen = await db.query(`
    SELECT table_name, column_name, is_generated, generation_expression
    FROM information_schema.columns
    WHERE (table_name = 'experience' AND column_name IN ('company','job_title'))
    ORDER BY column_name`)
  check('experience.company and job_title are generated from 001 columns',
    gen.rows.length === 2 && gen.rows.every((r) => r.is_generated === 'ALWAYS'),
    gen.rows.map((r) => `${r.column_name}=${r.is_generated}`).join(','))

  console.log('\n--- alias triggers keep renamed columns in agreement ---')
  await db.exec(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_email_verified)
    VALUES ('11111111-1111-1111-1111-111111111111', 'alias@example.edu', 'x', 'A', 'One', TRUE);
    INSERT INTO alumni_profiles (user_id, major, job_title, city, region, country)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Physics', 'Engineer',
            'Pune', 'Maharashtra', 'India');
  `)
  let r = await db.query(`SELECT major, department, job_title, current_position, location
    FROM alumni_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  check('major seeds department', r.rows[0].major === 'Physics' && r.rows[0].department === 'Physics')
  check('job_title seeds current_position',
    r.rows[0].job_title === 'Engineer' && r.rows[0].current_position === 'Engineer')
  check('location composed from city/region/country',
    r.rows[0].location === 'Pune, Maharashtra, India', r.rows[0].location)

  // Write through the legacy name; the specification name must follow.
  await db.exec(`UPDATE alumni_profiles SET department = 'Astronomy'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  r = await db.query(`SELECT major, department FROM alumni_profiles
    WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  check('writing department updates major',
    r.rows[0].major === 'Astronomy' && r.rows[0].department === 'Astronomy',
    `major=${r.rows[0].major}`)

  await db.exec(`UPDATE alumni_profiles SET job_title = 'Director'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  r = await db.query(`SELECT job_title, current_position FROM alumni_profiles
    WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  check('writing job_title updates current_position',
    r.rows[0].current_position === 'Director', r.rows[0].current_position)

  console.log('\n--- profile photo syncs to users.avatar_url ---')
  await db.exec(`UPDATE alumni_profiles SET profile_photo = '/uploads/photos/a.png'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'`)
  r = await db.query(`SELECT avatar_url FROM users WHERE id = '11111111-1111-1111-1111-111111111111'`)
  check('profile_photo propagates to users.avatar_url',
    r.rows[0].avatar_url === '/uploads/photos/a.png', r.rows[0].avatar_url)

  console.log('\n--- student alias sync ---')
  await db.exec(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, is_email_verified)
    VALUES ('22222222-2222-2222-2222-222222222222', 'stu@example.edu', 'x', 'S', 'Two', TRUE);
    INSERT INTO student_profiles (user_id, degree, major, graduation_year, city)
    VALUES ('22222222-2222-2222-2222-222222222222', 'BSc', 'Biology', 2027, 'Pune');
  `)
  r = await db.query(`SELECT major, department, graduation_year, expected_graduation, location
    FROM student_profiles WHERE user_id = '22222222-2222-2222-2222-222222222222'`)
  check('student major seeds department', r.rows[0].department === 'Biology')
  check('graduation_year seeds expected_graduation',
    r.rows[0].expected_graduation === 2027, String(r.rows[0].expected_graduation))
  check('student location composed', r.rows[0].location === 'Pune', r.rows[0].location)

  console.log('\n--- constraints reject bad data ---')
  const rejects = async (label, sql, params = []) => {
    try {
      await db.query(sql, params)
      check(label, false, 'was accepted but should have been rejected')
    } catch {
      check(label, true)
    }
  }
  await rejects('alumni_graduation_year rejects 1800', `
    INSERT INTO alumni_profiles (user_id, graduation_year)
    VALUES ('33333333-3333-3333-3333-333333333333', 1800)`)
  await db.exec(`INSERT INTO users (id,email,password_hash,first_name,last_name)
    VALUES ('33333333-3333-3333-3333-333333333333','x3@example.edu','x','X','Three')`)
  await rejects('alumni_graduation_year rejects 1800 (user exists)', `
    INSERT INTO alumni_profiles (user_id, graduation_year)
    VALUES ('33333333-3333-3333-3333-333333333333', 1800)`)
  await rejects('experience_employment_type rejects nonsense', `
    INSERT INTO experience (user_id, company_name, title, employment_type)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Acme', 'Dev', 'wizard')`)
  await rejects('experience current role rejects an end date', `
    INSERT INTO experience (user_id, company_name, title, is_current, start_date, end_date)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Acme', 'Dev', TRUE, '2020-01-01', '2021-01-01')`)
  await rejects('education rejects end before start', `
    INSERT INTO education (user_id, institution, start_year, end_year)
    VALUES ('11111111-1111-1111-1111-111111111111', 'MIT', 2020, 2010)`)
  await rejects('rejection event requires a reason', `
    INSERT INTO alumni_verification_events (user_id, action, new_status, reviewer_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'rejected', 'rejected',
            '22222222-2222-2222-2222-222222222222')`)
  await rejects('verification event action must be known', `
    INSERT INTO alumni_verification_events (user_id, action, new_status)
    VALUES ('11111111-1111-1111-1111-111111111111', 'maybe', 'verified')`)

  console.log('\n--- cascade delete removes dependent rows ---')
  await db.exec(`INSERT INTO education (user_id, institution)
    VALUES ('11111111-1111-1111-1111-111111111111', 'MIT')`)
  await db.exec(`INSERT INTO skills (name) VALUES ('Physics')`)
  await db.exec(`INSERT INTO user_skills (user_id, skill_id)
    SELECT '11111111-1111-1111-1111-111111111111', id FROM skills WHERE name = 'Physics'`)
  await db.exec(`DELETE FROM users WHERE id = '11111111-1111-1111-1111-111111111111'`)
  const left = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM education WHERE user_id = '11111111-1111-1111-1111-111111111111') AS edu,
      (SELECT COUNT(*)::int FROM user_skills WHERE user_id = '11111111-1111-1111-1111-111111111111') AS sk,
      (SELECT COUNT(*)::int FROM alumni_profiles WHERE user_id = '11111111-1111-1111-1111-111111111111') AS ap,
      (SELECT COUNT(*)::int FROM alumni_verification_events WHERE user_id = '11111111-1111-1111-1111-111111111111') AS ev`)
  check('education, skills, profile and events cascade on user delete',
    left.rows[0].edu === 0 && left.rows[0].sk === 0
    && left.rows[0].ap === 0 && left.rows[0].ev === 0,
    JSON.stringify(left.rows[0]))

  console.log('\n--- phase 3: mentorship and networking schema ---')
  const requestCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'mentorship_requests'::regclass
       AND conname = 'mentorship_requests_status_check'`)
  check('mentorship_requests accepts completed',
    requestCheck.rows[0]?.def.includes('completed'), requestCheck.rows[0]?.def)

  const notificationCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'notifications'::regclass
       AND conname = 'notifications_type_check'`)
  check('notifications accepts mentorship_completed',
    notificationCheck.rows[0]?.def.includes('mentorship_completed'),
    notificationCheck.rows[0]?.def)
  check('notifications keeps the declined and ended types it already stored',
    notificationCheck.rows[0]?.def.includes('mentorship_declined')
    && notificationCheck.rows[0]?.def.includes('mentorship_ended'))

  // 001 attaches set_updated_at() to notifications without ever adding the column,
  // so the actor_id ON DELETE SET NULL that a connection notification causes would
  // fail on any UPDATE of a notification row.
  const notifications = await cols('notifications')
  check('notifications.updated_at present', notifications.has('updated_at'))
  await db.exec(`INSERT INTO users (id,email,password_hash,first_name,last_name)
    VALUES ('44444444-4444-4444-4444-444444444444','x4@example.edu','x','X','Four')`)
  await db.exec(`INSERT INTO users (id,email,password_hash,first_name,last_name)
    VALUES ('55555555-5555-5555-5555-555555555555','x5@example.edu','x','X','Five')`)
  await db.exec(`INSERT INTO notifications (user_id, actor_id, type, title)
    VALUES ('55555555-5555-5555-5555-555555555555',
            '44444444-4444-4444-4444-444444444444', 'connection_request', 'Hi')`)
  await db.exec(`UPDATE notifications SET is_read = TRUE
    WHERE user_id = '55555555-5555-5555-5555-555555555555'`)
  check('a notification row can be marked read', true)
  await db.exec(`DELETE FROM users WHERE id = '44444444-4444-4444-4444-444444444444'`)
  const actorCleared = await db.query(
    `SELECT actor_id FROM notifications WHERE user_id = '55555555-5555-5555-5555-555555555555'`)
  check('deleting the actor clears notification.actor_id',
    actorCleared.rows[0]?.actor_id === null, String(actorCleared.rows[0]?.actor_id))

  const mentorTrigger = await db.query(
    `SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'alumni_profiles'::regclass AND NOT tgisinternal
       AND tgname = 'alumni_mentor_listing_requires_verification'`)
  check('mentor listing is guarded by the AFTER trigger', mentorTrigger.rows.length === 1)
  const legacyCheck = await db.query(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'alumni_profiles'::regclass
       AND conname = 'alumni_open_to_mentor_needs_verified'`)
  check('the check-constraint form is gone', legacyCheck.rows.length === 0)

  // The profile service upserts with INSERT ... ON CONFLICT, which proposes a
  // candidate tuple whose verification_status is still the column default. The
  // AFTER trigger only sees rows that are really written, so the update branch must
  // be free to advertise on a profile that is already verified.
  await db.exec(`INSERT INTO alumni_profiles (user_id, verification_status)
    VALUES ('33333333-3333-3333-3333-333333333333', 'verified')`)
  await db.exec(`INSERT INTO alumni_profiles (user_id, verification_status, is_open_to_mentor)
    VALUES ('33333333-3333-3333-3333-333333333333', 'pending', TRUE)
    ON CONFLICT (user_id) DO UPDATE SET is_open_to_mentor = TRUE`)
  const listed = await db.query(
    `SELECT is_open_to_mentor, verification_status FROM alumni_profiles
     WHERE user_id = '33333333-3333-3333-3333-333333333333'`)
  check('a verified alumnus may advertise through the upsert the profile service uses',
    listed.rows[0]?.is_open_to_mentor === true
    && listed.rows[0]?.verification_status === 'verified',
    JSON.stringify(listed.rows[0]))

  await rejects('unverified alumnus may not advertise as a mentor', `
    UPDATE alumni_profiles SET verification_status = 'pending', is_open_to_mentor = TRUE
    WHERE user_id = '33333333-3333-3333-3333-333333333333'`)
  // The cascade section above already deleted its fixtures, so the networking rows
  // get their own users.
  await db.exec(`INSERT INTO users (id,email,password_hash,first_name,last_name)
    VALUES ('66666666-6666-6666-6666-666666666666','x6@example.edu','x','X','Six'),
           ('77777777-7777-7777-7777-777777777777','x7@example.edu','x','X','Seven')`)
  const mentorId = '66666666-6666-6666-6666-666666666666'
  const menteeId = '77777777-7777-7777-7777-777777777777'
  await rejects('mentorship request rejects an unknown state', `
    INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, status)
    VALUES ('${mentorId}', '${menteeId}', 'goal', 'area', 'maybe')`)
  await db.exec(`INSERT INTO mentorship_requests
      (mentor_id, mentee_id, career_goal, area_of_interest, status)
    VALUES ('${mentorId}', '${menteeId}', 'goal', 'area', 'completed')`)
  check('mentorship request accepts completed', true)
  await rejects('connection rejects an unknown state', `
    INSERT INTO connections (requester_id, addressee_id, status)
    VALUES ('${mentorId}', '${menteeId}', 'maybe')`)
  await rejects('connection rejects a request to yourself', `
    INSERT INTO connections (requester_id, addressee_id, status)
    VALUES ('${mentorId}', '${mentorId}', 'pending')`)
  await db.exec(`INSERT INTO connections (requester_id, addressee_id, status)
    VALUES ('${mentorId}', '${menteeId}', 'pending')`)
  await rejects('the symmetric pair index refuses the reversed pair', `
    INSERT INTO connections (requester_id, addressee_id, status)
    VALUES ('${menteeId}', '${mentorId}', 'pending')`)

  console.log('\n--- phase 3 indexes exist and suit their queries ---')
  const idx3 = await db.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`)
  const present3 = new Set(idx3.rows.map((r) => r.indexname))
  const phase3Indexes = [
    'idx_notifications_user_type', 'idx_mentorship_req_mentee_created',
    'idx_mentorship_req_mentor_status_created', 'idx_connections_blocked_pair',
    'idx_mentorship_rel_active_mentor', 'idx_mentorship_rel_active_mentee',
  ]
  const missing3 = phase3Indexes.filter((n) => !present3.has(n))
  check(`all ${phase3Indexes.length} phase 3 indexes present`, missing3.length === 0,
    missing3.length ? `missing: ${missing3.join(', ')}` : 'none missing')

  const mentorIndex = idx3.rows.find((r) => r.indexname === 'idx_alumni_mentor')
  check('idx_alumni_mentor keys on verification_status under the listing predicate',
    /verification_status/.test(mentorIndex?.indexdef ?? '')
    && /is_open_to_mentor = true/.test(mentorIndex?.indexdef ?? ''),
    mentorIndex?.indexdef)

  console.log('\n--- phase 4: job portal schema ---')
  // The job portal is the only feature whose states are rewritten by a migration
  // rather than added to, so the vocabulary is asserted from the constraint
  // definition instead of by round-tripping values.
  const jobStatusCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'jobs'::regclass AND conname = 'jobs_status_check'`)
  const jobStates = jobStatusCheck.rows[0]?.def ?? ''
  check('jobs status vocabulary is the phase 4 workflow',
    ['draft', 'pending_review', 'published', 'closed', 'rejected']
      .every((s) => jobStates.includes(s)) && !jobStates.includes("'active'"),
    jobStates)

  const appStatusCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'job_applications'::regclass
       AND conname = 'applications_status_check'`)
  check('application pipeline plus withdrawn is retained',
    ['submitted', 'under_review', 'shortlisted', 'rejected', 'accepted', 'withdrawn']
      .every((s) => (appStatusCheck.rows[0]?.def ?? '').includes(s)),
    appStatusCheck.rows[0]?.def)

  const jobCols = await cols('jobs')
  check('jobs records who moderated it and when',
    ['published_at', 'moderated_by', 'moderated_at', 'industry']
      .every((c) => jobCols.has(c)),
    ['published_at', 'moderated_by', 'moderated_at', 'industry']
      .filter((c) => !jobCols.has(c)).join(', ') || 'all present')

  const fileCols = await cols('stored_files')
  check('stored_files holds ownership, key, type, size and checksum',
    ['owner_id', 'kind', 'storage_key', 'original_filename', 'content_type',
      'byte_size', 'checksum_sha256'].every((c) => fileCols.has(c)),
    ['owner_id', 'kind', 'storage_key', 'original_filename', 'content_type',
      'byte_size', 'checksum_sha256'].filter((c) => !fileCols.has(c)).join(', ')
    || 'all present')

  const profileCols = await cols('student_profiles')
  check('a profile resume records the file id rather than an unserved url',
    profileCols.has('resume_file_id'), profileCols.has('resume_file_id')
      ? 'resume_file_id present' : 'resume_file_id missing')

  // Roles drive both job triggers, and the earlier sections left their fixtures
  // roleless, so the moderation checks get their own members.
  await db.exec(`INSERT INTO roles (name) VALUES ('ADMIN'), ('MODERATOR'),
      ('ALUMNI'), ('STUDENT') ON CONFLICT DO NOTHING`)
  const roleIds = {}
  for (const [name, id] of [['admin', 'aa000000-0000-0000-0000-000000000001'],
    ['moderator', 'aa000000-0000-0000-0000-000000000002'],
    ['alumni', 'aa000000-0000-0000-0000-000000000003'],
    ['student', 'aa000000-0000-0000-0000-000000000004']]) {
    await db.exec(`INSERT INTO users (id,email,password_hash,first_name,last_name)
      VALUES ('${id}','phase4-${name}@example.edu','x','Phase4','${name}')
      ON CONFLICT (id) DO NOTHING`)
    const r = await db.query(`SELECT id FROM roles WHERE LOWER(name) = $1`, [name])
    roleIds[name] = r.rows[0].id
    await db.exec(`INSERT INTO user_roles (user_id, role_id)
      VALUES ('${id}', ${roleIds[name]}) ON CONFLICT DO NOTHING`)
  }
  const phase4 = {
    admin: 'aa000000-0000-0000-0000-000000000001',
    moderator: 'aa000000-0000-0000-0000-000000000002',
    alumni: 'aa000000-0000-0000-0000-000000000003',
    student: 'aa000000-0000-0000-0000-000000000004',
  }

  await rejects('a student account cannot post a job', `
    INSERT INTO jobs (posted_by, company_name, title, description, status)
    VALUES ('${phase4.student}', 'Acme', 'Intern', 'A description.', 'pending_review')`)

  const pendingJob = await db.query(
    `INSERT INTO jobs (posted_by, company_name, title, description, status)
     VALUES ('${phase4.alumni}', 'Acme', 'Engineer', 'A description.', 'pending_review')
     RETURNING id, published_at, moderated_by`)
  check('an alumni posting enters review with nothing claiming it is live',
    !!pendingJob.rows[0]?.id && pendingJob.rows[0].published_at === null
    && pendingJob.rows[0].moderated_by === null)

  await rejects('a poster cannot promote their own posting', `
    UPDATE jobs SET status = 'published' WHERE id = '${pendingJob.rows[0].id}'`)

  const approved = await db.query(
    `UPDATE jobs SET status = 'published', moderated_by = $2, moderated_at = NOW()
     WHERE id = $1 RETURNING published_at, is_moderated`,
    [pendingJob.rows[0].id, phase4.moderator])
  check('a moderator approval publishes the posting and dates it',
    approved.rows[0]?.published_at !== null)

  await rejects('a non-moderator cannot be recorded as the deciding reviewer', `
    UPDATE jobs SET moderated_by = '${phase4.alumni}' WHERE id = '${pendingJob.rows[0].id}'`)

  await db.exec(`UPDATE jobs SET status = 'closed' WHERE id = '${pendingJob.rows[0].id}'`)
  const closed = await db.query(
    `SELECT published_at, moderated_by FROM jobs WHERE id = $1`, [pendingJob.rows[0].id])
  check('closing a published posting keeps its moderation trail',
    closed.rows[0]?.published_at !== null
    && closed.rows[0]?.moderated_by === phase4.moderator)

  await rejects('an unknown job status is refused', `
    UPDATE jobs SET status = 'live' WHERE id = '${pendingJob.rows[0].id}'`)

  const resumeFile = await db.query(
    `INSERT INTO stored_files (owner_id, kind, storage_key, original_filename,
        content_type, byte_size, checksum_sha256)
     VALUES ('${phase4.student}','resume','resumes/phase4.pdf','My CV.pdf',
        'application/pdf',1024,'${'a'.repeat(64)}')
     RETURNING id`)
  check('a resume file row is accepted', !!resumeFile.rows[0]?.id)
  await rejects('a path-like display name is refused', `
    INSERT INTO stored_files (owner_id, kind, storage_key, original_filename,
        content_type, byte_size, checksum_sha256)
    VALUES ('${phase4.student}','resume','resumes/evil.pdf','../../etc/passwd',
      'application/pdf',10,'${'b'.repeat(64)}')`)
  await rejects('a duplicate storage key is refused', `
    INSERT INTO stored_files (owner_id, kind, storage_key, original_filename,
        content_type, byte_size, checksum_sha256)
    VALUES ('${phase4.student}','resume','resumes/phase4.pdf','Copy.pdf',
      'application/pdf',10,'${'c'.repeat(64)}')`)

  await db.exec(`UPDATE jobs SET status = 'published', moderated_by = '${phase4.moderator}',
      moderated_at = NOW() WHERE id = '${pendingJob.rows[0].id}'`)
  const application = await db.query(
    `INSERT INTO job_applications (job_id, applicant_id, resume_file_id)
     VALUES ($1,$2,$3) RETURNING id`, [pendingJob.rows[0].id, phase4.student, resumeFile.rows[0].id])
  check('an application may attach an uploaded file', !!application.rows[0]?.id)
  await rejects('an application with no attachment at all is refused', `
    INSERT INTO job_applications (job_id, applicant_id)
    VALUES ('${pendingJob.rows[0].id}', '${phase4.admin}')`)
  await rejects('a review move without a reviewer is refused', `
    UPDATE job_applications SET status = 'shortlisted' WHERE id = '${application.rows[0].id}'`)
  const reviewed = await db.query(
    `UPDATE job_applications SET status = 'shortlisted', reviewed_by = $2
     WHERE id = $1 RETURNING reviewed_at`, [application.rows[0].id, phase4.alumni])
  check('a review move records who reviewed and when', reviewed.rows[0]?.reviewed_at !== null)
  await rejects('an unknown application status is refused', `
    UPDATE job_applications SET status = 'hired' WHERE id = '${application.rows[0].id}'`)

  const phase4Indexes = [
    'idx_jobs_published_deadline', 'idx_jobs_published_work_mode',
    'idx_jobs_published_employment', 'idx_jobs_published_experience',
    'idx_jobs_published_location', 'idx_jobs_published_industry',
    'idx_jobs_published_company', 'idx_jobs_published_company_id',
    'idx_jobs_published_salary', 'idx_jobs_poster_created', 'idx_jobs_review_queue',
    'idx_applications_job_status', 'idx_applications_applicant_status',
    'idx_applications_resume_file', 'idx_saved_jobs_user_created', 'idx_saved_jobs_job',
    'idx_stored_files_owner_kind',
  ]
  const present4 = new Set(idx3.rows.map((r) => r.indexname))
  const missing4 = phase4Indexes.filter((n) => !present4.has(n))
  check(`all ${phase4Indexes.length} phase 4 indexes present`, missing4.length === 0,
    missing4.length ? `missing: ${missing4.join(', ')}` : 'none missing')

  // Migration 006 and 007 built their partial job indexes against a state name the
  // schema never used, which left them matching no rows at all. 012 recreates them
  // against 'published'; leaving the dead ones in place would keep every posting
  // write paying for an index that can never be used.
  const retired = ['idx_jobs_work_mode', 'idx_jobs_employment_type',
    'idx_jobs_experience_level', 'idx_jobs_deadline']
  const stillPartialOnOldState = []
  for (const name of retired) {
    const def = idx3.rows.find((r) => r.indexname === name)?.indexdef ?? ''
    if (def.includes("status = 'active'")) stillPartialOnOldState.push(name)
  }
  check('no job index is still partial on the retired active state',
    stillPartialOnOldState.length === 0,
    stillPartialOnOldState.length ? `still partial: ${stillPartialOnOldState.join(', ')}` : 'none')

  const partial4 = await db.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE 'idx\\_jobs\\_published%'`)
  const notOnPublished = partial4.rows.filter((r) => !r.indexdef.includes('published'))
  check(`the ${partial4.rows.length} board indexes are partial on the published state`,
    partial4.rows.length > 0 && notOnPublished.length === 0,
    notOnPublished.length
      ? notOnPublished.map((r) => r.indexname).join(', ')
      : 'all partial on published')

  console.log('\n--- phase 5: events, notifications and conversations ---')
  const eventStateCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'events'::regclass AND conname = 'events_status_check'`)
  const eventStates = eventStateCheck.rows[0]?.def ?? ''
  check('event vocabulary is the four states this phase defines',
    ['draft', 'published', 'cancelled', 'completed'].every((s) => eventStates.includes(s))
      && !eventStates.includes("'removed'"),
    eventStates)

const eventCols = await cols('events')
check('an event records who cancelled it and why',
    ['published_at', 'cancelled_at', 'cancelled_by', 'cancelled_reason']
      .every((c) => eventCols.has(c)),
    ['published_at', 'cancelled_at', 'cancelled_by', 'cancelled_reason']
      .filter((c) => !eventCols.has(c)).join(', ') || 'all present')
check('an event can end after midnight and can carry a picture',
    eventCols.has('end_date') && eventCols.has('image_url'),
    ['end_date', 'image_url'].filter((c) => !eventCols.has(c)).join(', ') || 'all present')

  // 001 compared the end time against the start time on its own, so an evening
  // event finishing at two was rejected rather than stored. The pair comparison
  // this phase introduces is what lets that row exist at all.
  const organizerId = phase4.alumni
  const midnightEvent = await db.query(
    `INSERT INTO events (organizer_id, title, description, event_date, end_date, start_time,
        end_time, venue)
     VALUES ($1, 'Evening event', 'An evening event that runs past midnight', CURRENT_DATE + 1, CURRENT_DATE + 2,
        '18:00', '02:00', 'Hall') RETURNING id`, [organizerId])
  const midnightCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'events'::regclass AND conname = 'events_time_order_check'`)
  check('an event may end after midnight',
    !!midnightEvent.rows[0]?.id && /end_date/.test(midnightCheck.rows[0]?.def ?? ''),
    midnightCheck.rows[0]?.def)
  await rejects('an event may not end before it starts', `
    UPDATE events SET end_date = event_date, end_time = '09:00'
      WHERE id = '${midnightEvent.rows[0].id}'`)
  await rejects('an event with neither a venue nor a link is refused', `
    INSERT INTO events (organizer_id, title, description, event_date, start_time, end_time)
    VALUES ('${organizerId}', 'Nowhere', 'No venue and no link', CURRENT_DATE + 1, '10:00', '11:00')`)
  await rejects('a registration deadline after the event is refused', `
    INSERT INTO events (organizer_id, title, description, event_date, start_time, end_time, venue,
        registration_deadline)
    VALUES ('${organizerId}', 'Late cut-off', 'A deadline after the event itself', CURRENT_DATE + 1, '10:00', '11:00',
        'Hall', CURRENT_DATE + 5)`)

  const attendeeCols = await cols('event_attendees')
  check('the attendee roster has the updated_at its trigger needs',
    attendeeCols.has('updated_at') && attendeeCols.has('checked_in_by'),
    attendeeCols.has('updated_at') ? 'present' : 'missing')

  const notificationCols = await cols('notifications')
  check('notifications carry a dedupe key so a repeated run cannot duplicate one',
    notificationCols.has('dedupe_key') && notificationCols.has('metadata'),
    ['dedupe_key', 'metadata'].filter((c) => !notificationCols.has(c)).join(', ')
    || 'all present')

  const typeCheck = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'notifications'::regclass AND conname = 'notifications_type_check'`)
  check('the event update notification type is in the vocabulary',
    (typeCheck.rows[0]?.def ?? '').includes("'event_updated'"),
    (typeCheck.rows[0]?.def ?? '').includes("'event_updated'")
      ? 'event_updated allowed' : 'event_updated missing')

  const ledger = await db.query(`SELECT to_regclass('public.background_jobs') AS reg`)
  check('the background job ledger exists', ledger.rows[0].reg !== null,
    ledger.rows[0].reg ?? 'missing')

  // A reminder is the one notification that has to be safe to send twice, so the
  // uniqueness is asserted against a real second insert rather than read out of the
  // index definition.
  const firstReminder = await db.query(
    `INSERT INTO notifications (user_id, type, title, dedupe_key)
     VALUES ($1, 'event_reminder', 'Reminder', 'reminder:probe') RETURNING id`,
    [phase4.alumni])
  let duplicateReminder = null
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, dedupe_key)
       VALUES ($1, 'event_reminder', 'Reminder again', 'reminder:probe')`,
      [phase4.alumni])
  } catch (e) {
    duplicateReminder = e.message
  }
  check('the same dedupe key cannot produce a second notification',
    duplicateReminder !== null, duplicateReminder ?? 'a duplicate was inserted')
  await db.query(`DELETE FROM notifications WHERE id = $1`, [firstReminder.rows[0].id])

  // Existing messages have to be reachable through a conversation after the
  // backfill, and the pair has to be unique so a second run adds nothing.
  const convCols = await cols('conversations')
  const participantCols = await cols('conversation_participants')
  check('conversations exist and are addressed by participant pair',
    convCols.has('direct_key') && participantCols.has('last_read_at'),
    `conversations[${[...convCols].join(',')}] participants[${[...participantCols].join(',')}]`)

  const legacyMessage = await db.query(
    `INSERT INTO messages (sender_id, recipient_id, body)
     VALUES ($1, $2, 'Before conversations existed') RETURNING id`,
    [phase4.alumni, phase4.student])
  await db.query(
    `INSERT INTO conversations (type, direct_key) VALUES ('direct', $1)
     ON CONFLICT DO NOTHING`,
    [[phase4.alumni, phase4.student].sort().join(':')])
  await db.query(
    `INSERT INTO conversation_participants (conversation_id, user_id)
     SELECT c.id, m.member FROM conversations c
     CROSS JOIN (VALUES ($1::uuid), ($2::uuid)) AS m(member)
     WHERE c.direct_key = $3
     ON CONFLICT DO NOTHING`,
    [phase4.alumni, phase4.student,
      [phase4.alumni, phase4.student].sort().join(':')])
  // The backfill only claims messages whose conversation_id is NULL and only for
  // pairs it has a conversation for, so re-running the INSERT..UPDATE half of it is
  // how an operator repairs a message that arrived while a migration was half applied.
  await db.query(
    `UPDATE messages m SET conversation_id = c.id FROM conversations c
     WHERE m.conversation_id IS NULL
       AND c.direct_key = LEAST(m.sender_id, m.recipient_id)::text || ':'
                         || GREATEST(m.sender_id, m.recipient_id)::text`)
  const folded = await db.query(
    `SELECT conversation_id FROM messages WHERE id = $1`, [legacyMessage.rows[0].id])
  check('a pre-existing message is folded into a conversation',
    folded.rows[0]?.conversation_id != null,
    folded.rows[0]?.conversation_id ?? 'no conversation')

  const pairs = await db.query(
    `SELECT conversation_id, COUNT(*)::int AS members FROM conversation_participants
     WHERE user_id IN ($1, $2) GROUP BY conversation_id`, [phase4.alumni, phase4.student])
  check('a direct conversation has exactly two participants',
    pairs.rows.length > 0 && pairs.rows.every((r) => r.members === 2),
    pairs.rows.length ? pairs.rows.map((r) => `${r.members}`).join(',') : 'no conversation')

  await rejects('a second conversation for the same pair is refused', `
    INSERT INTO conversations (type, direct_key)
    SELECT 'direct', direct_key FROM conversations
      WHERE direct_key = '${[phase4.alumni, phase4.student].sort().join(':')}'`)

  const messageCols = await cols('messages')
  check('messages carry delivery state and a client id for safe retries',
    ['conversation_id', 'delivered_at', 'client_message_id', 'deleted_at']
      .every((c) => messageCols.has(c)),
    ['conversation_id', 'delivered_at', 'client_message_id', 'deleted_at']
      .filter((c) => !messageCols.has(c)).join(', ') || 'all present')

  await rejects('an oversized message body is refused by the database', `
    INSERT INTO messages (sender_id, recipient_id, body)
    SELECT '${phase4.alumni}', '${phase4.student}', REPEAT('x', 5001)`)

  const phase5Indexes = [
    'idx_events_reminder_scan', 'idx_events_organizer_created',
    'idx_rsvps_event_going', 'idx_rsvps_user_created', 'idx_event_attendees_event',
    'idx_conversations_direct_key', 'idx_conversations_last_message',
    'idx_participants_user', 'idx_participants_unread',
    'idx_messages_client_id', 'idx_messages_conversation_visible',
    'idx_message_read_status_user', 'idx_notifications_dedupe',
    'idx_notifications_reminder_due', 'idx_background_jobs_status_started',
  ]
  const present5 = new Set(idx3.rows.map((r) => r.indexname))
  const missing5 = phase5Indexes.filter((n) => !present5.has(n))
  check(`all ${phase5Indexes.length} phase 5 indexes present`, missing5.length === 0,
    missing5.length ? `missing: ${missing5.join(', ')}` : 'none missing')

  console.log('\n--- phase 6: donations, moderation and audit ---')
  const donationCols = await cols('donations')
  check('donations adopts the specification donor name',
    donationCols.has('user_id') && !donationCols.has('donor_id'),
    `user_id=${donationCols.has('user_id')} donor_id=${donationCols.has('donor_id')}`)
  check('donations records the provider and the spec vocabulary',
    donationCols.has('provider') && donationCols.has('is_anonymous')
    && donationCols.has('message'),
    ['provider', 'is_anonymous', 'message'].filter((c) => !donationCols.has(c)).join(', ')
    || 'all present')
  const donationStates = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'donations'::regclass AND conname = 'donations_status_check'`)
  check('donation statuses are the specification set',
    ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED']
      .every((s) => (donationStates.rows[0]?.def ?? '').includes(s)),
    donationStates.rows[0]?.def)

  const txnCols = await cols('payment_transactions')
  check('payments carry the specification columns',
    ['user_id', 'transaction_id', 'provider_status', 'failure_code', 'event_id', 'metadata']
      .every((c) => txnCols.has(c)) && !txnCols.has('provider_reference'),
    ['user_id', 'transaction_id', 'provider_status', 'failure_code', 'event_id',
      'metadata'].filter((c) => !txnCols.has(c)).join(', ')
    || (txnCols.has('provider_reference') ? 'provider_reference still present' : 'all present'))
  const txnStates = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'payment_transactions'::regclass
       AND conname = 'transactions_status_check'`)
  check('payment statuses are the specification set',
    ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED']
      .every((s) => (txnStates.rows[0]?.def ?? '').includes(s)),
    txnStates.rows[0]?.def)

  const receiptCols = await cols('donation_receipts')
  check('receipts carry amount, currency and donor identity',
    ['amount', 'currency', 'donor_user_id', 'donor_name', 'donor_email', 'updated_at']
      .every((c) => receiptCols.has(c)),
    ['amount', 'currency', 'donor_user_id', 'donor_name', 'donor_email', 'updated_at']
      .filter((c) => !receiptCols.has(c)).join(', ') || 'all present')

  // The webhook idempotency anchor: two rows for one provider event must be
  // impossible once the event id is recorded.
  await db.exec(`INSERT INTO donations (user_id, amount, status)
    VALUES ('${phase4.alumni}', 25.00, 'SUCCESS')`)
  const don1 = await db.query(`SELECT id FROM donations
    WHERE user_id = '${phase4.alumni}' ORDER BY created_at DESC LIMIT 1`)
  await db.exec(`INSERT INTO payment_transactions
    (donation_id, user_id, provider, transaction_id, amount, status, event_id)
    VALUES ('${don1.rows[0].id}', '${phase4.alumni}', 'stripe', 'pi_probe', 25.00,
      'SUCCESS', 'evt_probe')`)
  await rejects('a replayed webhook event cannot create a second row', `
    INSERT INTO payment_transactions
    (donation_id, user_id, provider, transaction_id, amount, status, event_id)
    VALUES ('${don1.rows[0].id}', '${phase4.alumni}', 'stripe', 'pi_probe2', 25.00,
      'SUCCESS', 'evt_probe')`)

  const reportCols = await cols('reports')
  check('reports carry the specification review fields',
    ['description', 'reviewed_by', 'reviewed_at'].every((c) => reportCols.has(c))
    && !['details', 'resolved_by', 'resolved_at', 'resolution']
      .some((c) => reportCols.has(c)),
    `description=${reportCols.has('description')} details=${reportCols.has('details')}`)
  const reportStates = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'reports'::regclass AND conname = 'reports_status_check'`)
  check('report statuses are the specification set',
    ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']
      .every((s) => (reportStates.rows[0]?.def ?? '').includes(s)),
    reportStates.rows[0]?.def)

  const audit = await db.query(
    `SELECT column_name, is_generated FROM information_schema.columns
     WHERE table_name = 'audit_logs'
       AND column_name IN ('target_type', 'target_id', 'timestamp')
     ORDER BY column_name`)
  check('audit logs expose the specification target names as generated aliases',
    audit.rows.length === 3 && audit.rows.every((r) => r.is_generated === 'ALWAYS'),
    audit.rows.length ? audit.rows.map((r) => `${r.column_name}=${r.is_generated}`).join(',')
      : 'none present')

  const moderation = await db.query(`SELECT to_regclass('public.content_moderation') AS reg`)
  check('the content moderation ledger exists', moderation.rows[0].reg !== null,
    moderation.rows[0].reg ?? 'missing')
  await db.exec(`INSERT INTO content_moderation (target_type, target_id, actor_id, reason)
    VALUES ('job', '${pendingJob.rows[0].id}', '${phase4.moderator}', 'spam')`)
  await rejects('a target can only be hidden once', `
    INSERT INTO content_moderation (target_type, target_id, actor_id, reason)
    VALUES ('job', '${pendingJob.rows[0].id}', '${phase4.moderator}', 'again')`)

  const phase6Indexes = [
    'idx_donations_user_created', 'idx_donations_status', 'idx_donation_receipts_user',
    'uq_payment_transactions_provider_txn', 'uq_payment_transactions_provider_event',
    'idx_payment_transactions_user', 'idx_reports_review_queue',
    'idx_audit_logs_action_created', 'uq_content_moderation_target',
  ]
  const present6 = new Set(idx3.rows.map((r) => r.indexname))
  const missing6 = phase6Indexes.filter((n) => !present6.has(n))
  check(`all ${phase6Indexes.length} phase 6 indexes present`, missing6.length === 0,
    missing6.length ? `missing: ${missing6.join(', ')}` : 'none missing')

  console.log('\n--- rollback then forward again ---')
  const down = await files('.down.sql', { downs: true })
  check('every phase 2 migration has a rollback companion', down.length >= 1, `${down.length} file(s)`)
  for (const f of down) {
    const sql = await fs.readFile(path.join(migrationsDir, f), 'utf8')
    try {
      await db.exec(sql)
      check(`reverted ${f}`, true)
    } catch (e) {
      check(`reverted ${f}`, false, e.message)
    }
  }

  const afterDown = await cols('alumni_profiles')
  check('alumni_profiles.major removed by rollback', !afterDown.has('major'))
  check('verification_status retained by rollback', afterDown.has('verification_status'))
  const evtGone = await db.query(
    `SELECT to_regclass('public.alumni_verification_events') AS reg`)
  check('alumni_verification_events dropped by rollback', evtGone.rows[0].reg === null)
  const filesGone = await db.query(
    `SELECT to_regclass('public.stored_files') AS reg`)
  check('stored_files dropped by rollback', filesGone.rows[0].reg === null)
  const survived = await db.query(
    `SELECT resume_url FROM job_applications WHERE id = $1`, [application.rows[0].id])
  check('an application whose attachment was a file survives the rollback',
    /^\/api\/files\/[0-9a-f-]{36}\/download$/.test(survived.rows[0]?.resume_url ?? ''),
    survived.rows[0]?.resume_url ?? 'row missing')
  const restoredStates = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'jobs'::regclass AND conname = 'jobs_status_check'`)
  check('the old job vocabulary is restored by rollback',
    (restoredStates.rows[0]?.def ?? '').includes("'active'"),
    restoredStates.rows[0]?.def)
const restoredIndexes = new Set((await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map((r) => r.indexname))
  check('rollback restores the partial indexes it replaced',
    ['idx_jobs_work_mode', 'idx_jobs_employment_type', 'idx_jobs_experience_level',
      'idx_jobs_deadline', 'idx_jobs_company'].every((n) => restoredIndexes.has(n)))

  // The conversation machinery goes, but the messages it wrapped do not: they keep
  // the sender/recipient pair every Phase 1 query reads, so a rollback costs the
  // thread structure and nothing else.
  const convGone = await db.query(
    `SELECT to_regclass('public.conversation_participants') AS reg`)
  check('conversation_participants dropped by rollback', convGone.rows[0].reg === null)
  const ledgerGone = await db.query(`SELECT to_regclass('public.background_jobs') AS reg`)
  check('the background job ledger dropped by rollback', ledgerGone.rows[0].reg === null)
  const afterDownNotifications = await cols('notifications')
  check('the notification dedupe key dropped by rollback',
    !afterDownNotifications.has('dedupe_key') && !afterDownNotifications.has('metadata'))
  const messageStillReadable = await db.query(
    `SELECT sender_id, recipient_id, body FROM messages WHERE id = $1`,
    [legacyMessage.rows[0].id])
  check('a message survives the rollback as a plain pair',
    messageStillReadable.rows[0]?.body === 'Before conversations existed',
    messageStillReadable.rows[0]?.body ?? 'row missing')
  const restoredEventStates = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'events'::regclass AND conname = 'events_status_check'`)
  check('rollback restores the wider event vocabulary',
    (restoredEventStates.rows[0]?.def ?? '').includes("'removed'"),
    restoredEventStates.rows[0]?.def)

// Only 009 is rolled back above; 001-008 are forward-only and have no .down.sql,
  // so re-applying the whole set would re-run CREATE TABLE roles and fail. Re-applying
  // just the reversible migration is what actually needs to succeed.
for (const reversible of ['009', '012', '013', '014']) {
    try {
      await apply(db, (await files()).filter((f) => f.startsWith(reversible)))
      if (reversible === '009') {
        const back = await cols('alumni_profiles')
        check('009 re-applied cleanly after rollback', back.has('major') && back.has('profile_photo'))
      } else if (reversible === '012') {
        const back4 = await cols('stored_files')
        const states4 = await db.query(
          `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
           WHERE conrelid = 'jobs'::regclass AND conname = 'jobs_status_check'`)
        check('012 re-applied cleanly after rollback',
          back4.has('storage_key') && (states4.rows[0]?.def ?? '').includes('pending_review'))
      } else if (reversible === '013') {
        // Re-applying 013 over data that already went through it is the case a
        // partially applied sequence actually hits, so it is checked against rows
        // that exist rather than an empty table.
        const back5 = await cols('conversations')
        const refolded = await db.query(
          `SELECT COUNT(*)::int AS orphans FROM messages WHERE conversation_id IS NULL`)
        const events5 = await cols('events')
        check('013 re-applied cleanly after rollback',
          back5.has('direct_key') && refolded.rows[0].orphans === 0
            && events5.has('cancelled_by'),
          `orphans=${refolded.rows[0].orphans} cancelled_by=${events5.has('cancelled_by')}`)
      } else {
        const back6 = await cols('donations')
        const audit6 = await db.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'audit_logs' AND column_name = 'target_id'`)
        const moderation6 = await db.query(
          `SELECT to_regclass('public.content_moderation') AS reg`)
        check('014 re-applied cleanly after rollback',
          back6.has('user_id') && back6.has('provider')
            && audit6.rows.length === 1 && moderation6.rows[0].reg !== null,
          `user_id=${back6.has('user_id')} target_id=${audit6.rows.length === 1}
            moderation=${moderation6.rows[0].reg ?? 'missing'}`)
      }
    } catch (e) {
      check(`${reversible} re-applied cleanly after rollback`, false, e.message)
    }
  }

  console.log('\n--- directory indexes exist ---')
  const expectedIndexes = [
    'idx_alumni_directory_verified', 'idx_alumni_directory_graduation',
    'idx_alumni_directory_industry',
    'idx_alumni_directory_company', 'idx_alumni_directory_major',
    'idx_alumni_open_to_mentor', 'idx_alumni_location_lower',
    'idx_student_location_lower', 'idx_student_directory_graduation',
    'idx_student_major_lower', 'idx_users_name_search',
    'idx_users_last_name_prefix', 'idx_users_first_name_prefix',
    'idx_skills_name_prefix', 'idx_skills_category',
    'idx_user_skills_user_skill', 'idx_education_user_year',
    'idx_experience_user_dates', 'idx_social_links_user_platform',
    'idx_privacy_directory_visible', 'idx_verification_events_user',
    'idx_verification_events_reviewer', 'idx_verification_events_status',
  ]
  const idx = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)
  const present = new Set(idx.rows.map((r) => r.indexname))
  const missing = expectedIndexes.filter((n) => !present.has(n))
  check(`all ${expectedIndexes.length} phase 2 indexes present`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : 'none missing')

  // idx_alumni_name_lower was briefly created on alumni_profiles(user_id), which
  // is a duplicate of the primary key under a name claiming a lowercased name
  // column. A dead index costs writes and misleads the next reader, so its
  // absence is asserted rather than left to chance.
  check('no dead idx_alumni_name_lower on user_id', !present.has('idx_alumni_name_lower'),
    present.has('idx_alumni_name_lower') ? 'still present' : 'absent')

  await db.close()
  console.log(`\n${failures === 0 ? 'all schema checks passed' : `${failures} check(s) failed`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
