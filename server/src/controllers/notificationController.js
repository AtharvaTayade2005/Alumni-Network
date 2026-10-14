import * as notificationService from '../services/notificationService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendSuccess } from '../utils/response.js'
import { notFound } from '../utils/errors.js'

export const list = asyncHandler(async (req, res) => {
  const { page, limit, offset, unreadOnly, type } = getQuery(req)
  const result = await notificationService.list(req.user.id, {
    page, limit, offset, unreadOnly, type,
  })
  sendSuccess(res, result.rows, {
    meta: { page, limit, total: result.total, unread: result.unread },
  })
})

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.user.id)
  sendSuccess(res, { unread: count, count })
})

export const markRead = asyncHandler(async (req, res) => {
  const ok = await notificationService.markRead(req.user.id, req.params.id)
  if (!ok) throw notFound('Notification')
  sendSuccess(res, null, { message: 'Marked as read' })
})

export const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllRead(req.user.id)
  sendSuccess(res, { markedRead: count }, { message: 'All notifications marked as read' })
})

export const remove = asyncHandler(async (req, res) => {
  const ok = await notificationService.remove(req.user.id, req.params.id)
  if (!ok) throw notFound('Notification')
  sendSuccess(res, null, { message: 'Notification deleted' })
})

export const getPreferences = asyncHandler(async (req, res) => {
  const prefs = await notificationService.getPreferences(req.user.id)
  sendSuccess(res, prefs)
})

export const updatePreferences = asyncHandler(async (req, res) => {
  const prefs = await notificationService.updatePreferences(req.user.id, req.body)
  sendSuccess(res, prefs, { message: 'Notification preferences updated' })
})
