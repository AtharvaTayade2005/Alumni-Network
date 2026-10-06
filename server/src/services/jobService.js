import * as jobModel from '../models/jobModel.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import * as fileService from './fileService.js'
import * as notificationService from './notificationService.js'
import * as auditService from './auditService.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js'
import { ROLES, hasAnyRole } from '../middleware/rbac.js'

/**
 * The job board: postings, moderation, applications and saved jobs.
 *
 * The board's contract, and the reason this file is mostly rules:
 *
 *   * A posting is not live until a moderator says so. An alumnus posting enters
 *     PENDING_REVIEW; only a moderator or administrator may move anything into
 *     PUBLISHED or REJECTED. The database enforces the same rule with a trigger, so
 *     this is defence in depth rather than the only guard.
 *   * The board is public and read-only except for its own states. A reader sees
 *     PUBLISHED postings; DRAFT, PENDING_REVIEW, REJECTED and CLOSED are visible to
 *     their poster and to staff.
 *   * A resume is the applicant's. It is attached by file id, not by URL, and reading
 *     it is a separate decision from writing it (see fileService).
 *
 * States are stored lower case and presented upper case. The translation is confined to
 * `toStoredStatus` and the model's formatter, so no caller has to remember which side
 * of the boundary it is on.
 */

const POSTER_ROLES = [ROLES.ALUMNI, ROLES.MODERATOR, ROLES.ADMIN]
const MODERATOR_ROLES = [ROLES.MODERATOR, ROLES.ADMIN]

/** Posting states, as the database stores them. */
const JOB_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  REJECTED: 'rejected',
}

/** Application states, as the database stores them. */
const APPLICATION_STATUS = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  SHORTLISTED: 'shortlisted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
}

/**
 * Which transitions each side of the board may make.
 *
 * `staffOnly` transitions are the moderation decisions. Everything else is a poster
 * managing their own posting. Keeping this as data rather than as scattered
 * `if` statements means the whole workflow can be read at once, and an unlisted
 * transition is refused rather than falling through to "allowed".
 */
const JOB_TRANSITIONS = {
  DRAFT: { PENDING_REVIEW: { who: 'owner' } },
  PENDING_REVIEW: {
    PUBLISHED: { who: 'staff', decision: true },
    REJECTED: { who: 'staff', decision: true },
    DRAFT: { who: 'owner' },
  },
  PUBLISHED: {
    CLOSED: { who: 'owner' },
    PENDING_REVIEW: { who: 'owner' },
    // A live posting can still be pulled by staff. The old moderation endpoint could
    // remove anything, and a moderator who finds a live posting they should not have
    // approved has to be able to say so without going through the owner.
    REJECTED: { who: 'staff', decision: true },
  },
  CLOSED: {
    PUBLISHED: { who: 'staff', decision: true },
  },
  REJECTED: {
    PENDING_REVIEW: { who: 'owner' },
  },
}

/** API status name to stored value. The validator has already normalised the case. */
function toStoredStatus(apiStatus) {
  const key = String(apiStatus).toUpperCase()
  const value = JOB_STATUS[key]
  if (!value) throw badRequest(`Unknown job status: ${apiStatus}`)
  return value
}

function toStoredApplicationStatus(apiStatus) {
  const key = String(apiStatus).toUpperCase()
  const value = APPLICATION_STATUS[key]
  if (!value) throw badRequest(`Unknown application status: ${apiStatus}`)
  return value
}

/** Human wording for a stored status, used in notifications. */
function readable(status) {
  return String(status).toLowerCase().replace(/_/g, ' ')
}

function isStaff(user) {
  return hasAnyRole(user, MODERATOR_ROLES)
}

/** Loads a job, throwing when missing. */
async function loadJob(id, viewerId = null) {
  const job = await jobModel.findJobById(id, viewerId)
  if (!job) throw notFound('Job')
  return job
}

