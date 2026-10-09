/**
 * Helper to ensure local PGlite development database is running.
 * If 127.0.0.1:54329 is not reachable in development, automatically starts it.
 */
import net from 'node:net'
import config from './env.js'
import logger from '../utils/logger.js'

let embeddedDevPg = null

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

export async function ensureDevDatabase() {
  if (config.isProduction || config.isTest) return

  let url
  try {
    url = new URL(config.database.url)
  } catch {
    return
  }

  // Only auto-start for the default local dev port 54329
  if (url.port === '54329' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) {
    const isRunning = await isPortOpen(54329)
    if (!isRunning) {
      logger.info('No external PostgreSQL detected on port 54329; auto-starting embedded PGlite...')
      try {
        const { startDevPg } = await import('../../scripts/dev-postgres.js')
        embeddedDevPg = await startDevPg({ quiet: false, registerSignals: false })
        // Wait briefly for socket readiness
        let ready = false
        for (let i = 0; i < 10; i++) {
          if (await isPortOpen(54329)) {
            ready = true
            break
          }
          await new Promise((r) => setTimeout(r, 100))
        }
        if (ready) {
          logger.info('Embedded PGlite is now listening on 127.0.0.1:54329')
        }
      } catch (err) {
        logger.warn('Failed to auto-start embedded PGlite', { error: err.message })
      }
    }
  }
}

export async function stopEmbeddedDevDatabase() {
  if (embeddedDevPg && typeof embeddedDevPg.stop === 'function') {
    await embeddedDevPg.stop()
    embeddedDevPg = null
  }
}
