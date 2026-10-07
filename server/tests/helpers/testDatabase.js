/**
 * Boots a private, in-memory PGlite for the integration suite.
 *
 * The shared `npm run dev:db` server is single-session: a test run that ends
 * while a connection is open leaves it accepting sockets but resetting them,
 * and the next run fails in a confusing way. Tests therefore start their own
 * instance on a reserved port with an ephemeral data directory, so every run
 * starts from an empty database and the server is torn down at the end.
 *
 * The migration SQL is applied through PGlite's own exec() rather than over
 * the wire, which is both faster and avoids contending for the single session
 * before the application has connected.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')

export const TEST_PG_PORT = Number.parseInt(process.env.TEST_PG_PORT ?? '54330', 10)

let db
let server

export async function startTestDatabase() {
  db = await PGlite.create({ dataDir: 'memory://' })
  server = new PGLiteSocketServer({ db, port: TEST_PG_PORT, host: '127.0.0.1', maxConnections: 50 })
  await server.start()

  process.env.DATABASE_URL =
    `postgresql://postgres:postgres@127.0.0.1:${TEST_PG_PORT}/postgres`

  await applyScripts('migrations')
  await applyScripts('seeds')

  return process.env.DATABASE_URL
}

async function applyScripts(kind) {
  const dir = path.join(repoRoot, 'database', kind)
  const files = (await fs.readdir(dir))
    // Rollback companions live beside their migration and are only ever applied
    // by `npm run migrate:down`, never as part of the up sequence.
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), 'utf8')
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`${kind}/${file} failed: ${error.message}`)
    }
  }
  return files.length
}

export async function stopTestDatabase() {
  if (server) await server.stop()
  if (db) await db.close()
  server = undefined
  db = undefined
}

/**
 * Runs a statement on the database itself, without going over the socket.
 *
 * PGLiteSocketServer serves one session at a time and a statement the database refuses
 * ends that session, after which every new connection is reset. Statements used to prove
 * that the database refuses something therefore go straight to the instance, where one
 * rejected statement does not stop the next.
 */
export async function directQuery(text, params = []) {
  const result = await db.query(text, params)
  return { rows: result.rows, rowCount: result.affectedRows }
}
