import { Router } from 'express'
import healthRoutes from './healthRoutes.js'
import authRoutes from './authRoutes.js'
import oauthRoutes from './oauthRoutes.js'
import profileRoutes from './profileRoutes.js'
import { createProfileRouter, createProfileByIdRouter } from './profileV2Routes.js'
import alumniDirectoryRoutes from './alumniDirectoryRoutes.js'
import connectionRoutes from './connectionRoutes.js'
import messageRoutes from './messageRoutes.js'
import notificationRoutes from './notificationRoutes.js'
import mentorshipRoutes from './mentorshipRoutes.js'
import jobRoutes from './jobRoutes.js'
import applicationRoutes from './applicationRoutes.js'
import fileRoutes from './fileRoutes.js'
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

// The Phase 2 router owns the specification's own-profile paths (/profiles/me and
// its sub-resources) and is mounted first, so it answers those rather than the
// legacy bundle handler. The legacy router is mounted afterwards and still
// answers whatever Phase 2 does not declare, such as /profiles/me/resume.
//
// Express matches in registration order, so the Phase 2 `/:userId` wildcard would
// otherwise swallow /profiles/directory. It falls through with next('router') for
// any segment that is not a UUID, letting those requests continue to the legacy
// directory routes instead of failing id validation.
router.use('/profiles', createProfileRouter())
router.use('/profiles', createProfileByIdRouter())
router.use('/profiles', profileRoutes)

// /alumni serves both the caller's own alumni profile (/alumni/me) and the
// public directory (/alumni). The directory router only matches /, /facets and
// /locations, so it cannot swallow the /me routes.
router.use('/alumni', createProfileRouter({ alumniOnly: true }))
router.use('/alumni', createProfileByIdRouter({ alumniOnly: true }))
router.use('/alumni', alumniDirectoryRoutes)

router.use('/students', createProfileRouter({ studentOnly: true }))
router.use('/students', createProfileByIdRouter({ studentOnly: true }))

router.use('/connections', connectionRoutes)
router.use('/messages', messageRoutes)
router.use('/notifications', notificationRoutes)
router.use('/mentorship', mentorshipRoutes)
router.use('/jobs', jobRoutes)
// The applicant-facing half of the job feature: their own applications, addressed by
// application rather than by posting, plus the file endpoints that carry a resume.
router.use('/applications', applicationRoutes)
router.use('/files', fileRoutes)
router.use('/admin', adminRoutes)

router.use((req) => {
  throw notFound(`Route ${req.method} ${req.originalUrl}`)
})

export default router
