import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import controller from '../controllers/alumniDirectoryController.js'
import { alumniDirectorySchema, facetsQuerySchema } from '../validators/profileValidators.js'

const router = Router()

/**
 * GET /api/alumni - the alumni directory.
 *
 * Authentication is required but not authorisation: any signed-in member may
 * search, and what they see is decided per row by the owner's privacy settings
 * inside the service.
 */
router.use(authenticate)

// Declared before `/:userId`-style routes would be needed; there are none here,
// but keeping search endpoints together at the top documents the intent.
router.get('/facets', controller.facets)
router.get('/locations', validate({ query: facetsQuerySchema }), controller.locations)
router.get('/', validate({ query: alumniDirectorySchema }), controller.search)

export default router