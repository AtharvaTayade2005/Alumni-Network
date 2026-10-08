import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..', '..', '..')

dotenv.config({ path: path.join(projectRoot, '.env') })

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback
  return value === 'true' || value === '1'
}

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Outside production a deterministic development secret keeps `npm run dev`
 * working out of the box. It is deliberately fixed rather than random so that
 * restarting the server does not invalidate every issued access token, and it
 * is never accepted in production, where the value is required from the
 * environment. The warning makes the tradeoff visible.
 */
const DEV_ACCESS_SECRET = 'dev-only-insecure-access-secret-change-me'
const DEV_REFRESH_SECRET = 'dev-only-insecure-refresh-secret-change-me'

const accessSecret = process.env.JWT_SECRET || (isProduction ? '' : DEV_ACCESS_SECRET)
const refreshSecret = process.env.JWT_REFRESH_SECRET || (isProduction ? '' : DEV_REFRESH_SECRET)

if (!isProduction && !process.env.JWT_SECRET) {
  console.warn(
    '[config] JWT_SECRET is not set; using a fixed development secret. '
    + 'Set JWT_SECRET and JWT_REFRESH_SECRET before deploying.',
  )
}

// The local PGlite server started by `npm run dev:db` listens here. Using it as
// the default keeps `npm start` working without a .env file; production still
// requires an explicit DATABASE_URL via assertProductionConfig().
const DEV_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/postgres'

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction,
  isTest,
  port: int(process.env.PORT, 5000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL ?? `http://localhost:${int(process.env.PORT, 5000)}`,

  database: {
    url: process.env.DATABASE_URL ?? (isProduction ? '' : DEV_DATABASE_URL),
    ssl: bool(process.env.DB_SSL),
    poolMax: int(process.env.DB_POOL_MAX, 10),
  },

  jwt: {
    accessSecret,
    refreshSecret,
    accessExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    issuer: process.env.JWT_ISSUER ?? 'alumni-network-portal',
  },

  security: {
    // bcrypt is deliberately slow; tests would otherwise spend most of their
    // wall clock in the KDF.
    bcryptRounds: isTest ? 4 : int(process.env.BCRYPT_ROUNDS, 12),
    maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 5),
    lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
    // Per-IP quotas. Tests drive many requests through one address, so the
    // automated limits are raised rather than disabled, keeping the limiter
    // itself on the code path.
    maxLoginAttempts: isTest
      ? 1000 : int(process.env.RATE_LIMIT_LOGIN_MAX, 10),
    maxRegisterAttempts: isTest
      ? 1000 : int(process.env.RATE_LIMIT_REGISTER_MAX, 5),
    maxWriteAttempts: isTest
      ? 10000 : int(process.env.RATE_LIMIT_WRITE_MAX, 60),
    maxUploadAttempts: isTest
      ? 1000 : int(process.env.RATE_LIMIT_UPLOAD_MAX, 20),
  },

  uploads: {
    maxBytes: int(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
    allowedMime: ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    allowedExtensions: ['.pdf', '.doc', '.docx'],
    storageDriver: process.env.STORAGE_DRIVER ?? 'local',
    localDir: process.env.LOCAL_UPLOAD_DIR ?? path.join(projectRoot, 'server', 'uploads'),
    s3: {
      bucket: process.env.AWS_S3_BUCKET ?? '',
      region: process.env.AWS_REGION ?? '',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      signedUrlExpires: int(process.env.S3_SIGNED_URL_SECONDS, 900),
    },
  },

  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID ?? '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    },
    sso: {
      issuerUrl: process.env.SSO_ISSUER_URL ?? '',
      clientId: process.env.SSO_CLIENT_ID ?? '',
      clientSecret: process.env.SSO_CLIENT_SECRET ?? '',
    },
    stateSecret: process.env.OAUTH_STATE_SECRET ?? '',
  },

  /**
   * Public origin of this API. OAuth redirect URIs are absolute, so the
   * provider needs to know where to send the browser back to.
   */
  apiBaseUrl: (process.env.API_BASE_URL ?? '').replace(/\/$/, ''),

  payments: {
    provider: process.env.PAYMENT_PROVIDER ?? 'stripe',
    currency: process.env.DONATION_CURRENCY ?? 'USD',
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID ?? '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
      baseUrl: process.env.PAYPAL_BASE_URL ?? 'https://api-m.sandbox.paypal.com',
    },
  },

  mail: {
    driver: process.env.MAIL_DRIVER ?? 'log',
    fromEmail: process.env.MAIL_FROM_EMAIL ?? 'no-reply@alumni.example.edu',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: int(process.env.SMTP_PORT, 587),
      user: process.env.SMTP_USER ?? '',
      password: process.env.SMTP_PASSWORD ?? '',
    },
  },

  maps: {
    provider: process.env.MAP_PROVIDER ?? 'none',
    apiKey: process.env.MAP_API_KEY ?? '',
  },

  tokens: {
    emailVerifyHours: int(process.env.EMAIL_TOKEN_HOURS, 48),
    passwordResetHours: int(process.env.PASSWORD_RESET_HOURS, 2),
  },

  /**
   * Scheduled work.
   *
   * The interval is how often the scheduler wakes up to look for work, not how
   * long a job may take: every job claims a run key first, so a second wake-up
   * while the first is still running does nothing. `enabled` is off in tests,
   * where the sweeps are asked for directly instead of waited for.
   */
  scheduler: {
    enabled: isTest ? false : bool(process.env.SCHEDULER_ENABLED, true),
    intervalMs: int(process.env.SCHEDULER_INTERVAL_MS, 15 * 60 * 1000),
    staleRunMinutes: int(process.env.SCHEDULER_STALE_RUN_MINUTES, 60),
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'test',
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? '',
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'text-embedding-004',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    },
    maxTokens: int(process.env.AI_MAX_TOKENS, 2048),
    temperature: Number.parseFloat(process.env.AI_TEMPERATURE ?? '0.7'),
    maxRequestsPerWindow: int(process.env.AI_RATE_LIMIT_MAX, 30),
  },
}

const requiredInProduction = [
  ['JWT_SECRET', config.jwt.accessSecret],
  ['JWT_REFRESH_SECRET', config.jwt.refreshSecret],
  ['DATABASE_URL', config.database.url],
]

export function assertProductionConfig() {
  if (!isProduction) return
  const missing = requiredInProduction.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`)
  }
  if (config.jwt.accessSecret === config.jwt.refreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must differ')
  }
  if (config.jwt.accessSecret === DEV_ACCESS_SECRET
    || config.jwt.refreshSecret === DEV_REFRESH_SECRET) {
    throw new Error('The development JWT secret must never be used in production')
  }
  if (config.jwt.accessSecret.length < 32 || config.jwt.refreshSecret.length < 32) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be at least 32 characters')
  }
}

export default config
