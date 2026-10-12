import * as directoryService from '../services/directoryService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendSuccess } from '../utils/response.js'

export const search = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = getQuery(req)
  const offset = (page - 1) * limit
  const result = await directoryService.searchDirectory({ ...filters, limit, offset }, req.user?.id)
  sendSuccess(res, result.rows, {
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  })
})

export const map = asyncHandler(async (req, res) => {
  const points = await directoryService.getMapPoints(getQuery(req))
  sendSuccess(res, points, { meta: { count: points.length } })
})

export const filters = asyncHandler(async (req, res) => {
  const options = await directoryService.getFilterOptions()
  sendSuccess(res, options)
})
