import { query } from '../config/database.js'

/**
 * Jobs, companies, applications and saved jobs. Row-to-client mapping lives here so
 * the service and the controllers never leak snake_case columns.
 *
 * Two rules run through this file:
 *
 *   * Listing never loops over rows in JavaScript. Anything a list needs for every
 *     row is either a correlated subquery in the same statement or loaded in one
 *     extra query keyed by id, because a board that issues one query per posting
 *     stops being usable at exactly the moment it becomes popular.
 *   * Every ORDER BY ends with the primary key. Two postings created in the same
 *     transaction otherwise have no defined order, and a paginated list that reorders
 *     itself between pages repeats and skips rows.
 */

export function formatCompany(row) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    location: row.location,
    logoUrl: row.logo_url,
    openJobCount: row.open_job_count,
    createdAt: row.created_at,
  }
}

/**
 * A posting, as the API presents it.
 *
 * The status is reported in the upper-case vocabulary the API speaks while the row
 * keeps its lower-case value, so the translation happens in exactly one place and a
 * caller never has to remember which side of the boundary it is on.
 */
export function formatJob(row) {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    companyId: row.company_id,
    companyLogoUrl: row.company_logo_url,
    industry: row.industry,
    description: row.description,
    location: row.location,
    workMode: row.work_mode,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    experienceLevel: row.experience_level,
    applicationUrl: row.application_url,
    deadline: row.deadline,
    status: row.status ? row.status.toUpperCase() : null,
    publishedAt: row.published_at,
    moderation: row.moderated_by ? {
      moderatedBy: row.moderated_by,
      moderatedAt: row.moderated_at,
      moderatorName: row.moderator_name ?? null,
    } : null,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postedBy: row.poster_id ? {
      id: row.poster_id,
      name: row.poster_name,
      avatarUrl: row.poster_avatar_url,
    } : null,
    skills: row.skills ?? [],
    applicationCount: row.application_count,
    hasApplied: row.has_applied ?? false,
    isSaved: row.is_saved ?? false,
  }
}

export function formatApplication(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    companyName: row.company_name,
    status: row.status ? row.status.toUpperCase() : null,
    coverLetter: row.cover_letter,
    /** A link the applicant typed. Null when the resume is a stored file. */
    resumeUrl: row.resume_url,
    externalUrl: row.external_url,
    /**
     * The uploaded resume, if the applicant attached one. Only the metadata and an
     * authorized download path are exposed: the bytes are behind a permission check
     * that also decides whether the poster of the job may read them.
     */
    resume: row.resume_file_id ? {
      id: row.resume_file_id,
      filename: row.resume_filename,
      contentType: row.resume_content_type,
      size: row.resume_byte_size,
      downloadPath: `/api/files/${row.resume_file_id}/download`,
    } : null,
    statusNote: row.status_note,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    applicant: row.applicant_id ? {
      id: row.applicant_id,
      name: row.applicant_name,
      avatarUrl: row.applicant_avatar_url,
      // Only meaningful to the poster of the job and to staff; the service decides
      // who is allowed to ask for a list that includes it.
      email: row.applicant_email,
      headline: row.applicant_headline,
    } : null,
  }
}

/**
 * Everything a posting needs, in one statement.
 *
 * `viewer` appears twice as a correlated EXISTS so `hasApplied` and `isSaved` cost no
 * extra round trip. They are written as EXISTS rather than LEFT JOIN on a derived
 * table so a posting the viewer has not touched costs an index probe, not a join.
 */
function jobSelect(viewerPlaceholder = 1) {
  return `
  j.*,
  c.logo_url AS company_logo_url,
  u.id AS poster_id, u.first_name || ' ' || u.last_name AS poster_name,
  u.avatar_url AS poster_avatar_url,
  -- Selected for notification email only. formatJob never copies it into a response,
  -- so it stays a server-side value even though the row carries it.
  u.email AS poster_email,
  m.first_name || ' ' || m.last_name AS moderator_name,
  (SELECT COUNT(*)::int FROM job_applications a WHERE a.job_id = j.id) AS application_count,
  EXISTS (SELECT 1 FROM job_applications a2
          WHERE a2.job_id = j.id AND a2.applicant_id = $${viewerPlaceholder}) AS has_applied,
  EXISTS (SELECT 1 FROM saved_jobs s
          WHERE s.job_id = j.id AND s.user_id = $${viewerPlaceholder}) AS is_saved
`
}

