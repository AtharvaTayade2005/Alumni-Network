import * as conversationService from '../services/conversationService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendCreated, sendSuccess } from '../utils/response.js'

export const listConversations = asyncHandler(async (req, res) => {
  sendSuccess(res, await conversationService.listConversations(req.user.id, getQuery(req)))
})

export const openConversation = asyncHandler(async (req, res) => {
  const { peerId } = req.body
  sendSuccess(res, await conversationService.openDirectConversation(req.user.id, peerId))
})

export const getConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params
  sendSuccess(res, await conversationService.getConversation(req.user.id, conversationId))
})

export const listMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params
  sendSuccess(
    res,
    await conversationService.listMessages(req.user.id, conversationId, getQuery(req)),
  )
})

export const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId } = req.params
  const message = await conversationService.sendMessage(
    req.user.id,
    conversationId,
    req.body,
  )
  sendCreated(res, message, 'Message sent')
})

export const markRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params
  const position = await conversationService.markRead(
    req.user.id,
    conversationId,
    req.body,
  )
  sendSuccess(res, { conversationId, ...position })
})

export const unreadCount = asyncHandler(async (req, res) => {
  sendSuccess(res, { unread: await conversationService.unreadCount(req.user.id) })
})

export const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params
  sendSuccess(res, await conversationService.deleteMessage(req.user.id, messageId))
})