import * as userService from '../services/userService.js'
import { sendSuccess } from '../utils/response.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery, getParams } from '../middleware/validate.js'

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

export default { listUsers, getUser }