/**
 * Loads a job the caller may change.
 *
 * Staff may edit any posting so they can fix a broken one during moderation; that is a
 * deliberate exception, and it is recorded in the audit log by the caller.
 */
async function loadEditableJob(id, user) {
  const job = await loadJob(id, user.id)
  if (job.posted_by !== user.id && !isStaff(user)) {
    throw forbidden('You can only manage your own postings')
  }
  return job
}

/**
 * A posting as its owner or as staff may see it; a reader may not.
 *
 * A posting the caller may not see is reported as missing rather than forbidden: the
 * board does not confirm that a draft exists to somebody who has no business knowing.
 */
async function loadVisibleJob(id, user) {
  const job = await loadJob(id, user?.id ?? null)
  if (job.status === JOB_STATUS.PUBLISHED) return job
  if (canSeeUnpublished(job, user)) return job
  throw notFound('Job')
}

function canSeeUnpublished(job, user) {
  if (!user) return false
  return job.posted_by === user.id || isStaff(user)
}

/** Skills for a page of postings, loaded in one query. */
async function withSkills(rows) {
  const skillsByJob = await jobModel.listSkillsForJobs(rows.map((r) => r.id))
  return jobModel.attachSkillsToRows(rows, skillsByJob)
}

/**
 * The paging block every list response carries.
 *
 * `pages` is at least 1 so a client rendering "page 1 of N" does not have to special
 * case an empty result set.
 */
function pagination(filters, total) {
  const limit = filters.limit ?? 20
  return {
    total,
    page: filters.page ?? 1,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  }
}

/**
 * Creates a posting.
 *
 * An alumnus posting always enters review, never live, whatever they ask for: a client
 * sending `status: PUBLISHED` because an older API accepted it does not get to skip
 * moderation. A moderator may still publish at creation time, which is what makes staff
 * able to fix the board without waiting for a second pair of eyes.
 */
export async function createJob(user, payload, context = {}) {
  if (!hasAnyRole(user, POSTER_ROLES)) {
    throw forbidden('Only alumni and staff can post jobs')
  }
  assertUsableDeadline(payload.deadline)
  assertSalaryOrder(payload)

  const requested = String(payload.status ?? 'PENDING_REVIEW').toUpperCase()
  if (!['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'].includes(requested)) {
    throw badRequest('A new posting may only be a draft, pending review, or published')
  }
  if (requested === 'PUBLISHED' && !isStaff(user)) {
    throw forbidden('Only a moderator can publish a posting without review')
  }
  const status = JOB_STATUS[requested]

  // Either link an existing company or name one; the name is always stored so the board
  // still renders if the company row is later removed.
  let companyId = payload.companyId ?? null
  if (!companyId && payload.companyName) {
    const company = await jobModel.findOrCreateCompany({
      name: payload.companyName,
      website: payload.companyWebsite ?? null,
      industry: payload.industry ?? null,
      location: payload.location ?? null,
      logoUrl: payload.companyLogoUrl ?? null,
    })
    companyId = company?.id ?? null
  }

  const jobId = await jobModel.createJob({
    postedBy: user.id,
    companyId,
    companyName: payload.companyName,
    title: payload.title,
    description: payload.description,
    location: payload.location,
    industry: payload.industry,
    workMode: payload.workMode,
    employmentType: payload.employmentType,
    salaryMin: payload.salaryMin ?? null,
    salaryMax: payload.salaryMax ?? null,
    salaryCurrency: payload.salaryCurrency ?? 'USD',
    experienceLevel: payload.experienceLevel,
    applicationUrl: payload.applicationUrl ?? null,
    deadline: payload.deadline ?? null,
    status,
    moderatedBy: status === JOB_STATUS.PUBLISHED ? user.id : null,
  })
  await jobModel.attachSkills(jobId, payload.skills ?? [])

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.JOB_CREATED,
    entityType: 'job',
    entityId: jobId,
    metadata: { title: payload.title, company: payload.companyName, status },
    context,
  })

  return getJob(jobId, user)
}

