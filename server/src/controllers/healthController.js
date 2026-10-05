import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSuccess } from '../utils/response.js'
import { query } from '../config/database.js'
import config from '../config/env.js'
import { serviceUnavailable } from '../utils/errors.js'

/**
 * Readiness probe: unlike a pure liveness check this actually touches the
 * database, so orchestrators only route traffic once the API can serve it.
 *
 * The payload uses the same envelope as every other endpoint so a single client
 * can parse all responses identically.
 */
export const health = asyncHandler(async (req, res) => {
  const checks = { database: 'connected' }
  let degraded = false

  try {
    await query('SELECT 1')
  } catch {
    checks.database = 'disconnected'
    degraded = true
  }

  if (degraded) {
    throw serviceUnavailable('Service is not ready', { checks })
  }

  return sendSuccess(res, {
    status: 'ok',
    service: 'Alumni Network Portal API',
    environment: config.env,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  })
})

export default { health }
