import { Router } from 'express'
import controller from '../controllers/userController.js'
import verificationController from '../controllers/verificationController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole, ROLES } from '../middleware/rbac.js'
import { listUsersQuerySchema, userIdParamSchema } from '../validators/adminValidators.js'
import {
  verificationQuerySchema, verifySchema, rejectReasonSchema,
} from '../validators/profileValidators.js'

const router = Router()

// Authorization is enforced twice on purpose. `authenticate` establishes who the
// caller is and therefore runs first, so an anonymous request is reported as
// 401 rather than being lumped in with the 403 that a signed-in non-admin gets.
router.use(authenticate)
router.use(requireRole(ROLES.ADMIN))

router.get('/users', validate({ query: listUsersQuerySchema }), controller.listUsers)
router.get('/users/:userId', validate({ params: userIdParamSchema }), controller.getUser)

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

export default router
