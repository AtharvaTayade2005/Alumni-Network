import * as connectionService from '../services/connectionService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendCreated, sendSuccess } from '../utils/response.js'

export const list = asyncHandler(async (req, res) => {
  const result = await connectionService.listConnections(req.user.id, getQuery(req))
  sendSuccess(res, result.rows, { meta: { counts: result.counts } })
})

/**
 * Sends a request to the member named in the path.
 *
 * POST /api/connections keeps the older body-addressed form, where the target
 * arrives as `userId` in the body.
 */
export const requestTo = asyncHandler(async (req, res) => {
  const connection = await connectionService.sendRequest({
    requesterId: req.user.id,
    addresseeId: req.params.userId,
    message: req.body?.message,
  })
  sendCreated(res, connection, 'Connection request sent')
})

export const pending = asyncHandler(async (req, res) => {
  const requests = await connectionService.listPending(req.user.id, getQuery(req))
  sendSuccess(res, requests)
})

export const request = asyncHandler(async (req, res) => {
  const connection = await connectionService.sendRequest({
    requesterId: req.user.id,
    addresseeId: req.body.userId,
    message: req.body.message,
  })
  sendCreated(res, connection, 'Connection request sent')
})

/**
 * PATCH /api/connections/:id/accept and /reject.
 *
 * The older PATCH /:connectionId form reads `action` from the body and is kept
 * working; both reach the same service call.
 */
export const acceptRequest = asyncHandler(async (req, res) => {
  const connection = await connectionService.respond({
    connectionId: req.params.id,
    userId: req.user.id,
    accept: true,
  })
  sendSuccess(res, connection, { message: 'Connection accepted' })
})

export const rejectRequest = asyncHandler(async (req, res) => {
  const connection = await connectionService.respond({
    connectionId: req.params.id,
    userId: req.user.id,
    accept: false,
  })
  sendSuccess(res, connection, { message: 'Connection declined' })
})

export const respond = asyncHandler(async (req, res) => {
  const { connectionId } = req.params
  const { action } = req.body
  const connection = await connectionService.respond({
    connectionId,
    userId: req.user.id,
    accept: action === 'accept',
  })
  sendSuccess(
    res, connection,
    { message: action === 'accept' ? 'Connection accepted' : 'Connection declined' },
  )
})

/** DELETE /api/connections/:id, addressed by connection id. */
export const removeById = asyncHandler(async (req, res) => {
  await connectionService.removeById(req.user.id, req.params.id)
  sendSuccess(res, null, { message: 'Connection removed' })
})

export const block = asyncHandler(async (req, res) => {
  await connectionService.block(req.user.id, req.params.userId)
  sendSuccess(res, null, { message: 'User blocked' })
})

export const unblock = asyncHandler(async (req, res) => {
  await connectionService.unblock(req.user.id, req.params.userId)
  sendSuccess(res, null, { message: 'User unblocked' })
})

export const status = asyncHandler(async (req, res) => {
  const state = await connectionService.getRequestState(req.user.id, req.params.userId)
  sendSuccess(res, { state })
})

export const mutuals = asyncHandler(async (req, res) => {
  const mutuals = await connectionService.getMutuals(req.user.id, req.params.userId)
  sendSuccess(res, mutuals)
})

export const stats = asyncHandler(async (req, res) => {
  const result = await connectionService.getStats(req.user.id)
  sendSuccess(res, result)
})
