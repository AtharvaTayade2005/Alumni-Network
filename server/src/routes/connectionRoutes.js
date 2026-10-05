import { Router } from 'express'
import * as controller from '../controllers/connectionController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import {
  listConnectionsSchema, pendingSchema, connectSchema, respondSchema,
  userParamSchema, connectionParamSchema, idParamSchema,
} from '../validators/connectionValidators.js'

const router = Router()

router.use(authenticate)

// --------------------------------------------------------------- read

router.get('/', validate({ query: listConnectionsSchema }), controller.list)

// Registered before the `/:userId` forms below: a literal segment must not be
// captured as an id and rejected by the UUID validator.
router.get('/requests', validate({ query: pendingSchema }), controller.pending)
router.get('/pending', validate({ query: pendingSchema }), controller.pending)
router.get('/stats', controller.stats)
router.get('/status/:userId', validate({ params: userParamSchema }), controller.status)
router.get('/mutuals/:userId', validate({ params: userParamSchema }), controller.mutuals)

// --------------------------------------------------------------- write

router.post('/', validate({ body: connectSchema }), controller.request)
router.post(
  '/:userId',
  validate({ params: userParamSchema, body: connectSchema.partial() }),
  controller.requestTo,
)

router.patch('/:connectionId',
  validate({ params: connectionParamSchema, body: respondSchema }),
  controller.respond)
router.patch('/:id/accept', validate({ params: idParamSchema }), controller.acceptRequest)
router.patch('/:id/reject', validate({ params: idParamSchema }), controller.rejectRequest)

/**
 * Drops a connection.
 *
 * Only the row-id form exists: it is the one shape that identifies exactly one
 * connection, and both participants may delete it.
 */
router.delete('/:id', validate({ params: idParamSchema }), controller.removeById)

router.post('/block/:userId', validate({ params: userParamSchema }), controller.block)
router.post('/:userId/block', validate({ params: userParamSchema }), controller.block)
router.delete('/:userId/block', validate({ params: userParamSchema }), controller.unblock)
router.delete('/block/:userId', validate({ params: userParamSchema }), controller.unblock)

export default router
