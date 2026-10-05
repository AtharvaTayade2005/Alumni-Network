import * as alumniDirectoryService from '../services/alumniDirectoryService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendSuccess } from '../utils/response.js'
import { paginated } from '../utils/response.js'

/**
 * GET /api/alumni - the alumni directory.
 *
 * The service returns one page plus the total; `paginated` turns that into the
 * standard envelope so the response shape matches every other list endpoint.
 */
export const search = asyncHandler(async (req, res) => {
  const { rows, total } = await alumniDirectoryService.search(getQuery(req))
  const { page, limit } = getQuery(req)
  paginated(res, rows, { page, limit, total })
})

export const facets = asyncHandler(async (req, res) => {
  sendSuccess(res, await alumniDirectoryService.getFacets())
})

export const locations = asyncHandler(async (req, res) => {
  const { limit } = getQuery(req)
  sendSuccess(res, await alumniDirectoryService.getLocations(limit))
})

export default { search, facets, locations }