import * as eventService from '../services/eventService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendSuccess } from '../utils/response.js'

export const list = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const { events, ...page } = await eventService.listEvents(req.user, filters)
  sendSuccess(res, events, { meta: page })
})

export const mine = asyncHandler(async (req, res) => {
  const filters = { ...getQuery(req), mine: true }
  const { events, ...page } = await eventService.listEvents(req.user, filters)
  sendSuccess(res, events, { meta: page })
})

export const myRsvps = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const rsvps = await eventService.listMyRsvps(req.user, filters)
  sendSuccess(res, rsvps, {
    meta: { page: filters.page ?? 1, limit: filters.limit ?? 20, total: rsvps.length },
  })
})

export const get = asyncHandler(async (req, res) => {
  const event = await eventService.getEvent(req.user, req.params.id)
  sendSuccess(res, event)
})

export const create = asyncHandler(async (req, res) => {
  const event = await eventService.createEvent(req.user, req.body)
  sendSuccess(res, event, { status: 201 })
})

export const update = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(req.user, req.params.id, req.body)
  sendSuccess(res, event)
})

export const remove = asyncHandler(async (req, res) => {
  await eventService.deleteEvent(req.user, req.params.id)
  sendSuccess(res, null, { message: 'Event deleted' })
})

/**
 * Publishing and cancelling are separate endpoints rather than one
 * `PATCH /status`, so a client cannot move an event by a field it should not be
 * sending, and so cancelling can insist on a reason.
 */
export const publish = asyncHandler(async (req, res) => {
  const event = await eventService.changeStatus(req.user, req.params.id, 'PUBLISHED')
  sendSuccess(res, event)
})

export const cancel = asyncHandler(async (req, res) => {
  const event = await eventService.changeStatus(req.user, req.params.id, 'CANCELLED', {
    reason: req.body?.reason,
  })
  sendSuccess(res, event)
})

export const complete = asyncHandler(async (req, res) => {
  const event = await eventService.changeStatus(req.user, req.params.id, 'COMPLETED')
  sendSuccess(res, event)
})

export const rsvp = asyncHandler(async (req, res) => {
  const answer = await eventService.rsvp(req.user, req.params.id, req.body)
  sendSuccess(res, answer, { message: 'RSVP saved' })
})

export const cancelRsvp = asyncHandler(async (req, res) => {
  await eventService.cancelRsvp(req.user, req.params.id)
  sendSuccess(res, null, { message: 'RSVP withdrawn' })
})

export const listRsvps = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const rsvps = await eventService.listRsvps(req.user, req.params.id, filters)
  sendSuccess(res, rsvps, {
    meta: { page: filters.page ?? 1, limit: filters.limit ?? 50, total: rsvps.length },
  })
})

export const listAttendees = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const attendees = await eventService.listAttendees(req.user, req.params.id, filters)
  sendSuccess(res, attendees, {
    meta: { page: filters.page ?? 1, limit: filters.limit ?? 100, total: attendees.length },
  })
})

export const addAttendee = asyncHandler(async (req, res) => {
  const attendee = await eventService.addAttendee(req.user, req.params.id, req.body)
  sendSuccess(res, attendee, { status: 201 })
})

export const checkIn = asyncHandler(async (req, res) => {
  const attendee = await eventService.setCheckIn(
    req.user, req.params.id, req.params.userId, req.body,
  )
  sendSuccess(res, attendee, { message: req.body.checkedIn ? 'Checked in' : 'Check-in undone' })
})

export const setNotes = asyncHandler(async (req, res) => {
  const attendee = await eventService.setAttendeeNotes(
    req.user, req.params.id, req.params.userId, req.body.notes,
  )
  sendSuccess(res, attendee)
})

export const removeAttendee = asyncHandler(async (req, res) => {
  await eventService.removeAttendee(req.user, req.params.id, req.params.userId)
  sendSuccess(res, null, { message: 'Attendee removed' })
})

export const myAttendance = asyncHandler(async (req, res) => {
  const attendee = await eventService.myAttendance(req.user, req.params.id)
  sendSuccess(res, attendee)
})