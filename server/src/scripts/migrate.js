import 'dotenv/config'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, query, closePool } from '../config/database.js'
import { ensureDevDatabase } from '../config/devDbAutoStart.js'

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'database',
  'migrations',
)

async function ensureMigrationsTable() {
  await ensureDevDatabase()
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function appliedFiles() {
  const { rows } = await query('SELECT filename FROM schema_migrations')
  return new Set(rows.map((r) => r.filename))
}

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
}

/**
 * A migration is reversible only when a sibling `<name>.down.sql` exists.
 * 001-007 predate this convention and are forward-only; `npm run db:reset`
 * rebuilds those from scratch.
 */
function downFileFor(file) {
  const candidate = path.join(migrationsDir, file.replace(/\.sql$/, '.down.sql'))
  return existsSync(candidate) ? candidate : null
}

async function apply(file) {
  const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    await client.query('COMMIT')
    console.log(`applied ${file}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`failed ${file}: ${error.message}`)
    throw error
  } finally {
    client.release()
  }
}

async function revert(file) {
  const downPath = downFileFor(file)
  if (!downPath) {
    throw new Error(
      `${file} has no ${file.replace(/\.sql$/, '.down.sql')} companion, so it cannot be rolled back`,
    )
  }
  const sql = readFileSync(downPath, 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [file])
    await client.query('COMMIT')
    console.log(`reverted ${file}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`failed to revert ${file}: ${error.message}`)
    throw error
  } finally {
    client.release()
  }
}

async function run({ up = true, steps = 1 } = {}) {
  await ensureMigrationsTable()
  const done = await appliedFiles()

  if (!up) {
    const reversible = []
    for (const file of listMigrations().reverse()) {
      if (!done.has(file)) continue
      if (!downFileFor(file)) break
      reversible.push(file)
      if (reversible.length >= steps) break
    }
    for (const file of reversible) await revert(file)
    return { applied: reversible.map((f) => `-${f}`), skipped: [] }
  }

  const pending = listMigrations().filter((f) => !done.has(f))
  const applied = []
  for (const file of pending) {
    await apply(file)
    applied.push(file)
  }

  if (applied.length === 0) console.log('database already up to date')
  return { applied, skipped: [] }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const revertMode = process.argv.includes('--down')
  const stepArg = process.argv.find((a) => a.startsWith('--steps='))
  const steps = stepArg ? Number.parseInt(stepArg.split('=')[1], 10) : 1
  try {
    const result = await run({ up: !revertMode, steps })
    console.log(revertMode
      ? `rollback complete (${result.applied.length} reverted)`
      : `migrations complete (${result.applied.length} applied)`)
  } catch {
    process.exitCode = 1
  } finally {
    await closePool()
  }
}

export default run
