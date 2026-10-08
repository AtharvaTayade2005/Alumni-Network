import { aiService } from '../services/ai/aiService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSuccess } from '../utils/response.js'

export const handleChat = asyncHandler(async (req, res) => {
  const { message, history } = req.body
  const result = await aiService.chat({
    user: req.user,
    message,
    history,
  })
  sendSuccess(res, result, { message: 'Chat response generated' })
})

export const handleSearch = asyncHandler(async (req, res) => {
  const { query, type, limit } = req.body
  const result = await aiService.semanticSearch({
    query,
    type,
    limit,
  })
  sendSuccess(res, result, { message: 'Semantic search completed' })
})

export const handleResumeAnalyze = asyncHandler(async (req, res) => {
  const { resumeText, targetRole } = req.body
  const result = await aiService.analyzeResume({
    user: req.user,
    resumeText,
    targetRole,
  })
  sendSuccess(res, result, { message: 'Resume analysis completed' })
})

export const handleCareerAnalyze = asyncHandler(async (req, res) => {
  const { targetRole, currentSkills } = req.body
  const result = await aiService.analyzeCareer({
    user: req.user,
    targetRole,
    currentSkills,
  })
  sendSuccess(res, result, { message: 'Career readiness analysis completed' })
})
