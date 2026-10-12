import * as announcementService from '../services/announcementService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendCreated, sendSuccess } from '../utils/response.js'

export const list = asyncHandler(async (req, res) => {
  const result = await announcementService.listAnnouncements(req.user, req.query)
  sendSuccess(res, result.announcements, { meta: { total: result.total } })
})

export const get = asyncHandler(async (req, res) => {
  const announcement = await announcementService.getAnnouncement(req.user, req.params.id)
  sendSuccess(res, announcement)
})

export const create = asyncHandler(async (req, res) => {
  const announcement = await announcementService.createAnnouncement(req.user, req.body)
  sendCreated(res, announcement, 'Announcement published successfully')
})

export const update = asyncHandler(async (req, res) => {
  const announcement = await announcementService.updateAnnouncement(req.user, req.params.id, req.body)
  sendSuccess(res, announcement, { message: 'Announcement updated successfully' })
})

export const remove = asyncHandler(async (req, res) => {
  await announcementService.deleteAnnouncement(req.user, req.params.id)
  sendSuccess(res, null, { message: 'Announcement deleted successfully' })
})
