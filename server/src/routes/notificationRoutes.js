import { Router } from 'express'
import * as controller from '../controllers/notificationController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { idParamSchema } from '../validators/profileValidators.js'
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js'
import { z } from 'zod'

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z.coerce.boolean().default(false),
  type: z.string().trim().max(40).optional(),
})

/**
 * Muting a type that does not exist looks like it worked and then never does
 * anything, so the vocabulary is checked here rather than letting the row store
 * a string the rest of the system will never compare against anything.
 */
const preferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  mutedTypes: z.array(z.enum(NOTIFICATION_TYPES)).max(20).optional(),
})

const router = Router()

router.use(authenticate)

router.get('/', validate({ query: listSchema }), controller.list)
router.get('/unread-count', controller.unreadCount)
// Both verbs are kept: POST /read-all is the original spelling and clients that
// follow the PATCH convention send this instead. They are the same action, so
// they share the handler rather than growing their own.
router.post('/read-all', controller.markAllRead)
router.patch('/read-all', controller.markAllRead)
router.get('/preferences', controller.getPreferences)
router.patch('/preferences', validate({ body: preferencesSchema }), controller.updatePreferences)
router.put('/preferences', validate({ body: preferencesSchema }), controller.updatePreferences)
router.patch('/:id/read', validate({ params: idParamSchema }), controller.markRead)
router.delete('/:id', validate({ params: idParamSchema }), controller.remove)

export default router
