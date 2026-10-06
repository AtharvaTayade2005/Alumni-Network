import { z } from 'zod'
import { optionalText, uuidSchema } from './authValidators.js'

/**
 * Validators for the job board.
 *
 * The board has its own file because it carries two vocabularies that the rest of the
 * API does not: the moderation workflow on postings and the review pipeline on
 * applications. Both are exposed in upper case and both accept the lower-case spelling
 * the database uses, so a client written against either contract is answered.
 *
 * `z.enum` is used through `statusValue`, which normalises case, dashes and spaces
 * before validating. That is what lets `under-review`, `UNDER REVIEW` and
 * `UNDER_REVIEW` mean the same state, instead of three different 422s.
 */

export const JOB_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'CLOSED', 'REJECTED']

export const APPLICATION_STATUSES = [
  'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN',
]

/**
 * Older clients, and the rows migrated from the previous vocabulary, use names this
 * phase replaces. They are mapped rather than refused so an existing integration
 * keeps working.
 */
const STATUS_ALIASES = {
  ACTIVE: 'PUBLISHED',
  LIVE: 'PUBLISHED',
  HIDDEN: 'REJECTED',
  REMOVED: 'REJECTED',
}

function normaliseStatus(value, aliases = {}) {
  if (typeof value !== 'string') return value
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return aliases[upper] ?? upper
}

/** An enum of API status names that also accepts the lower-case and dashed spellings. */
const statusEnum = (values, aliases = {}) => z.preprocess(
  (value) => normaliseStatus(value, aliases),
  z.enum(values),
)

/**
 * A comma-separated or repeated list of skills.
 *
 * Both shapes are accepted because clients differ: a form posts `skills=a,b` while a
 * fetch client repeats the parameter. Blanks are dropped so `a,,b` is not a skill
 * named nothing.
 */
const skillList = z.preprocess((value) => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  const cleaned = raw.map((v) => String(v).trim()).filter(Boolean)
  const seen = new Set()
  return cleaned.filter((name) => {
    const key = name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}, z.array(z.string().min(1).max(100)).max(20).default([]))

/** page/limit plus the offset every model query needs. */
function paged(shape) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    ...shape,
  }).transform((data) => ({ ...data, offset: (data.page - 1) * data.limit }))
}

/**
 * A link a member typed in.
 *
 * Restricted to http(s) or a site-relative path. Without that check a `javascript:`
 * or `data:` value would be stored and later rendered as a clickable link on a
 * posting or an application.
 */
const attachmentLink = z.string().trim().min(1).max(500).refine((value) => {
  if (value.startsWith('/')) return true
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}, 'Enter an http(s) link or a site-relative path')

const jobShape = {
  title: z.string().trim().min(3).max(200),
  companyName: z.string().trim().min(2).max(200),
  companyId: uuidSchema.optional().nullable(),
  companyWebsite: z.string().trim().url().max(255).optional().nullable(),
  companyLogoUrl: z.string().trim().url().max(500).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim()
    .min(50, 'Description must be at least 50 characters')
    .max(20000),
  location: z.string().trim().max(150).optional().nullable(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).default('onsite'),
  employmentType: z.enum(['full_time', 'part_time', 'internship', 'contract'])
    .default('full_time'),
  salaryMin: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryMax: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead']).default('mid'),
  applicationUrl: attachmentLink.optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  skills: skillList,
}

/** Cross-field rules shared by create and update, applied only when both sides are present. */
function refineJob(data, ctx) {
  if (data.salaryMin != null && data.salaryMax != null && data.salaryMax < data.salaryMin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salaryMax'],
      message: 'Maximum salary must be greater than the minimum',
    })
  }
  if (data.deadline && data.deadline.getTime() <= Date.now()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deadline'],
      message: 'Deadline must be a future date',
    })
  }
}

export const jobSchema = z.object(jobShape)
  .extend({
    /**
     * A posting may be created as a draft or sent for review. `PUBLISHED` is accepted
     * by the schema and then gated by role in the service: publishing is a moderation
     * decision, so only a moderator or administrator may make one at creation time.
     */
    status: statusEnum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'], STATUS_ALIASES).default('PENDING_REVIEW'),
  })
  .superRefine(refineJob)

export const jobUpdateSchema = z.object(jobShape)
  .partial()
  .superRefine(refineJob)

export const jobQuerySchema = paged({
  search: z.string().trim().max(120).optional(),
  location: z.string().trim().max(150).optional(),
  industry: z.string().trim().max(120).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'internship', 'contract']).optional(),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead']).optional(),
  skills: skillList,
  /**
   * A salary range is an overlap test, not a containment test: a posting matches when
   * any part of its range falls inside the range asked for, which is what a reader
   * looking for "at least 80k" means.
   */
  salaryMin: z.coerce.number().int().min(0).optional(),
  salaryMax: z.coerce.number().int().min(0).optional(),
  /** Postings closing on or before this date. */
  deadline: z.coerce.date().optional(),
  /** Hides postings whose deadline has passed. On by default, because a board that
   *  lists expired roles sends readers to dead links. */
  openOnly: z.enum(['true', 'false']).default('true'),
  postedByMe: z.enum(['true', 'false']).optional(),
  /** Any state may be asked for; the service only allows it to staff, or to the
   *  poster asking for their own posting. */
  status: statusEnum(JOB_STATUSES, STATUS_ALIASES).optional(),
  sort: z.enum(['newest', 'oldest', 'title', 'deadline', 'salary']).default('newest'),
})

/**
 * A moderation decision, and the transitions a poster may make on their own posting.
 *
 * The service decides which of these a given caller may perform, so the schema only
 * has to name the states.
 */
export const jobStatusSchema = z.object({
  status: statusEnum(JOB_STATUSES, STATUS_ALIASES),
  /** Shown to the poster when a posting is rejected. */
  note: optionalText(1000),
})

export const jobCloseSchema = z.object({
  note: optionalText(1000),
})

/**
 * The pre-existing moderation shape, kept because a client may still be calling it.
 * `approve` and `remove` are the two decisions, and they map onto PUBLISHED and
 * REJECTED; PATCH /:jobId/status is the fuller endpoint.
 */
export const jobModerationSchema = z.object({
  action: z.enum(['approve', 'remove']),
  reason: optionalText(1000),
})

export const companySchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.string().trim().url().max(255).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(150).optional().nullable(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
})

export const companyQuerySchema = paged({
  search: z.string().trim().max(120).optional(),
})

export const applicationSchema = z.object({
  coverLetter: optionalText(5000),
  /** A file the applicant uploaded through /api/files. */
  resumeFileId: uuidSchema.optional().nullable(),
  /** A link the applicant typed, kept for clients that store their resume elsewhere. */
  resumeUrl: attachmentLink.optional().nullable(),
  /** Where to apply when the posting names an external system. */
  externalUrl: attachmentLink.optional().nullable(),
}).superRefine((data, ctx) => {
  if (!data.resumeFileId && !data.resumeUrl && !data.externalUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resumeFileId'],
      message: 'Attach an uploaded resume or provide a resume or application link',
    })
  }
})

export const applicationStatusSchema = z.object({
  status: statusEnum(APPLICATION_STATUSES),
  note: optionalText(1000),
})

export const applicationQuerySchema = paged({
  status: statusEnum(APPLICATION_STATUSES).optional(),
  jobId: uuidSchema.optional(),
})

export const fileQuerySchema = paged({})

export const fileUploadSchema = z.object({
  kind: z.enum(['resume', 'attachment']).default('resume'),
})

export const fileParamSchema = z.object({ fileId: uuidSchema })
