import rateLimit from 'express-rate-limit'
import config from '../config/env.js'

function build({ windowMs, max, message, skipSuccessful = false, keyBy }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    keyGenerator: keyBy,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message,
        error: { code: 'RATE_LIMITED' },
      })
    },
  })
}

export const apiLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 10000 : 600,
  message: 'Too many requests. Please slow down and try again shortly.',
})

export const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: config.security.maxLoginAttempts,
  skipSuccessful: true,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
})

export const registerLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: config.security.maxRegisterAttempts,
  message: 'Too many accounts created from this network. Please try again later.',
})

export const writeLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: config.security.maxWriteAttempts,
  message: 'You are submitting requests too quickly. Please slow down.',
})

export const uploadLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: config.security.maxUploadAttempts,
  message: 'Too many file uploads. Please try again later.',
})

export const aiLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: config.isTest ? 10000 : (config.ai?.maxRequestsPerWindow ?? 30),
  message: 'AI request limit reached. Please wait a few moments before trying again.',
})

