import { Router } from 'express'
import * as controller from '../controllers/profileController.js'
import * as directoryController from '../controllers/directoryController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { uploadLimiter } from '../middleware/rateLimiter.js'
import { uploadResume, wrapUpload } from '../middleware/upload.js'
import {
  updateProfileSchema, privacySettingsSchema, educationSchema, experienceSchema,
  socialLinkSchema, skillSearchSchema, userParamSchema, idParamSchema,
  directorySearchSchema, mapSchema,
} from '../validators/profileValidators.js'

const router = Router()

router.use(authenticate)

// Directory and map are read-heavy; they come before the /:userId wildcard
// so "search", "map" and "filters" are not captured as a user id.
router.get('/directory', validate({ query: directorySearchSchema }), directoryController.search)
router.get('/directory/filters', directoryController.filters)
router.get('/directory/map', validate({ query: mapSchema }), directoryController.map)
router.get('/skills', validate({ query: skillSearchSchema }), controller.listSkills)

// Current user's own profile
router.get('/me', controller.getMyProfile)
router.patch('/me', validate({ body: updateProfileSchema }), controller.updateMyProfile)
router.get('/me/privacy', controller.getPrivacy)
router.patch('/me/privacy', validate({ body: privacySettingsSchema }), controller.updatePrivacy)
router.get('/me/education', controller.listEducation)
router.post('/me/education', validate({ body: educationSchema }), controller.addEducation)
router.delete('/me/education/:id', validate({ params: idParamSchema }), controller.deleteEducation)
router.get('/me/experience', controller.listExperience)
router.post('/me/experience', validate({ body: experienceSchema }), controller.addExperience)
router.delete('/me/experience/:id', validate({ params: idParamSchema }), controller.deleteExperience)
router.get('/me/social-links', controller.getSocialLinks)
router.put('/me/social-links', validate({ body: socialLinkSchema }), controller.upsertSocialLink)
router.delete('/me/social-links/:id', validate({ params: idParamSchema }), controller.deleteSocialLink)
router.post(
  '/me/resume',
  uploadLimiter, wrapUpload(uploadResume), controller.uploadResume,
)
router.get('/me/resume', controller.getResume)
router.delete('/me/resume', controller.deleteResume)

// Other users' profiles
router.get('/:userId', validate({ params: userParamSchema }), controller.getProfile)
router.get('/:userId/skills', validate({ params: userParamSchema }), controller.getSkills)

export default router
