import { Router } from 'express'
import * as controller from '../controllers/fileController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { uploadResume, wrapUpload } from '../middleware/upload.js'
import { fileParamSchema, fileQuerySchema, fileUploadSchema } from '../validators/jobValidators.js'

/**
 * Uploaded files.
 *
 * Nothing here is public: every route requires a session, and the download route
 * re-checks permission per request rather than trusting the fact that the caller once
 * had a link. The storage directory is not mounted anywhere, so these are the only way
 * to read a stored file.
 */
const router = Router()

router.use(authenticate)

// Both spellings are accepted because "POST /files" is the obvious one and
// "POST /files/resume" says what the file is; they run the same handler.
router.post('/', wrapUpload(uploadResume), validate({ body: fileUploadSchema }),
  controller.upload)
router.post('/resume', wrapUpload(uploadResume), validate({ body: fileUploadSchema }),
  controller.upload)

router.get('/', validate({ query: fileQuerySchema }), controller.listMine)
router.get('/:fileId', validate({ params: fileParamSchema }), controller.getById)
router.get('/:fileId/download', validate({ params: fileParamSchema }), controller.download)
router.delete('/:fileId', validate({ params: fileParamSchema }), controller.remove)

export default router
