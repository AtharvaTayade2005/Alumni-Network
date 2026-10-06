import multer from 'multer'
import config from '../config/env.js'
import { unprocessable } from '../utils/errors.js'
import { validateDocumentUpload } from '../services/storageService.js'

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function memoryStorage() {
  return multer.memoryStorage()
}

function filterFactory(allowed) {
  return (_req, file, cb) => {
    if (!allowed.includes(file.mimetype)) {
      return cb(unprocessable(
        `Unsupported file type: ${file.mimetype}. Allowed: ${allowed.join(', ')}`,
      ))
    }
    cb(null, true)
  }
}

/**
 * Uploads are buffered in memory and validated before anything is written.
 *
 * The declared type is checked here so an obviously wrong upload is refused before
 * the whole file is buffered, but nothing is trusted on the strength of it: the
 * bytes are confirmed by the storage layer once the file has arrived.
 */
export const uploadResume = multer({
  storage: memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: filterFactory([...config.uploads.allowedMime]),
}).single('file')

export const uploadAvatar = multer({
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: filterFactory(IMAGE_MIME),
}).single('file')

/**
 * Re-exported so upload middleware callers do not need to know that content
 * sniffing lives in the storage layer. There is one implementation of "is this
 * really a document", and it is the one that decides what gets written to disk.
 */
export const assertValidResumeFile = validateDocumentUpload

/**
 * Files are never served from a public static mount. Access is granted per request
 * by the file service after an authorization check.
 */
export function wrapUpload(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(unprocessable(`File exceeds the ${config.uploads.maxBytes} byte limit`))
      }
      return next(unprocessable(`Upload failed: ${error.message}`))
    }
    next(error)
  })
}
