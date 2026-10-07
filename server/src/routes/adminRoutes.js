import { Router } from 'express'
import controller from '../controllers/userController.js'
import verificationController from '../controllers/verificationController.js'
import * as reportController from '../controllers/reportController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole, ROLES } from '../middleware/rbac.js'
import {
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserRoleSchema,
  suspendUserSchema,
  auditLogsQuerySchema,
} from '../validators/adminValidators.js'
import {
  verificationQuerySchema,
  verifySchema,
  rejectReasonSchema,
} from '../validators/profileValidators.js'
import { moderationSchema } from '../validators/communityValidators.js'

const router = Router()

// Authorization is enforced twice on purpose. `authenticate` establishes who the
// caller is and therefore runs first, so an anonymous request is reported as
// 401 rather than being lumped in with the 403 that a signed-in non-admin gets.
router.use(authenticate)
router.use(requireRole(ROLES.ADMIN))

// Dashboard analytics
router.get('/dashboard/stats', controller.getDashboardStats)
router.get('/stats', controller.getDashboardStats)

// Audit logs
router.get('/audit-logs', validate({ query: auditLogsQuerySchema }), controller.listAuditLogs)

// User management
router.get('/users', validate({ query: listUsersQuerySchema }), controller.listUsers)
router.get('/users/:userId', validate({ params: userIdParamSchema }), controller.getUser)
router.patch('/users/:userId/activate', validate({ params: userIdParamSchema }), controller.activateUser)
router.patch('/users/:userId/deactivate', validate({ params: userIdParamSchema }), controller.deactivateUser)
router.patch('/users/:userId/suspend', validate({ params: userIdParamSchema, body: suspendUserSchema }), controller.suspendUser)
router.patch('/users/:userId/reactivate', validate({ params: userIdParamSchema }), controller.reactivateUser)
router.patch('/users/:userId/role', validate({ params: userIdParamSchema, body: updateUserRoleSchema }), controller.updateUserRole)

// ------------------------------------------------------------ alumni verification
//
// `pending` is declared before `:userId` so the literal segment is not captured
// as an id and rejected by the UUID validator.

router.get('/alumni/pending',
  validate({ query: verificationQuerySchema }),
  verificationController.listPending)

router.get('/alumni/:userId',
  validate({ params: userIdParamSchema }),
  verificationController.getDetail)

router.patch('/alumni/:userId/verify',
  validate({ params: userIdParamSchema, body: verifySchema }),
  verificationController.verify)

router.patch('/alumni/:userId/reject',
  validate({ params: userIdParamSchema, body: rejectReasonSchema }),
  verificationController.reject)

// Moderation & Reports admin endpoints
router.get('/reports', reportController.listReports)
router.get('/reports/:id', reportController.getReport)
router.patch('/reports/:id', reportController.reviewReport)
router.post('/moderation', validate({ body: moderationSchema }), reportController.executeModeration)

export default router