/**
 * A content edit.
 *
 * Status is not editable here: it is the moderation state machine, and routing it
 * through this endpoint would let a poster edit their way to live. The state changes
 * through `changeJobStatus`.
 */
export async function updateJob(user, jobId, payload, context = {}) {
  const current = await loadEditableJob(jobId, user)

  // The update is merged onto the stored row rather than applied field by field, so an
  // omitted key keeps its current value. `hasOwn` is the test because `null` is a
  // meaningful edit for a nullable column: sending `location: null` clears it, and
  // leaving `location` out must not.
  const merged = {
    companyId: field(payload, 'companyId', current.company_id),
    companyName: field(payload, 'companyName', current.company_name),
    title: field(payload, 'title', current.title),
    description: field(payload, 'description', current.description),
    location: field(payload, 'location', current.location),
    industry: field(payload, 'industry', current.industry),
    workMode: field(payload, 'workMode', current.work_mode),
    employmentType: field(payload, 'employmentType', current.employment_type),
    salaryMin: field(payload, 'salaryMin', current.salary_min),
    salaryMax: field(payload, 'salaryMax', current.salary_max),
    salaryCurrency: field(payload, 'salaryCurrency', current.salary_currency),
    experienceLevel: field(payload, 'experienceLevel', current.experience_level),
    applicationUrl: field(payload, 'applicationUrl', current.application_url),
    deadline: field(payload, 'deadline', current.deadline),
  }

  // Cross-field rules run against the merged row, because a partial edit that only sends
  // `salaryMax` still has to be compared with the minimum already stored.
  assertUsableDeadline(merged.deadline)
  assertSalaryOrder(merged)

  if (merged.companyId == null && merged.companyName) {
    const company = await jobModel.findOrCreateCompany({ name: merged.companyName })
    merged.companyId = company?.id ?? null
  }

  await jobModel.updateJob(jobId, merged)
  if (payload.skills) await jobModel.attachSkills(jobId, payload.skills)

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.JOB_UPDATED,
    entityType: 'job',
    entityId: jobId,
    metadata: { fields: Object.keys(payload) },
    context,
  })

  return getJob(jobId, user)
}

/** The payload's value for `key` when it was sent, otherwise the stored value. */
function field(payload, key, stored) {
  return Object.hasOwn(payload, key) ? payload[key] : stored
}

export async function deleteJob(user, jobId, context = {}) {
  const job = await loadEditableJob(jobId, user)
  await jobModel.deleteJob(jobId)
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.JOB_DELETED,
    entityType: 'job',
    entityId: jobId,
    metadata: { title: job.title },
    context,
  })
}

export async function getJob(jobId, viewer) {
  const job = await loadVisibleJob(jobId, viewer)
  job.skills = await jobModel.listJobSkills(jobId)
  return jobModel.formatJob(job)
}

/**
 * The board.
 *
 * Staff may ask for a state other than PUBLISHED to work through the review queue; for
 * anybody else a status filter is refused rather than silently ignored, because quietly
 * returning the public board for a filtered request is the kind of surprise that makes a
 * moderation queue look broken.
 */
export async function listJobs(viewer, filters) {
  const mineOnly = filters.postedByMe === 'true'
  if (filters.status && !isStaff(viewer) && !mineOnly) {
    throw forbidden('Only staff can list postings by state')
  }

  const { rows, total } = await jobModel.listJobs(viewer.id, {
    ...filters,
    postedByMe: mineOnly,
    openOnly: filters.openOnly === 'true',
    status: filters.status ? toStoredStatus(filters.status) : null,
  })
  return { jobs: (await withSkills(rows)).map(jobModel.formatJob), ...pagination(filters, total) }
}

/**
 * Moves a posting along the review workflow.
 *
 * The transition table decides who may make which move, and a transition nobody is
 * allowed to make is a 409 rather than a silent success, so a client cannot believe it
 * published a posting that is still in review.
 */
