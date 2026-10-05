import { Router } from 'express'
import * as controller from '../controllers/mentorshipController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { z } from 'zod'
import { optionalText, uuidSchema } from '../validators/authValidators.js'
import {
  mentorshipRequestSchema, mentorshipRespondSchema, mentorshipQuerySchema,
} from '../validators/communityValidators.js'

const requestParamSchema = z.object({ requestId: uuidSchema })
const relationshipParamSchema = z.object({ relationshipId: uuidSchema })

/** The Phase 3 spec addresses requests and relationships as `:id`. */
const idParamSchema = z.object({ id: uuidSchema })

const mentorshipsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'ENDED',
    'active', 'completed', 'ended']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const mentorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
})

const endMentorshipSchema = z.object({
  endReason: optionalText(1000),
})

/** A mentor's decision may carry a short note, which is why it is not bodyless. */
const respondBodySchema = z.object({
  responseNote: optionalText(1000),
}).partial()

const router = Router()

router.use(authenticate)

// ---------------------------------------------------------------- discovery

router.get('/mentors', validate({ query: mentorsQuerySchema }), controller.findMentors)

// ---------------------------------------------------------------- requests
//
// Literal segments are declared before the `/:id` forms so `requests` and
// `relationships` are not captured as ids and rejected by the UUID validator.

router.get('/requests', validate({ query: mentorshipQuerySchema }), controller.listRequests)
router.post('/requests', validate({ body: mentorshipRequestSchema }), controller.request)
router.get('/requests/:id', validate({ params: idParamSchema }), controller.getRequest)
router.patch(
  '/requests/:id/accept',
  validate({ params: idParamSchema, body: respondBodySchema }),
  controller.accept,
)
router.patch(
  '/requests/:id/reject',
  validate({ params: idParamSchema, body: respondBodySchema }),
  controller.reject,
)
router.patch(
  '/requests/:id/cancel',
  validate({ params: idParamSchema }),
  controller.cancelById,
)

// Older combined forms, kept so existing clients keep working.
router.patch(
  '/requests/:requestId',
  validate({ params: requestParamSchema, body: mentorshipRespondSchema }),
  controller.respond,
)
router.delete(
  '/requests/:requestId',
  validate({ params: requestParamSchema }),
  controller.cancel,
)

// ---------------------------------------------------------------- relationships

router.get(
  '/relationships',
  validate({ query: mentorshipsQuerySchema }),
  controller.listRelationships,
)
router.get('/mentorships', validate({ query: mentorshipsQuerySchema }), controller.listRelationships)
router.patch(
  '/relationships/:id/complete',
  validate({ params: idParamSchema }),
  controller.completeById,
)
router.patch(
  '/relationships/:id/end',
  validate({ params: idParamSchema, body: endMentorshipSchema }),
  controller.endById,
)
router.patch(
  '/mentorships/:relationshipId/complete',
  validate({ params: relationshipParamSchema }),
  controller.complete,
)
router.patch(
  '/mentorships/:relationshipId/end',
  validate({ params: relationshipParamSchema, body: endMentorshipSchema }),
  controller.end,
)

export default router
