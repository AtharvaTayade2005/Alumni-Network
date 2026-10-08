import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { aiLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import {
  chatSchema,
  searchSchema,
  resumeAnalyzeSchema,
  careerAnalyzeSchema,
} from '../validators/aiValidators.js'
import {
  handleChat,
  handleSearch,
  handleResumeAnalyze,
  handleCareerAnalyze,
} from '../controllers/aiController.js'

const router = Router()

// All AI endpoints require authentication and per-window rate limiting
router.use(authenticate)
router.use(aiLimiter)

router.post('/chat', validate({ body: chatSchema }), handleChat)
router.post('/search', validate({ body: searchSchema }), handleSearch)
router.post('/resume/analyze', validate({ body: resumeAnalyzeSchema }), handleResumeAnalyze)
router.post('/career/analyze', validate({ body: careerAnalyzeSchema }), handleCareerAnalyze)

export default router
