import * as jobService from '../services/jobService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery, getParams } from '../middleware/validate.js'
import {
  sendCreated, sendNoContent, sendSuccess, paginated,
} from '../utils/response.js'
import { contextOf } from '../utils/requestContext.js'

export const create = asyncHandler(async (req, res) => {
  const job = await jobService.createJob(req.user, req.body, contextOf(req))
  sendCreated(res, job, 'Job posted')
})

export const update = asyncHandler(async (req, res) => {
  const job = await jobService.updateJob(
    req.user, getParams(req).jobId, req.body, contextOf(req),
  )
  sendSuccess(res, job, { message: 'Job updated' })
})

export const remove = asyncHandler(async (req, res) => {
  await jobService.deleteJob(req.user, getParams(req).jobId, contextOf(req))
  sendNoContent(res)
})

export const list = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const result = await jobService.listJobs(req.user, filters)
  paginated(res, result.jobs, result, { message: 'Jobs retrieved' })
})

export const getById = asyncHandler(async (req, res) => {
  const job = await jobService.getJob(getParams(req).jobId, req.user)
  sendSuccess(res, job, { message: 'Job retrieved' })
})

export const listCompanies = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const result = await jobService.listCompanies(filters)
  paginated(res, result.companies, result, { message: 'Companies retrieved' })
})

export const getCompany = asyncHandler(async (req, res) => {
  const result = await jobService.getCompany(
    getParams(req).companyId, req.user, getQuery(req),
  )
  sendSuccess(res, result, { message: 'Company retrieved' })
})

/**
 * The moderation decision, as a named transition.
 *
 * Who may make which move is decided in jobService from the workflow table, so this
 * handler does not repeat it and the two cannot disagree.
 */
export const changeStatus = asyncHandler(async (req, res) => {
  const job = await jobService.changeJobStatus(
    req.user, getParams(req).jobId, req.body.status, req.body.note, contextOf(req),
  )
  sendSuccess(res, job, { message: `Job is now ${job.status}` })
})

export const close = asyncHandler(async (req, res) => {
  const job = await jobService.closeJob(req.user, getParams(req).jobId, contextOf(req))
  sendSuccess(res, job, { message: 'Job closed' })
})

export const moderate = asyncHandler(async (req, res) => {
  const job = await jobService.moderateJob(
    req.user, getParams(req).jobId, req.body.action, req.body.reason, contextOf(req),
  )
  sendSuccess(res, job, {
    message: req.body.action === 'remove' ? 'Posting removed' : 'Posting approved',
  })
})

export const apply = asyncHandler(async (req, res) => {
  const application = await jobService.applyToJob(
    req.user, getParams(req).jobId, req.body, contextOf(req),
  )
  sendCreated(res, application, 'Application submitted')
})

export const listApplications = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const result = await jobService.listApplicationsForJob(
    req.user, getParams(req).jobId, filters,
  )
  paginated(res, result.applications, result, { message: 'Applications retrieved' })
})

/** The posting-relative review path, kept alongside /api/applications/:id/status. */
export const review = asyncHandler(async (req, res) => {
  const application = await jobService.reviewApplication(
    req.user, getParams(req).applicationId, req.body.status, req.body.note, contextOf(req),
  )
  sendSuccess(res, application, { message: 'Application status updated' })
})

export const withdraw = asyncHandler(async (req, res) => {
  const application = await jobService.withdrawApplication(
    req.user, getParams(req).applicationId, contextOf(req),
  )
  sendSuccess(res, application, { message: 'Application withdrawn' })
})

export const myApplications = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const result = await jobService.listMyApplications(req.user, filters)
  paginated(res, result.applications, result, { message: 'Applications retrieved' })
})

/** One application, for the applicant, the poster of its job, and staff. */
export const getApplication = asyncHandler(async (req, res) => {
  const application = await jobService.getApplication(req.user, getParams(req).applicationId)
  sendSuccess(res, application, { message: 'Application retrieved' })
})

/** The application-relative review path. */
export const reviewById = asyncHandler(async (req, res) => {
  const application = await jobService.reviewApplication(
    req.user, getParams(req).applicationId, req.body.status, req.body.note, contextOf(req),
  )
  sendSuccess(res, application, { message: 'Application status updated' })
})

export const save = asyncHandler(async (req, res) => {
  const result = await jobService.saveJob(req.user, getParams(req).jobId)
  sendSuccess(res, result, { message: 'Job saved' })
})

export const unsave = asyncHandler(async (req, res) => {
  const result = await jobService.unsaveJob(req.user, getParams(req).jobId)
  sendSuccess(res, result, { message: 'Job removed from saved' })
})

export const listSaved = asyncHandler(async (req, res) => {
  const filters = getQuery(req)
  const result = await jobService.listSavedJobs(req.user, filters)
  paginated(res, result.jobs, result, { message: 'Saved jobs retrieved' })
})
