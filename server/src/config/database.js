import pg from 'pg'
import config from './env.js'
import logger from '../utils/logger.js'

const { Pool, types } = pg

// Return int8 as JS number; every count we select fits in a safe integer.
types.setTypeParser(20, (value) => Number(value))
// Keep NUMERIC as string to avoid float drift on money.
types.setTypeParser(1700, (value) => value)

// PGlite is a single-connection backend: its wire-protocol frontend can only
// serve one session at a time, so a pool larger than one resets the socket as
// soon as a second connection is opened. Ports 54329 (npm run dev:db) and
// 54330 (integration tests) are reserved for these local PGlite servers.
const PGLITE_PORTS = new Set(['54329', '54330'])
const pglitePort = (() => {
  try {
    return new URL(config.database.url).port
  } catch {
    return ''
  }
})()
const isPglite = PGLITE_PORTS.has(pglitePort)
const poolMax = isPglite ? 10 : config.database.poolMax

if (isPglite) {
  logger.warn('PGlite development database detected; forcing a single connection')
}

export const pool = config.database.url
  ? new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null

pool?.on('error', (error) => {
  logger.error('Unexpected idle client error', { error: error.message })
})

export function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL is not configured')
  return pool.query(text, params)
}

export async function withTransaction(fn) {
  if (!pool) throw new Error('DATABASE_URL is not configured')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkDatabaseConnection() {
  if (!pool) return { ok: false, reason: 'not_configured' }
  try {
    const started = Date.now()
    await pool.query('SELECT 1')
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}

export async function closePool() {
  if (pool) await pool.end()
}

export default pool
