import { Router } from 'express'
import { z } from 'zod'
import * as controller from '../controllers/jobController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import {
  jobSchema, jobUpdateSchema, jobQuerySchema, jobStatusSchema, jobCloseSchema,
  jobModerationSchema, applicationSchema, applicationStatusSchema,
  applicationQuerySchema, companyQuerySchema,
} from '../validators/jobValidators.js'

const jobParamSchema = z.object({ jobId: z.string().uuid() })
const applicationParamSchema = z.object({ applicationId: z.string().uuid() })
const companyParamSchema = z.object({ companyId: z.string().uuid() })

const router = Router()

router.use(authenticate)

router.get('/companies', validate({ query: companyQuerySchema }), controller.listCompanies)
router.get('/companies/:companyId', validate({
  params: companyParamSchema, query: companyQuerySchema,
}), controller.getCompany)

/**
 * Everything personal to the caller is declared before the '/:jobId' routes.
 *
 * Express matches in registration order, so '/saved' would otherwise be read as a job
 * id and fail validation.
 */
router.get('/saved', validate({ query: jobQuerySchema }), controller.listSaved)
router.delete('/saved/:jobId', validate({ params: jobParamSchema }), controller.unsave)
router.get('/applications', validate({ query: applicationQuerySchema }),
  controller.myApplications)
router.patch('/applications/:applicationId', validate({
  params: applicationParamSchema, body: applicationStatusSchema,
}), controller.reviewById)
router.patch(
  '/applications/:applicationId/withdraw',
  validate({ params: applicationParamSchema }),
  controller.withdraw,
)

router.get('/', validate({ query: jobQuerySchema }), controller.list)
router.post('/', validate({ body: jobSchema }), controller.create)
router.get('/:jobId', validate({ params: jobParamSchema }), controller.getById)
router.put(
  '/:jobId',
  validate({ params: jobParamSchema, body: jobUpdateSchema }),
  controller.update,
)
router.delete('/:jobId', validate({ params: jobParamSchema }), controller.remove)

/**
 * The moderation workflow.
 *
 * PATCH /:jobId/status is the general transition endpoint and is where the workflow in
 * jobService is enforced; PATCH /:jobId/close is the owner's shorthand for the one
 * transition they make most often. Neither writes through PUT, because a content edit
 * has no business changing a posting's state.
 */
router.patch('/:jobId/status', validate({
  params: jobParamSchema, body: jobStatusSchema,
}), controller.changeStatus)
router.patch('/:jobId/close', validate({
  params: jobParamSchema, body: jobCloseSchema,
}), controller.close)

router.get(
  '/:jobId/applications',
  validate({ params: jobParamSchema, query: applicationQuerySchema }),
  controller.listApplications,
)
router.post(
  '/:jobId/applications',
  validate({ params: jobParamSchema, body: applicationSchema }),
  controller.apply,
)
router.patch(
  '/:jobId/applications/:applicationId',
  validate({
    params: jobParamSchema.merge(applicationParamSchema),
    body: applicationStatusSchema,
  }),
  controller.review,
)
// The pre-existing moderation path, kept working; it maps onto the same transitions.
router.patch(
  '/:jobId/moderate',
  validate({ params: jobParamSchema, body: jobModerationSchema }),
  controller.moderate,
)

router.post('/:jobId/save', validate({ params: jobParamSchema }), controller.save)
// DELETE as well as POST: removing a saved posting is not a state change, so it has
// no body and reads better as the verb it is.
router.delete('/:jobId/save', validate({ params: jobParamSchema }), controller.unsave)

export default router
