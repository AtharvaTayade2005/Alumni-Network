import * as userService from '../services/userService.js'
import * as auditService from '../services/auditService.js'
import { sendSuccess } from '../utils/response.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery, getParams, getBody } from '../middleware/validate.js'

function contextOf(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') }
}

export const listUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page, limit } = getQuery(req)
  const result = await userService.listUsers({ search, role, status, page, limit })
  return sendSuccess(res, result.users, { meta: result.meta })
})

export const getUser = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const { user } = await userService.getUser(userId)
  return sendSuccess(res, { user })
})

export const getDashboardStats = asyncHandler(async (_req, res) => {
  const stats = await userService.getDashboardStats()
  return sendSuccess(res, stats)
})

export const activateUser = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const result = await userService.activateUser(req.user.id, userId, contextOf(req))
  return sendSuccess(res, result, { message: 'User activated successfully' })
})

export const deactivateUser = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const result = await userService.deactivateUser(req.user.id, userId, contextOf(req))
  return sendSuccess(res, result, { message: 'User deactivated successfully' })
})

export const suspendUser = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const body = getBody(req) ?? {}
  const result = await userService.suspendUser(req.user.id, userId, body, contextOf(req))
  return sendSuccess(res, result, { message: 'User suspended successfully' })
})

export const reactivateUser = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const result = await userService.reactivateUser(req.user.id, userId, contextOf(req))
  return sendSuccess(res, result, { message: 'User reactivated successfully' })
})

export const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = getParams(req)
  const body = getBody(req)
  const result = await userService.updateUserRole(req.user.id, userId, body, contextOf(req))
  return sendSuccess(res, result, { message: 'User role updated successfully' })
})

export const listAuditLogs = asyncHandler(async (req, res) => {
  const query = getQuery(req) ?? {}
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = (page - 1) * limit

  const result = await auditService.list({
    limit,
    offset,
    action: query.action,
    entityType: query.entityType ?? query.targetType,
    actorId: query.actorId,
    from: query.from,
    to: query.to,
  })

  return sendSuccess(res, result.rows, {
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit) || 1,
    },
  })
})

export default {
  listUsers,
  getUser,
  getDashboardStats,
  activateUser,
  deactivateUser,
  suspendUser,
  reactivateUser,
  updateUserRole,
  listAuditLogs,
}