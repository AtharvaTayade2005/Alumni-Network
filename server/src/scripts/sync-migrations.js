import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query, closePool } from '../config/database.js'
import { ensureDevDatabase } from '../config/devDbAutoStart.js'

await ensureDevDatabase()

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'database',
  'migrations',
)

await query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

const files = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()

for (const file of files) {
  await query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file])
}

const { rows } = await query('SELECT filename FROM schema_migrations ORDER BY filename')
console.log(`schema_migrations synchronized (${rows.length} records):`)
console.log(rows.map((r) => r.filename).join(', '))

await closePool()