export async function changeJobStatus(user, jobId, target, note = null, context = {}) {
  const job = await loadVisibleJob(jobId, user)
  const from = String(job.status).toUpperCase()
  const to = String(target).toUpperCase()

  if (from === to) return getJob(jobId, user)

  const allowed = JOB_TRANSITIONS[from]?.[to]
  if (!allowed) {
    throw conflict(`A posting cannot go from ${readable(from)} to ${readable(to)}`)
  }
  if (allowed.who === 'staff' && !isStaff(user)) {
    throw forbidden('Only a moderator can make that decision')
  }
  if (allowed.who === 'owner' && job.posted_by !== user.id && !isStaff(user)) {
    throw forbidden('You can only manage your own postings')
  }

  // A staff decision is attributed to the staff member making it; the trigger refuses to
  // publish a posting with nobody attributed to the decision, and it refuses a
  // non-moderator as the attributing user, so this is also what makes the write legal.
  await jobModel.setJobStatus(jobId, toStoredStatus(to), {
    moderatedBy: allowed.decision ? user.id : null,
  })

  await auditService.record({
    actorId: user.id,
    action: to.toLowerCase() === 'published'
        ? AUDIT_ACTIONS.JOB_APPROVED
        : to.toLowerCase() === 'rejected'
          ? AUDIT_ACTIONS.JOB_REJECTED
          : AUDIT_ACTIONS[`JOB_${to.toUpperCase()}`] || AUDIT_ACTIONS.JOB_UPDATED,
    entityType: 'job',
    entityId: jobId,
    metadata: { from, to, note },
    context,
  })

  if (job.posted_by !== user.id) {
    await notifyPoster(job, job.posted_by, 'job_moderated', readable(to), note)
  }

  return getJob(jobId, user)
}

/**
 * Tells a poster about a decision somebody else made on their posting.
 *
 * The address comes from the posting row rather than being looked up, so this costs no
 * extra query, and a member who has switched email notifications off still gets the
 * in-app notification because notificationService checks the preference itself.
 */
async function notifyPoster(job, posterId, decision, note) {
  await notificationService.notify({
    userId: posterId,
    type: 'job_moderated',
    title: decision === 'published' ? 'Posting approved' : 'Posting not approved',
    body: note
      ? `Your posting for ${job.title} is now ${decision}: ${note}`
      : `Your posting for ${job.title} is now ${decision}`,
    link: '/jobs',
    email: job.poster_email ?? null,
    emailPayload: { jobTitle: job.title, decision, note },
  })
}

/** The owner's own way to close a posting, as a named endpoint. */
export async function closeJob(user, jobId, context = {}) {
  const job = await loadEditableJob(jobId, user)
  if (job.status === JOB_STATUS.CLOSED) return getJob(jobId, user)
  if (job.status !== JOB_STATUS.PUBLISHED) {
    throw conflict('Only a live posting can be closed')
  }

  await jobModel.setJobStatus(jobId, JOB_STATUS.CLOSED)
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.JOB_CLOSED,
    entityType: 'job',
    entityId: jobId,
    context,
  })
  return getJob(jobId, user)
}

/**
 * The pre-existing moderation endpoint: `approve` and `remove`.
 *
 * Kept as a thin alias over the same transition table, so the old path and the new one
 * cannot drift apart.
 */
export async function moderateJob(user, jobId, action, reason = null, context = {}) {
  const target = action === 'remove' ? 'REJECTED' : 'PUBLISHED'
  return changeJobStatus(user, jobId, target, reason, context)
}

export async function listCompanies(filters) {
  const { rows, total } = await jobModel.listCompanies(filters)
  return { companies: rows.map(jobModel.formatCompany), ...pagination(filters, total) }
}

export async function getCompany(companyId, viewer, filters = {}) {
  const company = await jobModel.findCompanyById(companyId)
  if (!company) throw notFound('Company')
  const rows = await jobModel.listCompanyJobs(companyId, viewer?.id ?? null, {
    limit: filters.limit ?? 20, offset: filters.offset ?? 0,
  })
  return {
    company: jobModel.formatCompany(company),
    jobs: (await withSkills(rows)).map(jobModel.formatJob),
  }
}

