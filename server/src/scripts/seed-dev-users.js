/**
 * Seeds one ADMIN, one ALUMNI and one STUDENT account for local development.
 *
 * Passwords are hashed here rather than stored in `database/seeds/*.sql` so that
 * no password or hash is ever committed to the repository. The plaintext exists
 * only in the environment (or the documented development defaults below) and in
 * the log line printed at the end of the run.
 *
 * The seeder refuses to run when NODE_ENV=production: these accounts are
 * deliberately predictable and must never reach a deployed environment.
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import config from '../config/env.js'
import { query, closePool } from '../config/database.js'
import logger from '../utils/logger.js'

const DEV_PASSWORD = 'DevPassw0rd!'

/**
 * `passwordEnv` names the variable that overrides the shared development
 * password, so a developer can set one variable instead of three.
 */
const ACCOUNTS = [
  {
    role: 'ADMIN',
    firstName: 'Dev',
    lastName: 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@alumni.local',
    passwordEnv: 'SEED_ADMIN_PASSWORD',
  },
  {
    role: 'ALUMNI',
    firstName: 'Dev',
    lastName: 'Alumnus',
    email: process.env.SEED_ALUMNI_EMAIL ?? 'alumni@alumni.local',
    passwordEnv: 'SEED_ALUMNI_PASSWORD',
    extra: { graduation_year: 2018, degree: 'BSc Computer Science' },
  },
  {
    role: 'STUDENT',
    firstName: 'Dev',
    lastName: 'Student',
    email: process.env.SEED_STUDENT_EMAIL ?? 'student@alumni.local',
    passwordEnv: 'SEED_STUDENT_PASSWORD',
    extra: { degree: 'BSc Computer Science', year_of_study: 3 },
  },
]

async function upsertUser(account, passwordHash) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name,
                        is_email_verified, is_active, is_suspended)
     VALUES (LOWER($1), $2, $3, $4, TRUE, TRUE, FALSE)
     ON CONFLICT (LOWER(email)) DO UPDATE
       SET password_hash    = EXCLUDED.password_hash,
           first_name       = EXCLUDED.first_name,
           last_name        = EXCLUDED.last_name,
           is_email_verified = TRUE,
           is_active        = TRUE,
           is_suspended     = FALSE
     RETURNING id`,
    [account.email, passwordHash, account.firstName, account.lastName],
  )
  return rows[0].id
}

async function assignRole(userId, role) {
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)
     ON CONFLICT DO NOTHING`,
    [userId, role],
  )
}

async function upsertProfile(account, userId) {
  if (account.role === 'ALUMNI') {
    await query(
      `INSERT INTO alumni_profiles (user_id, graduation_year, degree)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET graduation_year = EXCLUDED.graduation_year,
             degree          = EXCLUDED.degree`,
      [userId, account.extra.graduation_year, account.extra.degree],
    )
  } else if (account.role === 'STUDENT') {
    await query(
      `INSERT INTO student_profiles (user_id, degree, year_of_study)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET degree       = EXCLUDED.degree,
             year_of_study = EXCLUDED.year_of_study`,
      [userId, account.extra.degree, account.extra.year_of_study],
    )
  }
}

export async function seedDevUsers() {
  if (config.isProduction) {
    throw new Error(
      'seed:dev-users refuses to run with NODE_ENV=production. '
      + 'These accounts use documented development credentials.',
    )
  }

  const hash = await bcrypt.hash(DEV_PASSWORD, config.security.bcryptRounds)
  const created = []

  for (const account of ACCOUNTS) {
    const password = process.env[account.passwordEnv] ?? DEV_PASSWORD
    // One hash for all accounts keeps the run fast; every account shares the
    // same development password unless overridden above.
    const passwordHash = password === DEV_PASSWORD
      ? hash
      : await bcrypt.hash(password, config.security.bcryptRounds)

    const userId = await upsertUser(account, passwordHash)
    await assignRole(userId, account.role)
    await upsertProfile(account, userId)

    created.push({
      role: account.role,
      email: account.email.toLowerCase(),
      passwordSource: process.env[account.passwordEnv] ? account.passwordEnv : 'default',
    })
  }

  logger.info('development users seeded', { count: created.length })
  // Printing the credentials is intentional: they are development-only values
  // and the run is blocked in production. Passwords are not echoed.
  console.table(created)
  return created
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  try {
    await seedDevUsers()
  } catch (error) {
    logger.error('development user seed failed', { error: error.message })
    process.exitCode = 1
  } finally {
    await closePool()
  }
}