import { Router } from 'express'
import * as controller from '../controllers/reportController.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole, ROLES } from '../middleware/rbac.js'
import { validate } from '../middleware/validate.js'
import { reportSchema } from '../validators/communityValidators.js'
import { z } from 'zod'

const router = Router()

router.use(authenticate)

const reportIdParamSchema = z.object({
  id: z.string().uuid('Report id must be a UUID'),
}).strict()

const reviewReportSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  description: z.string().trim().max(2000).optional(),
}).strict()

// Regular users can report content
router.post('/', validate({ body: reportSchema }), controller.createReport)

// Moderation staff can list and review reports
router.get('/', requireRole(ROLES.ADMIN, ROLES.MODERATOR), controller.listReports)
router.get('/:id', requireRole(ROLES.ADMIN, ROLES.MODERATOR), validate({ params: reportIdParamSchema }), controller.getReport)
router.patch('/:id', requireRole(ROLES.ADMIN, ROLES.MODERATOR), validate({ params: reportIdParamSchema, body: reviewReportSchema }), controller.reviewReport)

export default router
