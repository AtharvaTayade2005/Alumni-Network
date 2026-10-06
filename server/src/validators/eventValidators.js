import { z } from 'zod'
import { uuidSchema } from './authValidators.js'

/**
 * Validators for events, RSVPs and the attendee roster.
 *
 * `EVENT_STATUSES` is upper case because that is the spelling the API exposes,
 * while the database stores lower case. `statusEnum` accepts case, dashes and
 * spaces, so `under-review`, `UNDER REVIEW` and `under_review` all mean the same
 * state instead of three different 422s.
 *
 * The stored row splits an event's start into a date and a time of day, which is
 * convenient to query and awkward to send: nobody wants to post a date and a
 * time separately. So the API takes `startTime`/`endTime` as instants and derives
 * the stored pair from them, and answers with `date` as well so a client written
 * against the older column name still finds what it is looking for.
 *
 * Rules that span two fields live in `refineEvent` and only fire when both sides
 * are present. A partial update that changes only the description must not fail
 * the "needs a venue or a link" rule because it never mentions a venue.
 */
export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']

/**
 * Names the old vocabulary or the American spelling used.
 *
 * `removed` was a value the pre-Phase-5 constraint allowed, so an existing row
 * can carry it. Those events were withdrawn by an organizer rather than genuinely
 * finished, which is what `cancelled` means now; mapping instead of refusing
 * keeps every stored event readable.
 */
const STATUS_ALIASES = {
  REMOVED: 'CANCELLED',
  CANCELED: 'CANCELLED',
  COMPLETE: 'COMPLETED',
  LIVE: 'PUBLISHED',
}

/** How a member answered: going, maybe, or no. */
export const RSVP_STATUSES = ['GOING', 'INTERESTED', 'NOT_GOING']

/**
 * RSVP names as they are stored.
 *
 * The database says `cancelled` where the API says `NOT_GOING`; both mean "I am
 * not coming", and a client that has only ever seen one of the two names can send
 * it. `DECLINED` and `MAYBE` are accepted for the same reason.
 */
const RSVP_STORAGE = { GOING: 'going', INTERESTED: 'interested', NOT_GOING: 'cancelled' }
const RSVP_ALIASES = { DECLINED: 'NOT_GOING', CANCELLED: 'NOT_GOING', MAYBE: 'INTERESTED' }

function normaliseStatus(value, aliases = {}) {
  if (typeof value !== 'string') return value
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return aliases[upper] ?? upper
}

const statusEnum = (values) => z.preprocess(
  (value) => normaliseStatus(value, STATUS_ALIASES),
  z.enum(values),
)

/**
 * An RSVP answer, normalised to its stored spelling.
 *
 * The API name is mapped here rather than by the model so a stored row and a
 * request are compared in one vocabulary, and so an unknown answer is refused
 * with the stored names in the message instead of silently becoming a default.
 */
export const rsvpStatusValue = z.preprocess(
  (value) => {
    const name = normaliseStatus(value, RSVP_ALIASES)
    return typeof name === 'string' ? (RSVP_STORAGE[name] ?? name) : value
  },
  z.enum(['going', 'interested', 'cancelled']).default('going'),
)

/**
 * A guest count.
 *
 * Capped at the 5 the database check enforces, so an oversized number is a 422
 * with a sentence in it rather than a constraint violation with a stack trace.
 * Guests occupy places in the head count, so this is not cosmetic.
 */
const guestCount = z.coerce.number().int().min(0).max(5).default(0)

/**
 * A link the organizer supplied.
 *
 * Restricted to http(s), so a `javascript:` join link cannot be stored and later
 * rendered as a clickable href in an email or a notification body.
 */
const eventLink = z.string().trim().min(1).max(500).refine((value) => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}, 'Enter an http(s) link')

/**
 * Page/limit, shared by every listing.
 *
 * Exported on its own because a roster endpoint needs paging without the event
 * filters, and `paged()` returns a transformed schema that cannot be extended.
 */
export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/** Page/limit plus the offset every model query needs. */
function paged(shape) {
  return pagingSchema.extend(shape)
    .transform((data) => ({ ...data, offset: (data.page - 1) * data.limit }))
}

/**
 * An instant the client sends.
 *
 * A bare date is refused: storing it would mean inventing a time of day, and an
 * event at an invented hour is worse than a 422 that asks for the time.
 */
