import { aiService } from '../services/ai/aiService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSuccess } from '../utils/response.js'
import { getQuery, getParams } from '../middleware/validate.js'

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
  const { resumeText, targetRole, jobId, useStoredResume, resumeId } = req.body
  const file = req.file

  const result = await aiService.analyzeResume({
    user: req.user,
    file,
    resumeText,
    targetRole,
    jobId,
    useStoredResume,
    resumeId,
  })
  sendSuccess(res, result, { message: 'Resume analysis completed' })
})

export const handleCareerAnalyze = asyncHandler(async (req, res) => {
  const { targetRole, jobId, currentSkills } = req.body
  const result = await aiService.analyzeCareer({
    user: req.user,
    targetRole,
    jobId,
    currentSkills,
  })
  sendSuccess(res, result, { message: 'Career readiness analysis completed' })
})

export const handleGetReadiness = asyncHandler(async (req, res) => {
  const query = getQuery(req)
  const { targetRole, jobId } = query
  const result = await aiService.analyzeCareer({
    user: req.user,
    targetRole,
    jobId,
  })
  sendSuccess(res, result, { message: 'Career readiness retrieved' })
})

export const handleGetRoadmap = asyncHandler(async (req, res) => {
  const query = getQuery(req)
  const { roadmapId, targetRole, jobId } = query
  const result = await aiService.getRoadmap({
    user: req.user,
    roadmapId,
    targetRole,
    jobId,
  })
  sendSuccess(res, result, { message: 'Career roadmap retrieved' })
})

export const handleGenerateRoadmap = asyncHandler(async (req, res) => {
  const { targetRole, jobId, regenerate } = req.body
  const result = await aiService.generateRoadmap({
    user: req.user,
    targetRole,
    jobId,
    regenerate,
  })
  sendSuccess(res, result, { message: 'Career roadmap generated' })
})

export const handleUpdateRoadmapTask = asyncHandler(async (req, res) => {
  const params = getParams(req)
  const { taskId } = params
  const { isCompleted } = req.body
  const result = await aiService.updateRoadmapTask({
    user: req.user,
    taskId,
    isCompleted,
  })
  sendSuccess(res, result, { message: 'Roadmap task updated' })
})

export const handleGetResources = asyncHandler(async (req, res) => {
  const query = getQuery(req)
  const { targetRole } = query
  const result = await aiService.getResources({
    user: req.user,
    targetRole,
  })
  sendSuccess(res, result, { message: 'Learning resources retrieved' })
})

