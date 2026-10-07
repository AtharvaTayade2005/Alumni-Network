import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import config from './config/env.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import {
  attachRequestId, requestLogger, setSecurityHeaders,
} from './middleware/security.js'
import { apiLimiter } from './middleware/rateLimiter.js'

const app = express()

// Required for correct client IPs and rate limiting behind a reverse proxy.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}))
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.use(attachRequestId)
app.use(setSecurityHeaders)
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf
  },
}))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser(config.jwt.refreshSecret))
app.use(requestLogger)

// Only the broad per-IP quota lives here. Endpoint-specific limits (auth,
// registration, uploads) are applied on the routes they protect, so an upload
// budget is never consumed by ordinary JSON requests.
app.use('/api', apiLimiter)
app.use('/api', routes)

// Uploaded files are never served as static assets. Resume access is granted
// per request by the resume service after an authorization check.
app.use('/uploads', (_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' })
})

app.use(notFoundHandler)
app.use(errorHandler)

export default app