const instant = (label) => z.coerce.date({ invalid_type_error: `${label} must be a date and time` })
  .refine(
    (value) => !Number.isNaN(value.getTime()) && /\d{1,2}:\d{2}/.test(String(value)),
    `${label} must include a time, for example 2026-03-01T18:30:00Z`,
  )

const eventShape = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(20000).optional().nullable(),
  startTime: instant('startTime'),
  endTime: instant('endTime'),
  venue: z.string().trim().max(200).optional().nullable(),
  virtualUrl: eventLink.optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  capacity: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
  rsvpDeadline: instant('rsvpDeadline').optional().nullable(),
  imageUrl: z.string().trim().url().max(500).optional().nullable(),
}

/**
 * An event has to be somewhere or be joinable.
 *
 * The same rule is a check constraint, so it holds against a direct INSERT too;
 * having it here means the client is told which field is missing instead of
 * receiving a database error with a constraint name in it.
 *
 * `requirePlace` is how a partial update says "I never mentioned a place, so do
 * not judge me on having one". It is off unless the request actually carries
 * `venue` or `virtualUrl`.
 */
function refineEvent(data, ctx, { requirePlace = true } = {}) {
  const hasVenue = typeof data.venue === 'string' && data.venue.trim() !== ''
  const hasLink = typeof data.virtualUrl === 'string' && data.virtualUrl.trim() !== ''
  if (requirePlace && !hasVenue && !hasLink) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['venue'],
      message: 'Give the event a venue or a join link',
    })
  }
  if (data.endTime && data.startTime && data.endTime <= data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'The end time must be after the start time',
    })
  }
  if (data.rsvpDeadline && data.startTime && data.rsvpDeadline > data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rsvpDeadline'],
      message: 'The RSVP deadline cannot be after the event starts',
    })
  }
}

/**
 * A new event.
 *
 * `status` is accepted here so a client that posts the whole form in one request
 * is not silently given a draft; the service still refuses `PUBLISHED` for anybody
 * but a moderator, so accepting the field is not the same as honouring it.
 */
export const eventSchema = z.object({
  ...eventShape,
  status: statusEnum(EVENT_STATUSES).optional(),
}).superRefine(refineEvent)

/**
 * A partial update.
 *
 * The service compares every changed field against the stored event, so an update
 * that moves the start time past an RSVP deadline it did not mention is still
 * caught. This validator only refuses what it can see.
 */
export const eventUpdateSchema = z.object({
  ...Object.fromEntries(Object.entries(eventShape).map(([key, value]) => [key, value.optional()])),
  status: statusEnum(EVENT_STATUSES).optional(),
}).superRefine((data, ctx) => {
  // Only a request that actually names a place is judged on having one. Clearing
  // `venue` to null is a legal instruction, not a malformed field; whether the
  // event is left with nowhere to be is a question about the merged result, so
  // the service answers that one with 400 rather than this layer with 422.
  const mentionsPlace = typeof data.venue === 'string' || typeof data.virtualUrl === 'string'
  refineEvent(data, ctx, { requirePlace: mentionsPlace })
})

/**
 * A listing filter.
 *
 * `ALL` is spelled out rather than inferred from an absent filter, so a client
 * can ask for every event including drafts and be told no if it may not see them.
 */
export const eventQuerySchema = paged({
  status: statusEnum([...EVENT_STATUSES, 'ALL']).optional(),
  search: z.string().trim().max(200).optional(),
  organizerId: uuidSchema.optional(),
  upcoming: z.coerce.boolean().optional(),
  past: z.coerce.boolean().optional(),
  mine: z.coerce.boolean().optional(),
})

/** A member answering an event. */
export const rsvpSchema = z.object({
  status: rsvpStatusValue.default('going'),
  guestCount,
  note: z.string().trim().max(500).optional().nullable(),
})

/** Cancelling needs a reason, because the people who were going will be told it. */
export const eventCancellationSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

/** Marking somebody present. */
export const attendeeSchema = z.object({
  checkedIn: z.coerce.boolean().default(true),
  checkedInBy: uuidSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

/** Adding somebody to the roster by hand. */
export const attendeeAddSchema = z.object({
  userId: uuidSchema,
  notes: z.string().trim().max(1000).optional().nullable(),
})

/** Free text a member writes about an event they are attending. */
export const attendeeNoteSchema = z.object({
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const eventIdParamSchema = z.object({ id: uuidSchema })
export const attendeeParamSchema = z.object({ id: uuidSchema, userId: uuidSchema })