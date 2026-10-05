import { AppError } from '../utils/errors.js'
import config from '../config/env.js'
import logger from '../utils/logger.js'

export function notFoundHandler(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`))
}

const PG_ERROR_MAP = {
  '23505': [409, 'A record with these details already exists'],
  '23503': [409, 'Referenced record does not exist'],
  '23514': [422, 'A database constraint was violated'],
  '22P02': [400, 'Malformed identifier'],
  '22001': [400, 'A value exceeded the maximum allowed length'],
}

export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode ?? 500
  let message = err.message ?? 'Internal server error'
  let code = err.code ?? 'INTERNAL_ERROR'
  let details = err.details

  if (err instanceof AppError) {
    statusCode = err.statusCode
    code = err.code
  } else if (PG_ERROR_MAP[err.code]) {
    const [mappedStatus, mappedMessage] = PG_ERROR_MAP[err.code]
    statusCode = mappedStatus
    message = mappedMessage
    code = err.code
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401
    message = 'Invalid or expired session'
    code = 'UNAUTHENTICATED'
  } else if (err.type === 'entity.too.large') {
    statusCode = 413
    message = 'Request body is too large'
    code = 'PAYLOAD_TOO_LARGE'
  }

  const logContext = {
    method: req.method,
    path: req.originalUrl,
    status: statusCode,
    code,
    userId: req.user?.id,
  }
  if (statusCode >= 500) {
    logContext.error = err.message
    logContext.stack = err.stack
    logger.error('Unhandled request error', logContext)
  } else {
    logger.warn('Request rejected', logContext)
  }

  // The documented envelope is { success:false, error:{ code, message, details } }.
  // `message` is also kept at the top level and details are mirrored to `errors`
  // because the existing frontend error handling reads those two locations.
  const error = { code, message }
  if (details) error.details = Array.isArray(details) ? details : [details]
  if (!config.isProduction && statusCode >= 500) error.stack = err.stack

  const body = { success: false, message, error }
  if (error.details) body.errors = error.details

  res.status(statusCode).json(body)
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}