const JOB_JOINS = `
  FROM jobs j
  LEFT JOIN companies c ON c.id = j.company_id
  JOIN users u ON u.id = j.posted_by
  LEFT JOIN users m ON m.id = j.moderated_by
`

export async function createJob(data) {
  const { rows } = await query(
    `INSERT INTO jobs (
       posted_by, company_id, company_name, title, description, location, industry,
       work_mode, employment_type, salary_min, salary_max, salary_currency,
       experience_level, application_url, deadline, status, moderated_by, moderated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      data.postedBy, data.companyId ?? null, data.companyName, data.title,
      data.description, data.location ?? null, data.industry ?? null,
      data.workMode, data.employmentType, data.salaryMin ?? null,
      data.salaryMax ?? null, data.salaryCurrency, data.experienceLevel,
      data.applicationUrl ?? null, data.deadline ?? null, data.status,
      // Set only when the caller is a moderator publishing at creation time. The
      // trigger refuses to publish a posting with nobody attributed to the decision.
      data.moderatedBy ?? null, data.moderatedBy ? new Date() : null,
    ],
  )
  return rows[0].id
}

/**
 * One posting.
 *
 * The viewer is $1 and the id is $2, so `jobSelect(1)`. Passing a placeholder the
 * statement never mentions leaves the unused parameter untyped, and PostgreSQL rejects
 * the whole query with "could not determine data type of parameter $1" rather than
 * quietly ignoring it.
 */
export async function findJobById(id, viewerId) {
  const { rows } = await query(
    `SELECT ${jobSelect(1)} ${JOB_JOINS} WHERE j.id = $2`, [viewerId ?? null, id],
  )
  return rows[0] ?? null
}

/**
 * A content edit.
 *
 * Deliberately does not write `status` or the moderation columns: a posting's state is
 * changed through `setJobStatus`, which is the only path that can attribute a
 * decision. Leaving them out of this statement also means editing a posting cannot
 * trip the moderation trigger, because the trigger never fires on columns that are
 * not being set.
 */
export async function updateJob(id, data) {
  const { rows } = await query(
    `UPDATE jobs SET
       company_id = $2, company_name = $3, title = $4, description = $5,
       location = $6, industry = $7, work_mode = $8, employment_type = $9,
       salary_min = $10, salary_max = $11, salary_currency = $12,
       experience_level = $13, application_url = $14, deadline = $15, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [
      id, data.companyId ?? null, data.companyName, data.title, data.description,
      data.location ?? null, data.industry ?? null, data.workMode, data.employmentType,
      data.salaryMin ?? null, data.salaryMax ?? null, data.salaryCurrency,
      data.experienceLevel, data.applicationUrl ?? null, data.deadline ?? null,
    ],
  )
  return rows[0] ?? null
}

export async function deleteJob(id) {
  const { rows } = await query('DELETE FROM jobs WHERE id = $1 RETURNING id', [id])
  return rows.length > 0
}

/**
 * Moves a posting to a new state.
 *
 * `moderatedBy` is written only when a decision is being attributed. Every other
 * transition leaves the existing attribution alone, which matters because the trigger
 * deliberately leaves `moderated_by` untouched for DRAFT, PENDING_REVIEW and CLOSED: a
 * poster closing their own live posting must not erase the moderator who approved it,
 * and a resubmission must not forget the decision it is being reviewed against.
 */
