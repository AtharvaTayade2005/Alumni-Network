import { query } from '../config/database.js'
import { badRequest, notFound } from '../utils/errors.js'

export function isValidLatitude(value) {
  return typeof value === 'number' && value >= -90 && value <= 90
}

export function isValidLongitude(value) {
  return typeof value === 'number' && value >= -180 && value <= 180
}

/** Upserts a profile row, so registration and later editing share one path. */
export async function upsertAlumniProfile(userId, data) {
  if ((data.latitude == null) !== (data.longitude == null)) {
    throw badRequest('Latitude and longitude must be provided together')
  }

  const { rows } = await query(
    `INSERT INTO alumni_profiles (
       user_id, graduation_year, degree, department,
       current_company, current_position, industry, bio,
       city, region, country, latitude, longitude,
       is_open_to_mentor, mentorship_capacity, show_on_map
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )
     ON CONFLICT (user_id) DO UPDATE SET
       graduation_year = COALESCE(EXCLUDED.graduation_year, alumni_profiles.graduation_year),
       degree = COALESCE(EXCLUDED.degree, alumni_profiles.degree),
       department = COALESCE(EXCLUDED.department, alumni_profiles.department),
       current_company = COALESCE(EXCLUDED.current_company, alumni_profiles.current_company),
       current_position = COALESCE(EXCLUDED.current_position, alumni_profiles.current_position),
       industry = COALESCE(EXCLUDED.industry, alumni_profiles.industry),
       bio = COALESCE(EXCLUDED.bio, alumni_profiles.bio),
       city = COALESCE(EXCLUDED.city, alumni_profiles.city),
       region = COALESCE(EXCLUDED.region, alumni_profiles.region),
       country = COALESCE(EXCLUDED.country, alumni_profiles.country),
       latitude = COALESCE(EXCLUDED.latitude, alumni_profiles.latitude),
       longitude = COALESCE(EXCLUDED.longitude, alumni_profiles.longitude),
       is_open_to_mentor = COALESCE(EXCLUDED.is_open_to_mentor, alumni_profiles.is_open_to_mentor),
       mentorship_capacity = COALESCE(EXCLUDED.mentorship_capacity, alumni_profiles.mentorship_capacity),
       show_on_map = COALESCE(EXCLUDED.show_on_map, alumni_profiles.show_on_map)
     RETURNING *`,
    [
      userId,
      data.graduationYear ?? null,
      data.degree ?? null,
      data.department ?? null,
      data.currentCompany ?? null,
      data.currentPosition ?? null,
      data.industry ?? null,
      data.bio ?? null,
      data.city ?? null,
      data.region ?? null,
      data.country ?? null,
      data.latitude ?? null,
      data.longitude ?? null,
      data.isOpenToMentor ?? false,
      data.mentorshipCapacity ?? 1,
      data.showOnMap ?? false,
    ],
  )
  return rows[0]
}

/**
 * Writes the 001 student columns, creating the row when it is missing.
 *
 * `degree` is the one student column that is NOT NULL without a default, and
 * PostgreSQL checks NOT NULL against the tuple an INSERT proposes *before* it
 * resolves ON CONFLICT. A partial update that leaves degree out would therefore
 * fail with 23502 even though the row exists and the DO UPDATE branch would have
 * preserved the column. The proposed tuple is given the stored value as its
 * fallback so a partial write behaves like the COALESCE it already is.
 */
export async function upsertStudentProfile(userId, data) {
  const { rows } = await query(
    `INSERT INTO student_profiles (
       user_id, degree, department, year_of_study, expected_graduation,
       career_interests, bio, is_open_to_mentorship, city, region, country
     ) VALUES (
       $1,
       COALESCE($2, (SELECT degree FROM student_profiles WHERE user_id = $1)),
       $3, $4, $5, $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (user_id) DO UPDATE SET
       degree = COALESCE(EXCLUDED.degree, student_profiles.degree),
       department = COALESCE(EXCLUDED.department, student_profiles.department),
       year_of_study = COALESCE(EXCLUDED.year_of_study, student_profiles.year_of_study),
       expected_graduation = COALESCE(EXCLUDED.expected_graduation, student_profiles.expected_graduation),
       career_interests = COALESCE(EXCLUDED.career_interests, student_profiles.career_interests),
       bio = COALESCE(EXCLUDED.bio, student_profiles.bio),
       is_open_to_mentorship = COALESCE(EXCLUDED.is_open_to_mentorship, student_profiles.is_open_to_mentorship),
       city = COALESCE(EXCLUDED.city, student_profiles.city),
       region = COALESCE(EXCLUDED.region, student_profiles.region),
       country = COALESCE(EXCLUDED.country, student_profiles.country)
     RETURNING *`,
    [
      userId,
      data.degree ?? null,
      data.department ?? null,
      data.yearOfStudy ?? null,
      data.expectedGraduation ?? null,
      data.careerInterests ?? null,
      data.bio ?? null,
      data.isOpenToMentorship ?? true,
      data.city ?? null,
      data.region ?? null,
      data.country ?? null,
    ],
  )
  return rows[0]
}

