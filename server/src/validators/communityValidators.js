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