export async function setJobStatus(id, status, { moderatedBy = null } = {}) {
  const { rows } = await query(
    `UPDATE jobs SET status = $2,
       moderated_by = COALESCE($3::uuid, moderated_by),
       moderated_at = CASE WHEN $3::uuid IS NULL THEN moderated_at ELSE NOW() END,
       updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [id, status, moderatedBy],
  )
  return rows[0] ?? null
}

export async function incrementViewCount(id) {
  await query('UPDATE jobs SET view_count = view_count + 1 WHERE id = $1', [id])
}

/**
 * The board.
 *
 * Filters are collected as clauses with their own values, then rendered twice: once
 * numbered after the viewer placeholder for the page query, and once from $1 for the
 * count. Both renderings share one counter so a multi-value clause such as the skills
 * filter consumes exactly as many placeholders as it has values.
 */
export async function listJobs(viewerId, filters) {
  const conditions = []
  const add = (clause, ...values) => conditions.push({ clause, values })

  // The public board only ever shows published postings. "My postings" is the
  // caller's own view of their work and deliberately shows every state.
  if (filters.postedByMe) {
    add('j.posted_by = ?', viewerId)
  } else if (filters.status) {
    add('j.status = ?', filters.status)
  } else {
    add('j.status = ?', 'published')
  }

  if (filters.workMode) add('j.work_mode = ?', filters.workMode)
  if (filters.employmentType) add('j.employment_type = ?', filters.employmentType)
  if (filters.experienceLevel) add('j.experience_level = ?', filters.experienceLevel)
  if (filters.industry) add('LOWER(j.industry) = LOWER(?)', filters.industry)
  if (filters.company) add('LOWER(j.company_name) LIKE LOWER(?)', `%${filters.company}%`)
  if (filters.location) add('LOWER(j.location) LIKE LOWER(?)', `%${filters.location}%`)

  if (filters.search) {
    // Four columns are searched, so the value is repeated per placeholder.
    const like = `%${filters.search}%`
    add(`(j.title ILIKE ? OR j.company_name ILIKE ? OR j.description ILIKE ?
          OR COALESCE(j.industry,'') ILIKE ?)`,
    like, like, like, like)
  }

  /**
   * Every listed skill has to be on the posting.
   *
   * One EXISTS per skill rather than a count comparison, because the second form cannot
   * express "at least these" without also allowing a posting to satisfy the requirement
   * with skills nobody asked for.
   *
   * Written as EXISTS over a subquery rather than as NOT EXISTS over the same join:
   * PGlite, which the test and development database both run on, evaluates the two forms
   * of this correlated subquery inconsistently and answers NOT EXISTS with the opposite
   * of the truth. This form is correct on both engines.
   */
  for (const skill of filters.skills ?? []) {
    add(`EXISTS (SELECT 1 FROM job_skills js
                  WHERE js.job_id = j.id
                    AND js.skill_id IN (SELECT s.id FROM skills s WHERE LOWER(s.name) = LOWER(?)))`,
    skill)
  }

  /**
   * Salary is an overlap test.
   *
   * A posting whose range crosses the requested one matches, and a posting with an
   * open-ended end matches anything on that side: "at least 80k" has to include the
   * posting that says "80k plus".
   */
  if (filters.salaryMin != null) {
    add('(j.salary_max IS NULL OR j.salary_max >= ?)', filters.salaryMin)
  }
  if (filters.salaryMax != null) {
    add('(j.salary_min IS NULL OR j.salary_min <= ?)', filters.salaryMax)
  }

  if (filters.deadline) add('j.deadline <= ?', filters.deadline)
  if (filters.openOnly) add('(j.deadline IS NULL OR j.deadline >= NOW())')

  const renderAll = (start) => {
    let offset = start
    return conditions
      .map((c) => c.clause.replace(/\?/g, () => `$${offset++}`))
      .join(' AND ')
  }

  const conditionValues = conditions.flatMap((c) => c.values)
  const where = conditions.length ? `WHERE ${renderAll(2)}` : ''
  const dataParams = [viewerId ?? null, ...conditionValues]

  const orderBy = {
    newest: 'j.created_at DESC',
    oldest: 'j.created_at ASC',
    title: 'j.title ASC',
    deadline: 'j.deadline ASC NULLS LAST',
    salary: 'j.salary_max DESC NULLS LAST',
  }[filters.sort] ?? 'j.created_at DESC'

  const { rows: counts } = await query(
    `SELECT COUNT(*)::int AS c FROM jobs j
     ${conditions.length ? `WHERE ${renderAll(1)}` : ''}`,
    conditionValues,
  )
  const { rows } = await query(
    `SELECT ${jobSelect()} ${JOB_JOINS} ${where}
     ORDER BY ${orderBy}, j.id DESC
     LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`,
    [...dataParams, filters.limit, filters.offset],
  )

  return { rows, total: counts[0].c }
}

/**
 * Resolves a company by name, creating it when missing. Requires the unique index on
 * LOWER(name) added in migration 006 for this to be atomic under concurrent posting.
 */
export async function findOrCreateCompany(data) {
  const { rows } = await query(
    `INSERT INTO companies (name, website, industry, location, logo_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [data.name, data.website ?? null, data.industry ?? null,
      data.location ?? null, data.logoUrl ?? null],
  )
  if (rows[0]) return rows[0]

  const { rows: existing } = await query(
    'SELECT * FROM companies WHERE LOWER(name) = LOWER($1) ORDER BY created_at LIMIT 1',
    [data.name],
  )
  return existing[0] ?? null
}

export async function listCompanies({ search, limit = 20, offset = 0 }) {
  const conditions = []
  const params = []
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(name ILIKE $${params.length} OR industry ILIKE $${params.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows: counts } = await query(
    `SELECT COUNT(*)::int AS c FROM companies ${where}`, params,
  )
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM jobs j
                   WHERE j.company_id = c.id AND j.status = 'published') AS open_job_count
     FROM companies c ${where}
     ORDER BY c.name ASC, c.id ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return { rows, total: counts[0].c }
}

export async function findCompanyById(id) {
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM jobs j
                   WHERE j.company_id = c.id AND j.status = 'published') AS open_job_count
     FROM companies c WHERE c.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/** Published postings for one company. The viewer is $1 and the company is $2. */
export async function listCompanyJobs(companyId, viewerId, { limit, offset }) {
  const { rows } = await query(
    `SELECT ${jobSelect(1)} ${JOB_JOINS}
     WHERE j.company_id = $2 AND j.status = 'published'
     ORDER BY j.created_at DESC, j.id DESC LIMIT $3 OFFSET $4`,
    [viewerId ?? null, companyId, limit, offset],
  )
  return rows
}

/**
 * Links skills to a job by name, creating any that do not exist yet. Relies on the
 * unique index on skills(LOWER(name)) from the initial schema.
 */
export async function attachSkills(jobId, skillNames) {
  if (!skillNames?.length) return
  await query(
    `INSERT INTO skills (name) VALUES
       ${skillNames.map((_, i) => `($${i + 1})`).join(', ')}
     ON CONFLICT DO NOTHING`,
    skillNames,
  )
  await query(
    `INSERT INTO job_skills (job_id, skill_id)
     SELECT $1, s.id FROM skills s
     WHERE LOWER(s.name) = ANY(SELECT LOWER(x) FROM unnest($2::text[]) AS x)
     ON CONFLICT DO NOTHING`,
    [jobId, skillNames],
  )
}

export async function listJobSkills(jobId) {
  const { rows } = await query(
    `SELECT s.id, s.name FROM job_skills js
     JOIN skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY s.name`,
    [jobId],
  )
  return rows
}

/**
 * Skills for a whole page of postings, in one query.
 *
 * `unnest` with an ordinality join maps every skill back to its posting, which is what
 * lets a 20-row board be rendered with two statements instead of twenty-one.
 */
export async function listSkillsForJobs(jobIds) {
  if (!jobIds.length) return new Map()
  const { rows } = await query(
    `SELECT js.job_id, s.id, s.name
     FROM unnest($1::uuid[]) WITH ORDINALITY AS t(job_id, ord)
     JOIN job_skills js ON js.job_id = t.job_id
     JOIN skills s ON s.id = js.skill_id
     ORDER BY t.ord, s.name`,
    [jobIds],
  )
  const byJob = new Map(jobIds.map((id) => [id, []]))
  for (const row of rows) byJob.get(row.job_id)?.push({ id: row.id, name: row.name })
  return byJob
}

/**
 * Applies skills to a list of postings in the shape `formatJob` expects.
 *
 * Mutates the rows because they are already in hand and the caller wants them
 * formatted; returning a new array of copies would only cost allocations.
 */
export function attachSkillsToRows(rows, skillsByJob) {
  for (const row of rows) row.skills = skillsByJob.get(row.id) ?? []
  return rows
}

export async function createApplication(data) {
  const { rows } = await query(
    `INSERT INTO job_applications
       (job_id, applicant_id, cover_letter, resume_file_id, resume_url, external_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,'submitted')
     RETURNING id`,
    [data.jobId, data.applicantId, data.coverLetter ?? null,
      data.resumeFileId ?? null, data.resumeUrl ?? null, data.externalUrl ?? null],
  )
  return rows[0]
}

/**
 * A review move.
 *
 * `reviewedBy` is written for every reviewed state because the trigger refuses a
 * move into one that names nobody, and it is written as NULL for a move back to
 * SUBMITTED or WITHDRAWN so a stale reviewer is not left attributed to a state they
 * did not decide.
 */
export async function updateApplicationStatus(id, status, { reviewedBy = null, note = null } = {}) {
  const { rows } = await query(
    `UPDATE job_applications
     SET status = $2,
         reviewed_by = CASE WHEN $3::uuid IS NULL THEN NULL ELSE $3 END,
         reviewed_at = CASE WHEN $3::uuid IS NULL THEN NULL ELSE NOW() END,
         status_note = COALESCE($4, status_note),
         updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, status, reviewedBy, note],
  )
  return rows[0] ?? null
}

/**
 * An application with its posting, applicant and resume metadata joined in.
 *
 * The applicant's email is selected here but only ever returned to the poster of the
 * job or to staff, which the service checks; selecting it unconditionally keeps one
 * statement serving both callers rather than two nearly identical ones.
 */
const APPLICATION_SELECT = `
  a.*, j.title AS job_title, j.company_name,
  u.id AS applicant_id, u.first_name || ' ' || u.last_name AS applicant_name,
  u.avatar_url AS applicant_avatar_url, u.email AS applicant_email,
  COALESCE(ap.current_position, sp.degree) AS applicant_headline,
  f.original_filename AS resume_filename,
  f.content_type AS resume_content_type,
  f.byte_size AS resume_byte_size
`

const APPLICATION_JOINS = `
  FROM job_applications a
  JOIN jobs j ON j.id = a.job_id
  JOIN users u ON u.id = a.applicant_id
  LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
  LEFT JOIN student_profiles sp ON sp.user_id = u.id
  LEFT JOIN stored_files f ON f.id = a.resume_file_id
`

export async function findApplicationById(id) {
  const { rows } = await query(
    `SELECT ${APPLICATION_SELECT} ${APPLICATION_JOINS} WHERE a.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findApplicationForJob(jobId, applicantId) {
  const { rows } = await query(
    `SELECT * FROM job_applications WHERE job_id = $1 AND applicant_id = $2`,
    [jobId, applicantId],
  )
  return rows[0] ?? null
}

/**
 * Applications for one posting, newest first.
 *
 * The optional status filter is validated against the pipeline by the service before it
 * reaches here, so this statement is not the place where an unknown state would be
 * noticed.
 */
export async function listApplicationsForJob(jobId, { limit, offset, status }) {
  const params = [jobId]
  const conditions = ['a.job_id = $1']
  if (status) {
    params.push(status)
    conditions.push(`a.status = $${params.length}`)
  }
  const where = `WHERE ${conditions.join(' AND ')}`

  const { rows: counts } = await query(
    `SELECT COUNT(*)::int AS c ${APPLICATION_JOINS} ${where}`, params,
  )
  const { rows } = await query(
    `SELECT ${APPLICATION_SELECT} ${APPLICATION_JOINS} ${where}
     ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return { rows, total: counts[0].c }
}

/** Applications the given user submitted, newest first. */
export async function listMyApplications(applicantId, { limit, offset, status, jobId }) {
  const params = [applicantId]
  const conditions = ['a.applicant_id = $1']
  if (status) {
    params.push(status)
    conditions.push(`a.status = $${params.length}`)
  }
  if (jobId) {
    params.push(jobId)
    conditions.push(`a.job_id = $${params.length}`)
  }
  const where = `WHERE ${conditions.join(' AND ')}`

  const { rows: counts } = await query(
    `SELECT COUNT(*)::int AS c ${APPLICATION_JOINS} ${where}`, params,
  )
  const { rows } = await query(
    `SELECT ${APPLICATION_SELECT} ${APPLICATION_JOINS} ${where}
     ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  )
  return { rows, total: counts[0].c }
}

export async function saveJob(userId, jobId) {
  const { rows } = await query(
    `INSERT INTO saved_jobs (user_id, job_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING RETURNING job_id`,
    [userId, jobId],
  )
  return rows.length > 0
}

export async function unsaveJob(userId, jobId) {
  const { rows } = await query(
    'DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2 RETURNING job_id',
    [userId, jobId],
  )
  return rows.length > 0
}

/**
 * Saved postings.
 *
 * A saved posting that has since been closed or taken down is still listed: the point
 * of saving one is to notice it went away, and hiding it would leave the member
 * wondering where it went. Its state is in the payload.
 */
export async function listSavedJobs(userId, { limit, offset }) {
  const { rows: counts } = await query(
    'SELECT COUNT(*)::int AS c FROM saved_jobs WHERE user_id = $1', [userId],
  )
  const { rows } = await query(
    `SELECT ${jobSelect(1)} ${JOB_JOINS} JOIN saved_jobs s ON s.job_id = j.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC, j.id DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return { rows, total: counts[0].c }
}
