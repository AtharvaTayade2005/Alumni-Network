import * as fileService from '../services/fileService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getParams, getQuery } from '../middleware/validate.js'
import { sendCreated, sendNoContent, sendSuccess, paginated } from '../utils/response.js'
import { contextOf } from '../utils/requestContext.js'

/**
 * Uploaded file endpoints.
 *
 * The download handler is the only one that does not answer with JSON: it streams the
 * stored bytes with an attachment disposition, so the browser saves the file rather
 * than rendering it in a context that could execute it.
 */

export const upload = asyncHandler(async (req, res) => {
  const file = await fileService.uploadFile(req.user, req.file, {
    kind: req.body?.kind ?? 'resume',
    context: contextOf(req),
  })
  sendCreated(res, file, 'File uploaded')
})

export const getById = asyncHandler(async (req, res) => {
  const file = await fileService.getFile(req.user, getParams(req).fileId)
  sendSuccess(res, file, { message: 'File retrieved' })
})

/**
 * A `Content-Disposition` value that survives a non-ASCII filename.
 *
 * The plain `filename` parameter must be quoted ASCII, so anything else is percent
 * encoded there and the real name is carried by `filename*`, which is what a browser
 * uses to name the saved file. Without the fallback a name like `résumé.pdf` reaches
 * some clients as `r%C3%A9sum%C3%A9.pdf`.
 */
function contentDisposition(disposition, filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export const download = asyncHandler(async (req, res) => {
  const { buffer, contentType, filename, disposition } =
    await fileService.downloadFile(req.user, getParams(req).fileId)

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', buffer.length)
  res.setHeader('Content-Disposition', contentDisposition(disposition, filename))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Belt and braces with the disposition: a response that somehow reaches a browser
  // as a document must not be able to run anything.
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).end(buffer)
})

export const remove = asyncHandler(async (req, res) => {
  await fileService.deleteFile(req.user, getParams(req).fileId, contextOf(req))
  sendNoContent(res)
})

export const listMine = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getQuery(req)
  const result = await fileService.listMyFiles(req.user, { limit, offset })
  paginated(res, result.files, { page, limit, total: result.total },
    { message: 'Files retrieved' })
})
