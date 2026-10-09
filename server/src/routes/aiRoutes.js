import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { aiLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import {
  chatSchema,
  searchSchema,
  resumeAnalyzeSchema,
  careerAnalyzeSchema,
  roadmapGenerateSchema,
  roadmapTaskUpdateSchema,
  taskIdParamSchema,
  readinessQuerySchema,
  roadmapQuerySchema,
  resourcesQuerySchema,
} from '../validators/aiValidators.js'
import {
  handleChat,
  handleSearch,
  handleResumeAnalyze,
  handleCareerAnalyze,
  handleGetReadiness,
  handleGetRoadmap,
  handleGenerateRoadmap,
  handleUpdateRoadmapTask,
  handleGetResources,
} from '../controllers/aiController.js'

const router = Router()

import { uploadResume, wrapUpload } from '../middleware/upload.js'

const conditionalResumeUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return wrapUpload(uploadResume)(req, res, next)
  }
  next()
}

// All AI endpoints require authentication and per-window rate limiting
router.use(authenticate)
router.use(aiLimiter)

router.post('/chat', validate({ body: chatSchema }), handleChat)
router.post('/search', validate({ body: searchSchema }), handleSearch)
router.post(
  '/resume/analyze',
  conditionalResumeUpload,
  validate({ body: resumeAnalyzeSchema }),
  handleResumeAnalyze,
)

// Career Readiness & Skill Gap
router.post('/career/analyze', validate({ body: careerAnalyzeSchema }), handleCareerAnalyze)
router.post('/readiness/analyze', validate({ body: careerAnalyzeSchema }), handleCareerAnalyze)
router.get('/readiness', validate({ query: readinessQuerySchema }), handleGetReadiness)
router.get('/readiness/resources', validate({ query: resourcesQuerySchema }), handleGetResources)
router.get('/mentors/recommendations', validate({ query: resourcesQuerySchema }), handleGetResources)

// Career Roadmap & Task Progress Persistence
router.get('/roadmap', validate({ query: roadmapQuerySchema }), handleGetRoadmap)
router.post('/roadmap/generate', validate({ body: roadmapGenerateSchema }), handleGenerateRoadmap)
router.patch(
  '/roadmap/tasks/:taskId',
  validate({ params: taskIdParamSchema, body: roadmapTaskUpdateSchema }),
  handleUpdateRoadmapTask,
)

export default router

