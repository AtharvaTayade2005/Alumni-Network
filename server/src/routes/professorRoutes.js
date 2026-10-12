import { Router } from 'express'
import * as controller from '../controllers/professorController.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.use(authenticate)

router.get('/analytics', controller.getAnalytics)

export default router
