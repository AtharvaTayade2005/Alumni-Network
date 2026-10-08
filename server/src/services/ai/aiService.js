import { SYSTEM_PROMPTS, buildAssistantPrompt, buildResumeAnalysisPrompt, buildCareerAnalysisPrompt } from './promptService.js'
import { generateText, generateStructured } from './llmService.js'
import {
  searchSimilar,
  getAlumniRecommendations,
  getMentorRecommendations,
  getJobRecommendations,
  getNetworkContextForUser,
} from './retrievalService.js'
import {
  getSkillsForUser,
  findStudentProfileByUserId,
  findAlumniProfileByUserId,
} from '../../models/profileModel.js'
import { query } from '../../config/database.js'

/**
 * AI Business Service
 * Orchestrates LLM generation, prompt hydration, context retrieval, and structured response contracts.
 */
export const aiService = {
  /**
   * AI Career & Networking Intelligence Assistant
   */
  async chat({ user, message, history = [] }) {
    const userId = user?.id

    // 1. Resolve full authenticated user profile context from PostgreSQL
    let studentProfile = null
    let alumniProfile = null
    let skillsList = []

    if (userId) {
      const [s, a, sk] = await Promise.all([
        findStudentProfileByUserId(userId).catch(() => null),
        findAlumniProfileByUserId(userId).catch(() => null),
        getSkillsForUser(userId).catch(() => []),
      ])
      studentProfile = s
      alumniProfile = a
      skillsList = sk.map((item) => item.name)
    }

    const userProfile = {
      name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'Member',
      role: user?.roles?.[0] || (studentProfile ? 'STUDENT' : alumniProfile ? 'ALUMNI' : 'MEMBER'),
      department: studentProfile?.department || alumniProfile?.department || user?.department || 'Engineering',
      degree: studentProfile?.degree || alumniProfile?.degree || 'Engineering',
      skills: skillsList,
      careerInterests: studentProfile?.career_interests || alumniProfile?.industry || '',
    }

    // 2. Classify intent to focus retrieval
    const msgLower = (message || '').toLowerCase()
    const isAskingAlumni = /alumni|people|who works|connect|network|who can help|find someone/i.test(msgLower)
    const isAskingMentors = /mentor|guidance|advis|1-on-1/i.test(msgLower)
    const isAskingJobs = /job|opening|hiring|internship|role|vacancy|position|apply|career opportunity/i.test(msgLower)

    // 3. Execute targeted retrieval against real database records
    const [retrievedAlumni, retrievedMentors, retrievedJobs] = await Promise.all([
      (isAskingAlumni || (!isAskingMentors && !isAskingJobs))
        ? getAlumniRecommendations({ userId, queryText: message, skills: skillsList, limit: 3 })
        : Promise.resolve([]),
      (isAskingMentors || (!isAskingAlumni && !isAskingJobs))
        ? getMentorRecommendations({ userId, queryText: message, skills: skillsList, limit: 3 })
        : Promise.resolve([]),
      (isAskingJobs || (!isAskingAlumni && !isAskingMentors))
        ? getJobRecommendations({ userId, queryText: message, skills: skillsList, limit: 3 })
        : Promise.resolve([]),
    ])

    // 4. Construct prompt with strict grounding and real entities
    const prompt = buildAssistantPrompt({
      message,
      history,
      userProfile,
      retrievedAlumni,
      retrievedMentors,
      retrievedJobs,
    })

    // 5. Generate text from LLM
    const text = await generateText({
      prompt,
      systemInstruction: SYSTEM_PROMPTS.CAREER_ADVISOR,
    })

    // 6. Build contextual recommendations & actions
    const recommendations = {
      people: retrievedAlumni,
      mentors: retrievedMentors,
      jobs: retrievedJobs,
    }

    const suggestedActions = []
    if (retrievedMentors.length > 0) {
      suggestedActions.push({
        label: `Request Mentorship: ${retrievedMentors[0].name}`,
        to: `/mentorship`,
      })
    }
    if (retrievedJobs.length > 0) {
      suggestedActions.push({
        label: `View ${retrievedJobs[0].title} (${retrievedJobs[0].companyName})`,
        to: `/jobs/${retrievedJobs[0].id}`,
      })
    }
    if (retrievedAlumni.length > 0) {
      suggestedActions.push({
        label: `View Profile: ${retrievedAlumni[0].name}`,
        to: `/alumni/${retrievedAlumni[0].id}`,
      })
    }
    suggestedActions.push({
      label: 'Evaluate Job Readiness',
      to: '/job-readiness',
    })
    suggestedActions.push({
      label: 'Check Resume ATS Score',
      to: '/resume-analyzer',
    })

    return {
      text,
      suggestedActions,
      recommendations,
    }
  },

  /**
   * Natural language discovery across people, jobs, and events
   */
  async semanticSearch({ user, query: queryText, type = 'ALL', limit = 10 }) {
    const results = await searchSimilar({
      queryText,
      entityType: type,
      limit,
      user,
    })

    return {
      query: queryText,
      type,
      total: results.length,
      results,
    }
  },

  /**
   * ATS Resume Scanner & Skill Gap Analyzer
   */
  async analyzeResume({ user, resumeText, targetRole = 'Software Engineer' }) {
    // Benchmark skills for role
    const benchmarkSkills = ['Data Structures', 'Git', 'System Design', 'Testing', 'Clean Code Architecture']

    const prompt = buildResumeAnalysisPrompt({
      resumeText,
      targetRole,
      benchmarkSkills,
    })

    const rawAnalysis = await generateStructured({
      prompt,
      systemInstruction: SYSTEM_PROMPTS.RESUME_ANALYZER,
    })

    // Validate and enforce schema defaults
    const score = typeof rawAnalysis.score === 'number' ? Math.min(100, Math.max(0, rawAnalysis.score)) : 80
    const detectedSkills = Array.isArray(rawAnalysis.detectedSkills) ? rawAnalysis.detectedSkills : []
    const recommendedSkills = Array.isArray(rawAnalysis.recommendedSkills) ? rawAnalysis.recommendedSkills : ['TypeScript', 'Cloud Architecture']
    const formatting = Array.isArray(rawAnalysis.formatting) && rawAnalysis.formatting.length > 0
      ? rawAnalysis.formatting
      : [
          { label: 'Length & Structure', passed: true },
          { label: 'Contact Details', passed: true },
          { label: 'Quantified Impact Metrics', passed: score > 75 },
        ]
    const improvements = Array.isArray(rawAnalysis.improvements) && rawAnalysis.improvements.length > 0
      ? rawAnalysis.improvements
      : [
          { section: 'Experience', advice: 'Quantify metrics with percentage improvements and user scale.' },
        ]

    return {
      score,
      detectedSkills,
      recommendedSkills,
      formatting,
      improvements,
      strengths: Array.isArray(rawAnalysis.strengths) ? rawAnalysis.strengths : ['Clear project descriptions'],
      summary: rawAnalysis.summary || 'Resume successfully reviewed against industry standards.',
    }
  },

  /**
   * Career Competency & Job Readiness Evaluation
   */
  async analyzeCareer({ user, targetRole = 'Frontend Developer', currentSkills = [] }) {
    let candidateSkills = [...currentSkills]

    if (candidateSkills.length === 0 && user?.id) {
      try {
        const userSkills = await getSkillsForUser(user.id)
        candidateSkills = userSkills.map((s) => s.name)
      } catch {
        // Fallback
      }
    }

    const prompt = buildCareerAnalysisPrompt({
      targetRole,
      currentSkills: candidateSkills,
    })

    const rawAnalysis = await generateStructured({
      prompt,
      systemInstruction: SYSTEM_PROMPTS.CAREER_GAP_ANALYSIS,
    })

    // Retrieve active alumni mentors for recommendedMentors
    let recommendedMentors = []
    try {
      const { rows: mentors } = await query(
        `SELECT u.id, u.first_name, u.last_name, ap.current_company, ap.current_role
         FROM users u
         JOIN alumni_profiles ap ON ap.user_id = u.id
         WHERE ap.is_available_for_mentoring = true
         LIMIT 2`
      )
      recommendedMentors = mentors.map((m) => ({
        id: m.id,
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Alumni Mentor',
        company: m.current_company || 'Tech Partner',
        role: m.current_role || 'Senior Engineer',
      }))
    } catch {
      // Non-fatal
    }

    return {
      targetRole,
      readinessScore: typeof rawAnalysis.readinessScore === 'number' ? rawAnalysis.readinessScore : 78,
      skillMatches: Array.isArray(rawAnalysis.skillMatches) ? rawAnalysis.skillMatches : [],
      missingSkills: Array.isArray(rawAnalysis.missingSkills) ? rawAnalysis.missingSkills : ['System Design', 'Testing'],
      recommendedActions: Array.isArray(rawAnalysis.recommendedActions) ? rawAnalysis.recommendedActions : ['Build portfolio projects demonstrating full stack architecture'],
      recommendedMentors,
    }
  },
}