/**
 * Applies to a posting.
 *
 * Three things are checked before the row is written: the posting is live and still
 * open, the applicant is not the poster, and whatever file they attached is one they
 * uploaded. That last one is what stops a member from putting somebody else's resume on
 * their application, which would otherwise hand the recruiter somebody else's personal
 * document.
 */
export async function applyToJob(user, jobId, payload, context = {}) {
  const job = await loadVisibleJob(jobId, user)
  if (job.status !== JOB_STATUS.PUBLISHED) {
    throw badRequest('This job is no longer accepting applications')
  }
  if (job.deadline && new Date(job.deadline) < new Date()) {
    throw badRequest('The application deadline for this job has passed')
  }
  if (job.posted_by === user.id) {
    throw badRequest('You cannot apply to your own posting')
  }

  const resumeFileId = payload.resumeFileId ?? null
  if (resumeFileId) await fileService.assertOwnedFile(user, resumeFileId, 'resume')

  const existing = await jobModel.findApplicationForJob(jobId, user.id)
  if (existing) {
    throw conflict(existing.status === APPLICATION_STATUS.WITHDRAWN
      ? 'You already withdrew your application to this job'
      : 'You have already applied to this job')
  }

  const created = await jobModel.createApplication({
    jobId,
    applicantId: user.id,
    coverLetter: payload.coverLetter,
    resumeFileId,
    resumeUrl: payload.resumeUrl ?? null,
    externalUrl: payload.externalUrl ?? null,
  })

  const name = user.first_name ?? 'Someone'
  await notificationService.notify({
    userId: job.posted_by,
    type: 'application_received',
    title: 'New job application',
    body: `${name} applied to ${job.title} at ${job.company_name}`,
    link: `/jobs/${job.id}/applications`,
    actorId: user.id,
    email: job.poster_email ?? null,
    emailPayload: { jobTitle: job.title, applicantName: name },
  })
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.JOB_APPLIED,
    entityType: 'job_application',
    entityId: created.id,
    metadata: { jobId },
    context,
  })

  return getApplication(user, created.id)
}

/**
 * One application.
 *
 * Visible to its applicant, to the poster of the posting, and to staff. The applicant's
 * email is stripped for anybody who is not one of those, so a saved job never leaks it
 * by accident.
 */
export async function getApplication(user, applicationId) {
  const row = await jobModel.findApplicationById(applicationId)
  if (!row) throw notFound('Application')

  const job = await loadVisibleJob(row.job_id, user)
  const isApplicant = row.applicant_id === user.id
  const isRecruiter = job.posted_by === user.id || isStaff(user)
  if (!isApplicant && !isRecruiter) throw notFound('Application')

  const formatted = jobModel.formatApplication(row)
  // The applicant's own address is already theirs; a reader of somebody else's
  // application gets the name and headline only.
  if (!isRecruiter && !isStaff(user)) delete formatted.applicant.email
  return formatted
}

/** Applications to one posting: its poster and staff only. */
export async function listApplicationsForJob(user, jobId, filters) {
  const job = await loadVisibleJob(jobId, user)
  if (job.posted_by !== user.id && !isStaff(user)) {
    throw forbidden('Only the poster can view applicants')
  }
  const { rows, total } = await jobModel.listApplicationsForJob(jobId, {
    ...filters,
    status: filters.status ? toStoredApplicationStatus(filters.status) : null,
  })
  return { applications: rows.map(jobModel.formatApplication), ...pagination(filters, total) }
}

export async function listMyApplications(user, filters) {
  const { rows, total } = await jobModel.listMyApplications(user.id, {
    ...filters,
    status: filters.status ? toStoredApplicationStatus(filters.status) : null,
  })
  return { applications: rows.map(jobModel.formatApplication), ...pagination(filters, total) }
}

