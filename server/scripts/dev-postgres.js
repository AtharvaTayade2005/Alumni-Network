/**
 * Zero-install local PostgreSQL for development and CI.
 *
 * Runs PGlite (PostgreSQL compiled to WebAssembly) behind the standard
 * PostgreSQL wire protocol, so the `pg` driver, migrations and application
 * code connect exactly as they would to a normal PostgreSQL server.
 *
 * Use this when Docker or a system PostgreSQL install is unavailable.
 * For production and for full-fidelity testing, run a real PostgreSQL 16 and
 * point DATABASE_URL at it; nothing in the application depends on this script.
 *
 *   node scripts/dev-postgres.js
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import bcrypt from 'bcrypt'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const port = Number.parseInt(process.env.DEV_PG_PORT ?? '54329', 10)
const dataDir = process.env.DEV_PG_DATA_DIR ?? path.join(rootDir, '.dev-postgres')

// Clean dangling lock file if an earlier process exited uncleanly
try {
  await fs.rm(path.join(dataDir, 'postmaster.pid'), { force: true })
} catch {
  // ignore
}

let db
try {
  db = await PGlite.create({ dataDir })
} catch (err) {
  process.stderr.write(`PGlite data directory was unrecoverable (${err.message}), reinitializing...\n`)
  await fs.rm(dataDir, { recursive: true, force: true })
  db = await PGlite.create({ dataDir })
}

// Ensure schema is populated if fresh
try {
  const { rows } = await db.query("SELECT to_regclass('public.users') as exists")
  if (!rows[0]?.exists) {
    process.stdout.write('Initializing schema and seeds for development database...\n')
    const migrationsDir = path.resolve(rootDir, '../database/migrations')
    const migFiles = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort()
    for (const file of migFiles) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }

    const seedsDir = path.resolve(rootDir, '../database/seeds')
    const seedFiles = (await fs.readdir(seedsDir)).filter((f) => f.endsWith('.sql')).sort()
    for (const file of seedFiles) {
      const sql = await fs.readFile(path.join(seedsDir, file), 'utf8')
      await db.exec(sql)
    }

    const hash = await bcrypt.hash('DevPassw0rd!', 10)
    const accounts = [
      { role: 'STUDENT', email: 'student@alumni.local', first: 'Dev', last: 'Student' },
      { role: 'ALUMNI', email: 'alumni@alumni.local', first: 'Dev', last: 'Alumnus' },
      { role: 'ADMIN', email: 'admin@alumni.local', first: 'Dev', last: 'Admin' },
      { role: 'STUDENT', email: 'riya.shah@student.vit.edu.in', first: 'Riya', last: 'Shah' },
      { role: 'ALUMNI', email: 'aarav.m@microsoft.com', first: 'Aarav', last: 'Mehta' },
      { role: 'ADMIN', email: 'admin@vit.edu.in', first: 'Vikramaditya', last: 'Singhania' },
    ]
    for (const acc of accounts) {
      const res = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active, is_suspended)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, FALSE)
         ON CONFLICT (LOWER(email)) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               is_email_verified = TRUE,
               is_active = TRUE,
               is_suspended = FALSE
         RETURNING id`,
        [acc.email, hash, acc.first, acc.last],
      )
      const userId = res.rows[0].id
      await db.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)
         ON CONFLICT DO NOTHING`,
        [userId, acc.role],
      )
      if (acc.role === 'ALUMNI') {
        await db.query(
          `INSERT INTO alumni_profiles (user_id, graduation_year, degree)
           VALUES ($1, 2021, 'B.Tech')
           ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        )
      } else if (acc.role === 'STUDENT') {
        await db.query(
          `INSERT INTO student_profiles (user_id, degree, year_of_study)
           VALUES ($1, 'B.Tech', 3)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        )
      }
    }
  }
} catch (setupErr) {
  process.stderr.write(`Warning: Failed to auto-initialize schema: ${setupErr.message}\n`)
}

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 50 })
await server.start()

process.stdout.write(
  `dev postgres listening on 127.0.0.1:${port}\n`
  + `data directory: ${dataDir}\n`
  + `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${port}/postgres\n`,
)

const stop = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
