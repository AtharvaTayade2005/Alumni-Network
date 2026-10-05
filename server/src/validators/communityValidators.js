import { z } from 'zod'
import { optionalText, uuidSchema } from './authValidators.js'

/**
 * Validators for the community features.
 *
 * Each feature declares a plain object shape first, then wraps it. That is
 * required because `.refine()`/`.superRefine()` return a ZodEffects, which has
 * no `.partial()`, so the "update" variants have to be derived from the raw
 * shape rather than from the finished schema.
 */

const jobShape = {
  title: z.string().trim().min(3).max(200),
  companyName: z.string().trim().min(2).max(200),
  companyId: uuidSchema.optional().nullable(),
  companyWebsite: z.string().trim().url().max(255).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  companyLogoUrl: z.string().trim().url().max(500).optional().nullable(),
  description: z.string().trim().min(50, 'Description must be at least 50 characters').max(20000),
  location: z.string().trim().max(150).optional().nullable(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).default('onsite'),
  employmentType: z.enum(['full_time', 'part_time', 'internship', 'contract']).default('full_time'),
  salaryMin: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryMax: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryCurrency: z.string().trim().length(3).toUpperCase().default('USD'),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead']).default('mid'),
  applicationUrl: z.string().trim().url().max(500).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  status: z.enum(['draft', 'active']).default('active'),
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
  if (data.deadline && data.deadline.getTime() <= Date.now() - 86_400_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deadline'],
      message: 'Deadline must be a future date',
    })
  }
}

export const jobSchema = z.object(jobShape).superRefine(refineJob)

export const jobUpdateSchema = z.object(jobShape)
  .partial()
  .extend({ status: z.enum(['draft', 'active', 'closed']).optional() })
  .superRefine(refineJob)

export const jobQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  workMode: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'internship', 'contract']).optional(),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead']).optional(),
  company: z.string().trim().max(200).optional(),
  location: z.string().trim().max(150).optional(),
  skill: z.string().trim().max(100).optional(),
  salaryMin: z.coerce.number().int().min(0).optional(),
  postedByMe: z.enum(['true', 'false']).optional(),
  status: z.enum(['active', 'closed', 'draft']).optional(),
  sort: z.enum(['newest', 'oldest', 'title', 'deadline', 'salary']).default('newest'),
})

export const companySchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.string().trim().url().max(255).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(150).optional().nullable(),
  logoUrl: z.string().trim().url().max(500).optional().nullable(),
})

export const companyUpdateSchema = companySchema.partial()

export const applicationSchema = z.object({
  coverLetter: optionalText(5000),
  resumeUrl: z.string().trim().max(500).optional().nullable(),
  externalUrl: z.string().trim().url('Enter a valid application URL').max(500).optional().nullable(),
}).superRefine((data, ctx) => {
  if (!data.resumeUrl && !data.externalUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resumeUrl'],
      message: 'Attach a resume or provide an external application URL',
    })
  }
})

export const applicationStatusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'shortlisted', 'rejected', 'accepted', 'withdrawn']),
  note: optionalText(1000),
})

export const applicationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['submitted', 'under_review', 'shortlisted', 'rejected', 'accepted', 'withdrawn']).optional(),
  jobId: uuidSchema.optional(),
})

export const companyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
})

export const jobModerationSchema = z.object({
  action: z.enum(['approve', 'remove']),
  reason: optionalText(1000),
})

const eventShape = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(20000),
  eventDate: z.coerce.date(),
  startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour time'),
  endTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour time'),
  venue: z.string().trim().max(200).optional().nullable(),
  virtualUrl: z.string().trim().url().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  maxAttendees: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
  registrationDeadline: z.coerce.date().optional().nullable(),
  status: z.enum(['draft', 'published']).default('published'),
}

function refineEvent(data, ctx) {
  if (data.endTime && data.startTime && data.endTime <= data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'End time must be after the start time',
    })
  }
  if (data.registrationDeadline && data.eventDate
      && data.registrationDeadline > new Date(data.eventDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registrationDeadline'],
      message: 'Registration deadline must fall on or before the event date',
    })
  }
  if ((data.latitude == null) !== (data.longitude == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latitude'],
      message: 'Latitude and longitude must be provided together',
    })
  }
}