export async function findAlumniProfileByUserId(userId) {
  const { rows } = await query(
    'SELECT * FROM alumni_profiles WHERE user_id = $1', [userId],
  )
  return rows[0] ?? null
}

export async function findStudentProfileByUserId(userId) {
  const { rows } = await query(
    'SELECT * FROM student_profiles WHERE user_id = $1', [userId],
  )
  return rows[0] ?? null
}

export async function setVerificationStatus(userId, status, { verifiedBy, notes }) {
  const table = await resolveProfileTable(userId)
  const { rows } = await query(
    `UPDATE ${table}
     SET verification_status = $2,
         verified_by = $3,
         verified_at = NOW(),
         verification_notes = $4
     WHERE user_id = $1
     RETURNING *`,
    [userId, status, verifiedBy ?? null, notes ?? null],
  )
  if (!rows[0]) throw notFound('Profile')
  return rows[0]
}

async function resolveProfileTable(userId) {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM alumni_profiles WHERE user_id = $1) AS is_alumni,
            EXISTS (SELECT 1 FROM student_profiles WHERE user_id = $1) AS is_student`,
    [userId],
  )
  if (rows[0].is_alumni) return 'alumni_profiles'
  if (rows[0].is_student) return 'student_profiles'
  throw notFound('Profile')
}

export async function ensurePrivacySettings(userId) {
  const { rows } = await query(
    `INSERT INTO privacy_settings (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId],
  )
  return rows[0]
}

export async function updatePrivacySettings(userId, data) {
  await ensurePrivacySettings(userId)
  const map = {
    showEmail: 'show_email',
    showPhone: 'show_phone',
    showLocation: 'show_location',
    showEmployer: 'show_employer',
    showSocialLinks: 'show_social_links',
    showProfileInDirectory: 'show_profile_in_directory',
    showMentorshipAvailability: 'show_mentorship_availability',
    allowConnectionRequests: 'allow_connection_requests',
    allowMessagesFrom: 'allow_messages_from',
  }
  const entries = Object.entries(data).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return ensurePrivacySettings(userId)

  const sets = entries.map(([key], i) => `${map[key]} = $${i + 2}`)
  const values = entries.map(([, v]) => v)

  const { rows } = await query(
    `UPDATE privacy_settings SET ${sets.join(', ')} WHERE user_id = $1 RETURNING *`,
    [userId, ...values],
  )
  return rows[0]
}

export async function getPrivacySettings(userId) {
  const { rows } = await query(
    'SELECT * FROM privacy_settings WHERE user_id = $1', [userId],
  )
  return rows[0] ?? null
}

export async function getPrivacySettingsMap(userIds) {
  if (!userIds.length) return new Map()
  const { rows } = await query(
    'SELECT * FROM privacy_settings WHERE user_id = ANY($1::UUID[])', [userIds],
  )
  return new Map(rows.map((r) => [r.user_id, r]))
}

export async function syncSkills(userId, skillNames) {
  // Deduplicate on the lowercase key so the unique index on LOWER(name) is not
  // hit twice, but keep the caller's original casing for display.
  const byKey = new Map()
  for (const raw of skillNames ?? []) {
    const original = String(raw).trim()
    const key = original.toLowerCase()
    if (key && !byKey.has(key)) byKey.set(key, original)
  }
  const display = [...byKey.values()]
  const keys = [...byKey.keys()]

  if (keys.length === 0) {
    await query('DELETE FROM user_skills WHERE user_id = $1', [userId])
    return []
  }

  // Upsert on the functional unique index so a name entered as "typescript"
  // is corrected to "TypeScript" rather than duplicated.
  await query(
    `INSERT INTO skills (name)
     SELECT UNNEST($1::TEXT[])
     ON CONFLICT (LOWER(name)) DO UPDATE SET name = EXCLUDED.name`,
    [display],
  )

  await query(
    `DELETE FROM user_skills
     WHERE user_id = $1
       AND skill_id NOT IN (
         SELECT id FROM skills WHERE LOWER(name) = ANY($2::TEXT[])
       )`,
    [userId, keys],
  )

  await query(
    `INSERT INTO user_skills (user_id, skill_id)
     SELECT $1, id FROM skills WHERE LOWER(name) = ANY($2::TEXT[])
     ON CONFLICT (user_id, skill_id) DO NOTHING`,
    [userId, keys],
  )

  return getSkillsForUser(userId)
}

