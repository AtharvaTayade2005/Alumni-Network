import * as mentorshipService from '../services/mentorshipService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendCreated, sendSuccess, paginated } from '../utils/response.js'
import { contextOf } from '../utils/requestContext.js'
import { mentorshipRequestDefaults } from '../validators/communityValidators.js'

export const request = asyncHandler(async (req, res) => {
  const created = await mentorshipService.requestMentorship(
    req.user.id,
    { ...mentorshipRequestDefaults, ...req.body },
    contextOf(req),
  )
  sendCreated(res, created, 'Mentorship request sent')
})

/** GET /api/mentorship/requests/:id, restricted to the two participants. */
export const getRequest = asyncHandler(async (req, res) => {
  const found = await mentorshipService.getRequest(req.user.id, req.params.id)
  sendSuccess(res, found)
})

export const accept = asyncHandler(async (req, res) => {
  const result = await mentorshipService.acceptRequest(
    req.user.id, req.params.id, req.body, contextOf(req),
  )
  sendSuccess(res, result, { message: 'Mentorship request accepted' })
})

export const reject = asyncHandler(async (req, res) => {
  const result = await mentorshipService.rejectRequest(
    req.user.id, req.params.id, req.body, contextOf(req),
  )
  sendSuccess(res, result, { message: 'Mentorship request declined' })
})

export const cancelById = asyncHandler(async (req, res) => {
  const requestRow = await mentorshipService.cancelMyRequest(
    req.user.id, req.params.id, contextOf(req),
  )
  sendSuccess(res, requestRow, { message: 'Mentorship request cancelled' })
})

export const respond = asyncHandler(async (req, res) => {
  const result = await mentorshipService.respondToRequest(
    req.user.id, req.params.requestId, req.body, contextOf(req),
  )
  sendSuccess(
    res, result,
    {
      message: req.body.status === 'accepted'
        ? 'Mentorship request accepted'
        : 'Mentorship request declined',
    },
  )
})

export const cancel = asyncHandler(async (req, res) => {
  const requestRow = await mentorshipService.cancelMyRequest(
    req.user.id, req.params.requestId, contextOf(req),
  )
  sendSuccess(res, requestRow, { message: 'Mentorship request cancelled' })
})

export const listRequests = asyncHandler(async (req, res) => {
  const result = await mentorshipService.listRequests(req.user.id, getQuery(req))
  sendSuccess(res, result.rows, { meta: { counts: result.counts } })
})

/** GET /api/mentorship/relationships, the spec's name for the mentorships list. */
export const listRelationships = asyncHandler(async (req, res) => {
  const rows = await mentorshipService.listMentorships(req.user.id, getQuery(req))
  sendSuccess(res, rows)
})

export const listMentorships = listRelationships

export const end = asyncHandler(async (req, res) => {
  const relationship = await mentorshipService.endMentorship(
    req.user.id, req.params.relationshipId, req.body, contextOf(req),
  )
  sendSuccess(res, relationship, { message: 'Mentorship ended' })
})

export const endById = asyncHandler(async (req, res) => {
  const relationship = await mentorshipService.endMentorship(
    req.user.id, req.params.id, req.body, contextOf(req),
  )
  sendSuccess(res, relationship, { message: 'Mentorship ended' })
})

export const completeById = asyncHandler(async (req, res) => {
  const relationship = await mentorshipService.completeMentorship(
    req.user.id, req.params.id, contextOf(req),
  )
  sendSuccess(res, relationship, { message: 'Mentorship marked as completed' })
})

export const complete = completeById

export const findMentors = asyncHandler(async (req, res) => {
  const { page, limit, search, industry } = getQuery(req)
  const { rows, total } = await mentorshipService.findAvailableMentors(
    req.user.id, { search, industry, limit, offset: (page - 1) * limit },
  )
  paginated(res, rows, { page, limit, total })
})
