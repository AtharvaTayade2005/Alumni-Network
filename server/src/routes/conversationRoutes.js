import { Router } from 'express'
import * as controller from '../controllers/conversationController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import {
  openConversationSchema,
  conversationParamSchema,
  messageParamSchema,
  postMessageSchema,
  markConversationReadSchema,
  listMessagesQuerySchema,
  listConversationsQuerySchema,
} from '../validators/conversationValidators.js'

const router = Router()

router.use(authenticate)

router.get(
  '/',
  validate({ query: listConversationsQuerySchema }),
  controller.listConversations,
)
router.get('/unread-count', controller.unreadCount)
router.post('/', validate({ body: openConversationSchema }), controller.openConversation)

router.get(
  '/:conversationId',
  validate({ params: conversationParamSchema }),
  controller.getConversation,
)
router.get(
  '/:conversationId/messages',
  validate({ params: conversationParamSchema, query: listMessagesQuerySchema }),
  controller.listMessages,
)
router.post(
  '/:conversationId/messages',
  validate({ params: conversationParamSchema, body: postMessageSchema }),
  controller.sendMessage,
)
router.patch(
  '/:conversationId/read',
  validate({ params: conversationParamSchema, body: markConversationReadSchema }),
  controller.markRead,
)

router.delete(
  '/messages/:messageId',
  validate({ params: messageParamSchema }),
  controller.deleteMessage,
)

export default router