import { Router } from 'express'
import { z } from 'zod'
import * as controller from '../controllers/eventController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import {
  attendeeAddSchema, attendeeNoteSchema, attendeeParamSchema, attendeeSchema,
  eventCancellationSchema, eventIdParamSchema, eventQuerySchema, eventSchema,
  eventUpdateSchema, pagingSchema, rsvpSchema,
} from '../validators/eventValidators.js'

/**
 * Events, RSVPs and the attendee roster.
 *
 * Reading an event is open; everything else needs a session. The roster and the
 * list of RSVPs sit behind the organizer's own check in the service rather than
 * here, so a route cannot accidentally expose them by being mounted in the wrong
 * place.
 */
const router = Router()

/**
 * Paging for the roster listings.
 *
 * The organizer can narrow the RSVPs by answer, which is the question they
 * actually have ("who is coming?"), and the roster takes plain paging.
 */
const rsvpQuerySchema = pagingSchema.extend({
  status: z.preprocess(
    (value) => (typeof value === 'string'
      ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
      : value),
    z.enum(['going', 'interested', 'cancelled']).optional(),
  ),
})

router.use(authenticate)

router.get('/', validate({ query: eventQuerySchema }), controller.list)
router.get('/mine', validate({ query: eventQuerySchema }), controller.mine)
router.get('/my-rsvps', validate({ query: pagingSchema }), controller.myRsvps)

router.post('/', validate({ body: eventSchema }), controller.create)

router.get('/:id', validate({ params: eventIdParamSchema }), controller.get)
router.patch(
  '/:id',
  validate({ params: eventIdParamSchema, body: eventUpdateSchema }),
  controller.update,
)
router.delete('/:id', validate({ params: eventIdParamSchema }), controller.remove)

/** Publishing is its own call so cancelling can demand a reason. */
router.post('/:id/publish', validate({ params: eventIdParamSchema }), controller.publish)
router.post(
  '/:id/cancel',
  validate({ params: eventIdParamSchema, body: eventCancellationSchema }),
  controller.cancel,
)
router.post('/:id/complete', validate({ params: eventIdParamSchema }), controller.complete)

router.post('/:id/rsvp', validate({ params: eventIdParamSchema, body: rsvpSchema }), controller.rsvp)
router.delete('/:id/rsvp', validate({ params: eventIdParamSchema }), controller.cancelRsvp)

router.get(
  '/:id/rsvps',
  validate({ params: eventIdParamSchema, query: rsvpQuerySchema }),
  controller.listRsvps,
)

router.get(
  '/:id/attendees',
  validate({ params: eventIdParamSchema, query: pagingSchema }),
  controller.listAttendees,
)
router.post(
  '/:id/attendees',
  validate({ params: eventIdParamSchema, body: attendeeAddSchema }),
  controller.addAttendee,
)
router.patch(
  '/:id/attendees/:userId',
  validate({ params: attendeeParamSchema, body: attendeeSchema }),
  controller.checkIn,
)
router.patch(
  '/:id/attendees/:userId/notes',
  validate({ params: attendeeParamSchema, body: attendeeNoteSchema }),
  controller.setNotes,
)
router.delete(
  '/:id/attendees/:userId',
  validate({ params: attendeeParamSchema }),
  controller.removeAttendee,
)

export default router