/**
 * Moves an application along the review pipeline and tells the applicant.
 *
 * A reviewer is the poster of the posting or staff; an applicant reviewing their own
 * application is refused. Every reviewed state records who reviewed it, which the
 * trigger enforces independently.
 */
export async function reviewApplication(user, applicationId, apiStatus, note = null, context = {}) {
  const to = toStoredApplicationStatus(apiStatus)
  const application = await jobModel.findApplicationById(applicationId)
  if (!application) throw notFound('Application')

  const job = await loadVisibleJob(application.job_id, user)
  if (job.posted_by !== user.id && !isStaff(user)) {
    throw forbidden('Only the poster can review applicants')
  }
  if (application.status === APPLICATION_STATUS.WITHDRAWN && to !== APPLICATION_STATUS.WITHDRAWN) {
    throw conflict('This applicant withdrew their application')
  }
  if (application.status === to) return getApplication(user, applicationId)

  const reviewed = to !== APPLICATION_STATUS.SUBMITTED && to !== APPLICATION_STATUS.WITHDRAWN
  await jobModel.updateApplicationStatus(applicationId, to, {
    reviewedBy: reviewed ? user.id : null,
    note,
  })

  await notificationService.notify({
    userId: application.applicant_id,
    type: 'application_status',
    title: 'Application update',
    body: `Your application for ${job.title} at ${job.company_name} is now ${readable(to)}`,
    link: '/applications',
    actorId: user.id,
    email: application.applicant_email,
    emailPayload: {
      jobTitle: job.title,
      status: readable(to),
    },
  })
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.APPLICATION_STATUS_CHANGED,
    entityType: 'job_application',
    entityId: applicationId,
    metadata: { from: application.status, to, note },
    context,
  })

  return getApplication(user, applicationId)
}

/** The applicant stepping away from their own application. */
export async function withdrawApplication(user, applicationId, context = {}) {
  const application = await jobModel.findApplicationById(applicationId)
  if (!application) throw notFound('Application')
  if (application.applicant_id !== user.id) {
    throw forbidden('You can only withdraw your own application')
  }
  if (application.status === APPLICATION_STATUS.WITHDRAWN) {
    throw conflict('This application is already withdrawn')
  }

  await jobModel.updateApplicationStatus(applicationId, APPLICATION_STATUS.WITHDRAWN)
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.APPLICATION_WITHDRAWN,
    entityType: 'job_application',
    entityId: applicationId,
    context,
  })
  return getApplication(user, applicationId)
}

/**
 * Saves a posting.
 *
 * Only a live posting can be saved. Saving a rejected draft would fill the member's
 * saved list with things they cannot act on, and the state can change later anyway
 * because a saved posting stays listed after it closes.
 */
export async function saveJob(user, jobId) {
  const job = await loadVisibleJob(jobId, user)
  if (job.status !== JOB_STATUS.PUBLISHED) {
    throw badRequest('Only a live posting can be saved')
  }
  const created = await jobModel.saveJob(user.id, jobId)
  return { saved: true, created }
}

export async function unsaveJob(user, jobId) {
  await loadJob(jobId, user?.id ?? null)
  await jobModel.unsaveJob(user.id, jobId)
  return { saved: false }
}

export async function listSavedJobs(user, filters) {
  const { rows, total } = await jobModel.listSavedJobs(user.id, filters)
  return { jobs: (await withSkills(rows)).map(jobModel.formatJob), ...pagination(filters, total) }
}

/**
 * Shared validation for create and update.
 *
 * A deadline in the past makes a posting unusable, so it is refused rather than left to
 * sit in the board looking open.
 */
function assertUsableDeadline(deadline) {
  if (deadline && new Date(deadline) < new Date()) {
    throw badRequest('The application deadline must be in the future')
  }
}

function assertSalaryOrder({ salaryMin, salaryMax }) {
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
    throw badRequest('Maximum salary must be greater than or equal to minimum salary')
  }
}
