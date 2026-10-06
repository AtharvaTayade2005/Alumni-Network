import * as messageService from '../services/messageService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendCreated, sendSuccess } from '../utils/response.js'
import { forbidden } from '../utils/errors.js'
import { emitToUsers, roomName } from '../sockets/index.js'

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await messageService.listConversations(req.user.id)
  sendSuccess(res, conversations)
})

export const listMessages = asyncHandler(async (req, res) => {
  const { peerId } = req.params
  const messages = await messageService.listMessages(req.user.id, peerId, getQuery(req))
  sendSuccess(res, messages)
})

export const sendMessage = asyncHandler(async (req, res) => {
  const { recipientId, body } = req.body

  const allowed = await messageService.assertConversationMember(req.user.id, recipientId)
  if (!allowed) throw forbidden('You cannot message this person')

  const message = await messageService.sendMessage({
    senderId: req.user.id,
    recipientId,
    body,
  })

  await emitToUsers([req.user.id, recipientId], 'message:new', {
    ...message,
    conversationId: message.conversationId ?? roomName(req.user.id, recipientId),
  })

  sendCreated(res, message, 'Message sent')
})

export const markRead = asyncHandler(async (req, res) => {
  const { peerId } = req.params
  const count = await messageService.markRead(req.user.id, peerId)
  sendSuccess(res, { markedRead: count })
})

export const searchMessages = asyncHandler(async (req, res) => {
  const { q, limit } = getQuery(req)
  const results = await messageService.searchMessages(req.user.id, q, limit)
  sendSuccess(res, results)
})
