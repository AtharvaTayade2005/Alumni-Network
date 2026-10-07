import * as reportService from '../services/reportService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendCreated, sendSuccess } from '../utils/response.js'
import { getBody, getParams, getQuery } from '../middleware/validate.js'

function contextOf(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') }
}

export const createReport = asyncHandler(async (req, res) => {
  const body = getBody(req)
  const report = await reportService.createReport(req.user, body, contextOf(req))
  sendCreated(res, { report }, 'Report submitted successfully')
})

export const listReports = asyncHandler(async (req, res) => {
  const query = getQuery(req)
  const result = await reportService.listReports(query)
  sendSuccess(res, result.reports, { meta: result.meta })
})

export const getReport = asyncHandler(async (req, res) => {
  const { id } = getParams(req)
  const report = await reportService.getReport(id)
  sendSuccess(res, { report })
})

export const reviewReport = asyncHandler(async (req, res) => {
  const { id } = getParams(req)
  const body = getBody(req)
  const report = await reportService.reviewReport(req.user, id, body, contextOf(req))
  sendSuccess(res, { report }, { message: 'Report reviewed' })
})

export const executeModeration = asyncHandler(async (req, res) => {
  const body = getBody(req)
  const result = await reportService.executeModeration(req.user, body, contextOf(req))
  sendSuccess(res, result, { message: 'Moderation action executed' })
})