export async function getSkillsForUser(userId) {
  const { rows } = await query(
    `SELECT s.id, s.name, s.category, us.proficiency
     FROM user_skills us JOIN skills s ON s.id = us.skill_id
     WHERE us.user_id = $1 ORDER BY s.name`,
    [userId],
  )
  return rows
}

export async function listSkills({ search, limit = 50 }) {
  const { rows } = await query(
    `SELECT id, name, category FROM skills
     WHERE ($1::TEXT IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY name LIMIT $2`,
    [search ?? null, limit],
  )
  return rows
}

export async function upsertCompany({ name, website, industry, location }) {
  const { rows } = await query(
    `INSERT INTO companies (name, website, industry, location)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [name, website ?? null, industry ?? null, location ?? null],
  )
  return rows[0] ?? null
}

export async function listEducation(userId) {
  const { rows } = await query(
    'SELECT * FROM education WHERE user_id = $1 ORDER BY COALESCE(end_year, 9999) DESC',
    [userId],
  )
  return rows
}

export async function addEducation(userId, data) {
  const { rows } = await query(
    `INSERT INTO education (user_id, institution, degree, field_of_study,
       start_year, end_year, grade, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, data.institution, data.degree ?? null, data.fieldOfStudy ?? null,
      data.startYear ?? null, data.endYear ?? null, data.grade ?? null,
      data.description ?? null],
  )
  return rows[0]
}

export async function deleteEducation(userId, educationId) {
  const { rowCount } = await query(
    'DELETE FROM education WHERE id = $1 AND user_id = $2', [educationId, userId],
  )
  if (!rowCount) throw notFound('Education entry')
}

export async function listExperience(userId) {
  const { rows } = await query(
    `SELECT e.*, c.logo_url, c.industry
     FROM experience e LEFT JOIN companies c ON c.id = e.company_id
     WHERE e.user_id = $1
     ORDER BY e.is_current DESC, COALESCE(e.end_date, '9999-12-31') DESC`,
    [userId],
  )
  return rows
}

export async function addExperience(userId, data) {
  const { rows } = await query(
    `INSERT INTO experience (user_id, company_id, company_name, title, location,
       description, employment_type, is_current, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *, company, job_title`,
    [userId, data.companyId ?? null, data.companyName, data.title,
      data.location ?? null, data.description ?? null,
      data.employmentType ?? null, data.isCurrent ?? false,
      data.startDate ?? null, data.endDate ?? null],
  )
  return rows[0]
}

export async function deleteExperience(userId, experienceId) {
  const { rowCount } = await query(
    'DELETE FROM experience WHERE id = $1 AND user_id = $2', [experienceId, userId],
  )
  if (!rowCount) throw notFound('Experience entry')
}

export async function listSocialLinks(userId) {
  const { rows } = await query(
    'SELECT * FROM social_links WHERE user_id = $1 ORDER BY is_primary DESC, platform',
    [userId],
  )
  return rows
}

export async function upsertSocialLink(userId, data) {
  const { rows } = await query(
    `INSERT INTO social_links (user_id, platform, url, is_primary)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, platform) DO UPDATE SET
       url = EXCLUDED.url, is_primary = EXCLUDED.is_primary
     RETURNING *`,
    [userId, data.platform, data.url, data.isPrimary ?? false],
  )
  return rows[0]
}

export async function deleteSocialLink(userId, linkId) {
  const { rowCount } = await query(
    'DELETE FROM social_links WHERE id = $1 AND user_id = $2', [linkId, userId],
  )
  if (!rowCount) throw notFound('Social link')
}

export async function getProfileBundle(userId) {
  const [alumni, student, education, experience, socialLinks, skills, privacy] =
    await Promise.all([
      findAlumniProfileByUserId(userId),
      findStudentProfileByUserId(userId),
      listEducation(userId),
      listExperience(userId),
      listSocialLinks(userId),
      getSkillsForUser(userId),
      getPrivacySettings(userId),
    ])

  return {
    alumni,
    student,
    education,
    experience,
    socialLinks,
    skills,
    privacy: privacy ?? (await ensurePrivacySettings(userId)),
  }
}
