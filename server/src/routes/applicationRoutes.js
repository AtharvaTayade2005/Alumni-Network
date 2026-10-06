import { Router } from 'express'
import { z } from 'zod'
import * as controller from '../controllers/jobController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { applicationQuerySchema, applicationStatusSchema } from '../validators/jobValidators.js'

const applicationParamSchema = z.object({ applicationId: z.string().uuid() })

/**
 * Applications, addressed by application rather than by posting.
 *
 * /api/jobs/:jobId/applications stays for the recruiter's side of the same feature;
 * these paths are what an applicant uses to follow their own applications, which is why
 * they are mounted separately instead of nesting another three levels deep.
 */
const router = Router()

router.use(authenticate)

router.get('/', validate({ query: applicationQuerySchema }), controller.myApplications)
router.get('/:applicationId', validate({ params: applicationParamSchema }),
  controller.getApplication)
router.patch('/:applicationId/status', validate({
  params: applicationParamSchema, body: applicationStatusSchema,
}), controller.reviewById)
router.patch('/:applicationId/withdraw', validate({ params: applicationParamSchema }),
  controller.withdraw)

export default router
