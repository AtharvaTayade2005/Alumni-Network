import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, closePool } from '../config/database.js'
import logger from '../utils/logger.js'
import { seedDevUsers } from './seed-dev-users.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const seedDir = path.resolve(here, '..', '..', '..', 'database', 'seeds')

async function run({ withUsers = true } = {}) {
  const files = (await fs.readdir(seedDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    logger.warn('no seed files found', { seedDir })
    return
  }

  for (const file of files) {
    const sql = await fs.readFile(path.join(seedDir, file), 'utf8')
    try {
      // A seed file may contain several statements, so the simple query
      // protocol is used rather than the extended one a single query() uses.
      const client = await pool.connect()
      try {
        await client.query(sql)
      } finally {
        client.release()
      }
      logger.info('seed applied', { file })
    } catch (error) {
      logger.error('seed failed', { file, error: error.message })
      process.exitCode = 1
      return
    }
  }

  logger.info('seed complete', { count: files.length })

  // Roles must already exist before the development accounts can reference them.
  if (withUsers) await seedDevUsers()
}

run()
  .then(() => closePool())
  .catch(async (error) => {
    logger.error('seed run failed', { error: error.message })
    await closePool()
    process.exit(1)
  })
