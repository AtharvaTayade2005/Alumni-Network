/**
 * Safe Demo Environment Reset for Alumni Network Portal.
 * Wipes development data and runs demo seed.
 *
 * Strictly refuses to run in production.
 *
 * Usage:
 *   npm run db:reset:demo
 */
import 'dotenv/config'
import config from '../config/env.js'
import { query, closePool } from '../config/database.js'
import { ensureDevDatabase } from '../config/devDbAutoStart.js'
import logger from '../utils/logger.js'
import { seedDemoData } from './seed-demo.js'

async function resetDemo() {
  if (config.isProduction) {
    throw new Error('Refusing to reset database in PRODUCTION!')
  }

  await ensureDevDatabase()
  logger.warn('Resetting development demo database...')

  // Retrieve all user/content tables in public schema, excluding schema_migrations and roles
  const { rows } = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('schema_migrations', 'roles')
  `)

  if (rows.length > 0) {
    const tableList = rows.map((r) => `"${r.table_name}"`).join(', ')
    await query(`TRUNCATE ${tableList} CASCADE;`)
    logger.info(`Truncated ${rows.length} tables: ${rows.map((r) => r.table_name).join(', ')}`)
  }

  logger.info('Database truncated. Seeding fresh demo data...')
  await seedDemoData()
  logger.info('Demo database reset & reseed complete!')
}

if (process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  resetDemo()
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Demo reset failed:', err)
      await closePool()
      process.exit(1)
    })
}

export { resetDemo }
