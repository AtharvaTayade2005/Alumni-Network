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

  // Only 009 is rolled back above; 001-008 are forward-only and have no .down.sql,
  // so re-applying the whole set would re-run CREATE TABLE roles and fail. Re-applying
  // just the reversible migration is what actually needs to succeed.
  try {
    await apply(db, (await files()).filter((f) => f.startsWith('009')))
    const back = await cols('alumni_profiles')
    check('009 re-applied cleanly after rollback', back.has('major') && back.has('profile_photo'))
  } catch (e) {
    check('009 re-applied cleanly after rollback', false, e.message)
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