export const eventSchema = z.object(eventShape).superRefine(refineEvent)

export const eventUpdateSchema = z.object(eventShape)
  .partial()
  .extend({ status: z.enum(['draft', 'published', 'cancelled', 'completed']).optional() })
  .superRefine(refineEvent)

export const eventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  past: z.enum(['true', 'false']).default('false'),
  sort: z.enum(['upcoming', 'newest', 'title']).default('upcoming'),
})

export const rsvpSchema = z.object({
  status: z.enum(['going', 'interested']).default('going'),
  guestCount: z.coerce.number().int().min(0).max(5).default(0),
  note: optionalText(500),
})

const mentorshipModeSchema = z.enum(['email', 'chat', 'call', 'video'])

/**
 * POST /api/mentorship/requests.
 *
 * The Phase 3 spec names the fields `interestArea` and `preferredCommunication`;
 * the original API used `areaOfInterest` and `preferredMode`. Both spellings are
 * accepted so neither client contract breaks, and the service resolves them.
 *
 * Exactly one spelling of each aliased pair must be present, which is why the
 * pair cannot simply be optional on both sides.
 */
export const mentorshipRequestSchema = z.object({
  mentorId: uuidSchema,
  careerGoal: z.string().trim().min(20, 'Describe your career goal in at least 20 characters').max(2000),
  interestArea: z.string().trim().min(2).max(150).optional(),
  areaOfInterest: z.string().trim().min(2).max(150).optional(),
  message: optionalText(2000),
  preferredCommunication: mentorshipModeSchema.optional(),
  preferredMode: mentorshipModeSchema.optional(),
}).superRefine((data, ctx) => {
  if (!data.interestArea && !data.areaOfInterest) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['interestArea'],
      message: 'interestArea is required',
    })
  }
  if (data.interestArea && data.areaOfInterest && data.interestArea !== data.areaOfInterest) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['areaOfInterest'],
      message: 'interestArea and areaOfInterest disagree; send only one',
    })
  }
  if (data.preferredCommunication && data.preferredMode
      && data.preferredCommunication !== data.preferredMode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preferredMode'],
      message: 'preferredCommunication and preferredMode disagree; send only one',
    })
  }
})
// Applied server-side so a missing preferredCommunication still defaults.
export const mentorshipRequestDefaults = { preferredMode: 'email' }

export const mentorshipRespondSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  responseNote: optionalText(1000),
})

export const mentorshipRequestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED',
    'pending', 'accepted', 'rejected', 'cancelled', 'completed']).optional(),
  role: z.enum(['mentor', 'mentee', 'all']).default('all'),
})

/** Legacy alias, kept because the mentorship routes import this name. */
export const mentorshipQuerySchema = mentorshipRequestQuerySchema

export const connectionSchema = z.object({
  addresseeId: uuidSchema,
  message: optionalText(500),
})

export const connectionRespondSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
})

export const donationSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero').max(1_000_000),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  purpose: z.string().trim().max(120).optional().nullable(),
  isAnonymous: z.boolean().default(false),
  message: optionalText(500),
  provider: z.enum(['stripe', 'paypal']).default('stripe'),
})

export const reportSchema = z.object({
  targetType: z.enum(['user', 'job', 'event', 'message', 'company']),
  targetId: uuidSchema,
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'fraud', 'other']),
  details: optionalText(2000),
})

export const moderationSchema = z.object({
  action: z.enum(['hide', 'remove', 'restore', 'suspend', 'reactivate',
    'warn', 'dismiss_report', 'resolve_report']),
  targetType: z.enum(['user', 'job', 'event', 'message', 'company', 'report']),
  targetId: uuidSchema,
  reason: z.string().trim().min(5, 'A reason is required').max(2000),
  metadata: z.record(z.unknown()).optional(),
})

export const verificationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  notes: optionalText(2000),
})
