import { api } from './http.js'

/**
 * AI API Client
 * Connects frontend AI pages to Express AI endpoints (/api/ai/*).
 */
export const aiService = {
  /**
   * AI Career Assistant chat
   * @param {string} prompt User message text
   * @param {Array} history Conversation turn history
   */
  async askAssistant(prompt, history = []) {
    const res = await api.post('/ai/chat', { message: prompt, history })
    return res?.data || res
  },

  /**
   * Natural language discovery across people, jobs, and events
   * @param {string} query Search query string
   * @param {string} type 'ALL' | 'PEOPLE' | 'JOBS' | 'EVENTS'
   */
  async getSemanticSearch(query, type = 'ALL') {
    const res = await api.post('/ai/search', { query, type })
    return res?.data || res
  },

  /**
   * ATS resume analyzer & skills extractor
   * @param {FormData|Object|string} payload File FormData, JSON payload object, or resumeText string
   * @param {string} [targetRole] Target role title (optional)
   */
  async analyzeResume(payload, targetRole) {
    let body
    if (payload instanceof FormData) {
      body = payload
    } else if (typeof payload === 'object' && payload !== null) {
      body = payload
    } else if (typeof payload === 'string') {
      body = { resumeText: payload, targetRole: targetRole || undefined }
    } else {
      body = {}
    }
    const res = await api.post('/ai/resume/analyze', body)
    return res?.data || res
  },

  /**
   * Skill gap and career progression evaluation
   * @param {Object|string} params Target role string or options object
   */
  async analyzeJobReadiness(params = 'Frontend Developer', currentSkills = []) {
    let body = {}
    if (typeof params === 'string') {
      body = { targetRole: params, currentSkills }
    } else if (typeof params === 'object' && params !== null) {
      body = params
    } else {
      body = { targetRole: 'Frontend Developer', currentSkills }
    }
    const res = await api.post('/ai/career/analyze', body)
    return res?.data || res
  },

  /**
   * Fetches existing readiness state and active roadmap
   */
  async getReadiness(targetRole, jobId) {
    const params = new URLSearchParams()
    if (targetRole) params.set('targetRole', targetRole)
    if (jobId) params.set('jobId', jobId)
    const queryStr = params.toString() ? `?${params.toString()}` : ''
    const res = await api.get(`/ai/readiness${queryStr}`)
    return res?.data || res
  },

  /**
   * Fetches current career roadmap and tasks
   */
  async getRoadmap(roadmapId, targetRole, jobId) {
    const params = new URLSearchParams()
    if (roadmapId) params.set('roadmapId', roadmapId)
    if (targetRole) params.set('targetRole', targetRole)
    if (jobId) params.set('jobId', jobId)
    const queryStr = params.toString() ? `?${params.toString()}` : ''
    const res = await api.get(`/ai/roadmap${queryStr}`)
    return res?.data || res
  },

  /**
   * Generates or regenerates a personalized learning roadmap
   */
  async generateRoadmap({ targetRole, jobId, regenerate = false } = {}) {
    const res = await api.post('/ai/roadmap/generate', { targetRole, jobId, regenerate })
    return res?.data || res
  },

  /**
   * Updates completion state for a roadmap task
   */
  async updateRoadmapTask(taskId, isCompleted) {
    const res = await api.patch(`/ai/roadmap/tasks/${taskId}`, { isCompleted })
    return res?.data || res
  },

  /**
   * Retrieves verified platform mentors and published events
   */
  async getLearningResources(targetRole) {
    const queryStr = targetRole ? `?targetRole=${encodeURIComponent(targetRole)}` : ''
    const res = await api.get(`/ai/readiness/resources${queryStr}`)
    return res?.data || res
  },
}

