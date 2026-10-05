import { z } from 'zod'
import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { uploadLimiter } from '../middleware/rateLimiter.js'
import { uploadAvatar, wrapUpload } from '../middleware/upload.js'
import controller from '../controllers/profileV2Controller.js'
import {
  idParamSchema, putAlumniProfileSchema, putStudentProfileSchema,
  updateProfileSchema, privacySettingsSchema, educationSchema, experienceSchema,
  socialLinkSchema, skillSearchSchema,
} from '../validators/profileValidators.js'

/**
 * Own-profile sub-resources: /profiles/me/..., /alumni/me/... and /students/me/...
 *
 * These are exported as a factory because the same routes have to answer under
 * three mount points. Declaring them once keeps the ownership rule in one place:
 * every route below acts on `req.user.id` and none accepts a target user id, so
 * there is no identifier a caller can tamper with to edit someone else.
 */

const skillsSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(100)).max(30),
})

export function createProfileRouter({ alumniOnly = false, studentOnly = false } = {}) {
  const router = Router()
  router.use(authenticate)

  // The combined read/update, available under every mount point. On the
  // type-specific mounts the strict schema replaces it rather than shadowing it,
  // because Express would never reach a second handler for the same path.
  router.get('/me', controller.getMyProfile)
  if (alumniOnly) {
    router.put('/me', validate({ body: putAlumniProfileSchema }), controller.putAlumniProfile)
    router.patch('/me', validate({ body: putAlumniProfileSchema }), controller.putAlumniProfile)
  } else if (studentOnly) {
    router.put('/me', validate({ body: putStudentProfileSchema }), controller.putStudentProfile)
    router.patch('/me', validate({ body: putStudentProfileSchema }), controller.putStudentProfile)
  } else {
    router.put('/me', validate({ body: updateProfileSchema }), controller.putMyProfile)
    router.patch('/me', validate({ body: updateProfileSchema }), controller.patchMyProfile)
  }

  router.get('/me/privacy', controller.getPrivacy)
  router.patch('/me/privacy', validate({ body: privacySettingsSchema }), controller.updatePrivacy)

  router.get('/me/skills', controller.getSkills)
  router.put('/me/skills', validate({ body: skillsSchema }), controller.setSkills)

  router.get('/me/education', controller.listEducation)
  router.post('/me/education', validate({ body: educationSchema }), controller.addEducation)
  router.delete('/me/education/:id', validate({ params: idParamSchema }), controller.deleteEducation)

  router.get('/me/experience', controller.listExperience)
  router.post('/me/experience', validate({ body: experienceSchema }), controller.addExperience)
  router.delete('/me/experience/:id', validate({ params: idParamSchema }), controller.deleteExperience)

  router.get('/me/social-links', controller.listSocialLinks)
  router.put('/me/social-links', validate({ body: socialLinkSchema }), controller.upsertSocialLink)
  router.delete('/me/social-links/:id', validate({ params: idParamSchema }), controller.deleteSocialLink)

  router.post('/me/photo', uploadLimiter, wrapUpload(uploadAvatar), controller.uploadPhoto)
  router.delete('/me/photo', controller.deletePhoto)

  router.post('/me/verification', controller.submitVerification)
  router.get('/me/verification', controller.verificationHistory)

  return router
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Only claims the request when the segment really is a user id.
 *
 * `/:userId` would otherwise swallow literal sibling paths such as
 * /profiles/directory, which the legacy router owns. Falling through with
 * next('router') hands the request back to the parent, so the older routes keep
 * answering for their own paths instead of failing UUID validation.
 */
function onlyUserId(handler) {
  return (req, res, next) => {
    if (!UUID_RE.test(req.params.userId ?? '')) return next('router')
    return handler(req, res, next)
  }
}

/** Read-only lookups by id, mounted on the same prefixes. */
export function createProfileByIdRouter({ alumniOnly = false, studentOnly = false } = {}) {
  const router = Router()
  router.use(authenticate)

  if (alumniOnly) {
    router.get('/:userId', onlyUserId(controller.getAlumniById))
  } else if (studentOnly) {
    router.get('/:userId', onlyUserId(controller.getStudentById))
  } else {
    router.get('/:userId', onlyUserId(controller.getProfileById))
    router.get('/:userId/skills', onlyUserId(controller.getSkills))
    router.get('/skills', validate({ query: skillSearchSchema }), controller.listSkills)
  }

  return router
}

export default createProfileRouter