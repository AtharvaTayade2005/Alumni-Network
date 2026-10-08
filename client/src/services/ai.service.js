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
   * @param {string} resumeText Extracted text from resume document
   * @param {string} targetRole Target role title
   */
  async analyzeResume(resumeText, targetRole = 'Software Engineer') {
    const res = await api.post('/ai/resume/analyze', { resumeText, targetRole })
    return res?.data || res
  },

  /**
   * Skill gap and career progression evaluation
   * @param {string} jobTitle Target role title
   * @param {Array<string>} currentSkills Candidate skills
   */
  async analyzeJobReadiness(jobTitle = 'Frontend Engineer', currentSkills = []) {
    const res = await api.post('/ai/career/analyze', {
      targetRole: jobTitle,
      currentSkills,
    })
    return res?.data || res
  },
}
