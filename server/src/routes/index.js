import { Router } from 'express'
import healthRoutes from './healthRoutes.js'
import authRoutes from './authRoutes.js'
import oauthRoutes from './oauthRoutes.js'
import profileRoutes from './profileRoutes.js'
import connectionRoutes from './connectionRoutes.js'
import messageRoutes from './messageRoutes.js'
import notificationRoutes from './notificationRoutes.js'
import mentorshipRoutes from './mentorshipRoutes.js'
import jobRoutes from './jobRoutes.js'
import adminRoutes from './adminRoutes.js'
import { csrfProtection, assertDatabaseAvailable } from '../middleware/security.js'
import { notFound } from '../utils/errors.js'

const router = Router()

// Liveness first: it must answer even when the database is unreachable.
router.use('/health', healthRoutes)

router.use(assertDatabaseAvailable)
router.use(csrfProtection)

// Each router below is responsible for its own authentication; anything that
// does not match a route must 404 rather than 401, so no blanket authenticate
// middleware is applied here.
router.use('/auth', authRoutes)
router.use('/auth', oauthRoutes)
router.use('/profiles', profileRoutes)
router.use('/connections', connectionRoutes)
router.use('/messages', messageRoutes)
router.use('/notifications', notificationRoutes)
router.use('/mentorship', mentorshipRoutes)
router.use('/jobs', jobRoutes)
router.use('/admin', adminRoutes)

router.use((req) => {
  throw notFound(`Route ${req.method} ${req.originalUrl}`)
})

export default router
