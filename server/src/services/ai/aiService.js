import {
  SYSTEM_PROMPTS,
  buildAssistantPrompt,
  buildResumeAnalysisPrompt,
  buildCareerAnalysisPrompt,
  buildRoadmapPrompt,
} from './promptService.js'
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
  getProfileBundle,
  findStudentProfileByUserId,
  findAlumniProfileByUserId,
} from '../../models/profileModel.js'
import { query } from '../../config/database.js'
import { extractTextFromBuffer, cleanResumeText } from './resumeExtractor.js'
import { detectSkillsFromText, inferRoleFromResume, getRoleBenchmark } from './skillTaxonomy.js'
import { calculateAtsScore } from './atsScorer.js'
import {
  calculateReadinessScore,
  reconcileRoadmapTasks,
  getPlatformResources,
} from './careerReadinessService.js'
import {
  getLatestRoadmapForUser,
  getRoadmapWithTasks,
  saveRoadmapWithTasks,
  updateTaskStatus,
  getCompletedTasksForUser,
} from '../../models/roadmapModel.js'
import * as fileService from '../fileService.js'
import { getStorageDriver } from '../storageService.js'
import { notFound, unprocessable } from '../../utils/errors.js'

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
   * ATS Resume Scanner, Skill Gap Analyzer & Real Platform Job Comparison Engine
   */
  async analyzeResume({
    user,
    file,
    resumeText,
    targetRole,
    jobId,
    useStoredResume,
    resumeId,
  }) {
    let resolvedText = ''
    let sourceMeta = 'text'

    // 1. Resolve resume text from uploaded file, stored resume, or direct text input
    if (file && file.buffer) {
      const extracted = await extractTextFromBuffer(file.buffer, {
        mimeType: file.mimetype,
        originalName: file.originalname,
      })
      resolvedText = extracted.text
      sourceMeta = file.originalname || 'uploaded_document'
    } else if (useStoredResume || resumeId) {
      if (!user?.id) {
        throw unprocessable('Authentication is required to use stored resume')
      }
      let targetFileId = resumeId
      if (!targetFileId) {
        const storedProfile = await fileService.getProfileResume(user)
        if (!storedProfile) {
          throw unprocessable('No stored resume found for this user account')
        }
        targetFileId = storedProfile.id
      }

      const downloaded = await fileService.downloadFile(user, targetFileId)
      const extracted = await extractTextFromBuffer(downloaded.buffer, {
        mimeType: downloaded.contentType,
        originalName: downloaded.filename,
      })
      resolvedText = extracted.text
      sourceMeta = downloaded.filename || 'stored_profile_resume'
    } else if (typeof resumeText === 'string') {
      const cleaned = cleanResumeText(resumeText)
      if (cleaned.length < 20) {
        throw unprocessable('Resume text must be at least 20 characters')
      }
      resolvedText = cleaned
      sourceMeta = 'direct_text'
    } else {
      throw unprocessable('No resume provided. Upload a resume file, select a stored resume, or provide resume text.')
    }

    // 2. Skill taxonomy extraction from resume content
    const detectedTaxonomy = detectSkillsFromText(resolvedText)

    // 3. Resolve target role & benchmark requirements
    let activeTargetRole = (targetRole || '').trim()
    let isRoleInferred = false

    if (!activeTargetRole) {
      activeTargetRole = inferRoleFromResume(resolvedText, detectedTaxonomy.all)
      isRoleInferred = true
    }

    const benchmark = getRoleBenchmark(activeTargetRole)

    // 4. Resolve selected job from PostgreSQL (if provided)
    let selectedJob = null
    let jobComparison = null

    if (jobId) {
      const { rows } = await query(
        `SELECT j.id, j.title, j.company_name, j.description, j.location, j.work_mode,
                j.employment_type, j.status,
                COALESCE(array_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
         FROM jobs j
         LEFT JOIN job_skills js ON js.job_id = j.id
         LEFT JOIN skills s ON s.id = js.skill_id
         WHERE j.id = $1
         GROUP BY j.id`,
        [jobId],
      )

      if (rows.length === 0) {
        throw notFound('Job')
      }

      selectedJob = rows[0]
      const statusLower = String(selectedJob.status || '').toLowerCase()
      if (statusLower !== 'published' && statusLower !== 'active') {
        throw unprocessable('The selected job posting is not active or published.')
      }

      // Compute job comparison
      const jobSkills = (selectedJob.skills || []).length > 0
        ? selectedJob.skills
        : detectSkillsFromText(selectedJob.description).all

      const candidateSkillsSet = new Set(detectedTaxonomy.all.map((s) => s.toLowerCase()))
      const matchingJobSkills = jobSkills.filter((s) => candidateSkillsSet.has(s.toLowerCase()))
      const missingJobSkills = jobSkills.filter((s) => !candidateSkillsSet.has(s.toLowerCase()))

      const matchRatio = jobSkills.length > 0 ? matchingJobSkills.length / jobSkills.length : 0.75
      const jobMatchScore = Math.min(100, Math.round(matchRatio * 100))

      jobComparison = {
        jobId: selectedJob.id,
        title: selectedJob.title,
        companyName: selectedJob.company_name,
        location: selectedJob.location,
        matchScore: jobMatchScore,
        matchingSkills: matchingJobSkills,
        missingSkills: missingJobSkills,
        matchSummary: matchingJobSkills.length > 0
          ? `Resume overlaps with ${matchingJobSkills.slice(0, 3).join(', ')} required by ${selectedJob.company_name}.`
          : `Candidate profile requires alignment with core ${selectedJob.title} requirements.`,
      }
    }

    // 5. If no specific job is selected, retrieve real active platform jobs
    let recommendedJobs = []
    if (!jobId) {
      try {
        const platformJobs = await getJobRecommendations({
          userId: user?.id,
          queryText: activeTargetRole,
          skills: detectedTaxonomy.all,
          limit: 3,
        })
        recommendedJobs = platformJobs.map((j) => {
          const candidateSkillsSet = new Set(detectedTaxonomy.all.map((s) => s.toLowerCase()))
          const jobSkills = Array.isArray(j.skills) ? j.skills : []
          const matchingSkills = jobSkills.filter((s) => candidateSkillsSet.has(s.toLowerCase()))
          const missingSkills = jobSkills.filter((s) => !candidateSkillsSet.has(s.toLowerCase()))

          return {
            id: j.id,
            title: j.title || j.name,
            companyName: j.companyName || j.company || 'Tech Partner',
            location: j.location || 'Remote',
            matchScore: Math.min(98, Math.max(50, (j.score || 5) * 10 + (matchingSkills.length * 8))),
            matchingSkills: matchingSkills.length > 0 ? matchingSkills : detectedTaxonomy.all.slice(0, 2),
            missingSkills: missingSkills.length > 0 ? missingSkills : ['System Design'],
            matchReason: j.matchReason || `Matches ${activeTargetRole} profile`,
          }
        })
      } catch {
        recommendedJobs = []
      }
    }

    // 6. Deterministic signal evaluation
    const atsResult = calculateAtsScore({
      text: resolvedText,
      detectedSkills: detectedTaxonomy.all,
      targetRole: activeTargetRole,
      selectedJob,
    })

    // 7. Grounded AI qualitative prompt
    const prompt = buildResumeAnalysisPrompt({
      resumeText: resolvedText,
      targetRole: activeTargetRole,
      benchmarkSkills: benchmark.essentialSkills,
      selectedJob,
    })

    let rawAnalysis = {}
    try {
      rawAnalysis = await generateStructured({
        prompt: {
          prompt,
          schemaName: 'resume_analysis',
        },
        systemInstruction: SYSTEM_PROMPTS.RESUME_ANALYZER,
      })
    } catch {
      rawAnalysis = {}
    }

    // 8. Synthesize signal metrics and LLM qualitative feedback
    const finalScore = atsResult.score
    const atsCompatibility = atsResult.atsCompatibility

    // Merge detected skills: taxonomy detection + LLM detection
    const llmDetected = Array.isArray(rawAnalysis.detectedSkills) ? rawAnalysis.detectedSkills : []
    const combinedDetectedSkillsSet = new Set([
      ...detectedTaxonomy.all,
      ...llmDetected,
    ])
    const allDetectedSkills = Array.from(combinedDetectedSkillsSet)

    // Deduce missing skills against benchmark/job
    const missingSkills = (selectedJob && jobComparison?.missingSkills?.length > 0)
      ? jobComparison.missingSkills
      : Array.isArray(rawAnalysis.missingSkills) && rawAnalysis.missingSkills.length > 0
        ? rawAnalysis.missingSkills
        : benchmark.recommendedSkills.filter((s) => !combinedDetectedSkillsSet.has(s.toLowerCase()))

    // Missing keywords
    const missingKeywords = Array.isArray(rawAnalysis.missingKeywords) && rawAnalysis.missingKeywords.length > 0
      ? rawAnalysis.missingKeywords
      : benchmark.keywords.slice(0, 4)

    // Strengths
    const strengths = Array.isArray(rawAnalysis.strengths) && rawAnalysis.strengths.length > 0
      ? rawAnalysis.strengths
      : [
          'Clear section breakdown with visible technical skills catalog',
          'Good demonstration of technical terminology and tooling',
        ]

    // Improvements
    const improvements = Array.isArray(rawAnalysis.improvements) && rawAnalysis.improvements.length > 0
      ? rawAnalysis.improvements
      : [
          {
            section: 'Experience',
            issue: 'Limited quantified impact metrics',
            recommendation: 'Quantify achievements with percentage improvements and scale indicators.',
          },
        ]

    // Formatting checks
    const formatting = Array.isArray(rawAnalysis.formatting) && rawAnalysis.formatting.length > 0
      ? rawAnalysis.formatting
      : atsResult.formatting

    const summary = rawAnalysis.summary || `Resume evaluated for ${activeTargetRole} position against industry ATS standards.`

    return {
      score: finalScore,
      atsCompatibility,
      targetRole: activeTargetRole,
      isRoleInferred,
      summary,
      strengths,
      improvements,
      breakdown: atsResult.breakdown,
      sections: atsResult.sections,
      skills: {
        detected: allDetectedSkills,
        categorized: {
          languages: detectedTaxonomy.languages,
          frameworks: detectedTaxonomy.frameworks,
          databases: detectedTaxonomy.databases,
          cloudDevops: detectedTaxonomy.cloudDevops,
          tools: detectedTaxonomy.tools,
          aiData: detectedTaxonomy.aiData,
          softSkills: detectedTaxonomy.softSkills,
        },
        missing: missingSkills,
      },
      // Backward compatibility fields for legacy callers
      detectedSkills: allDetectedSkills,
      recommendedSkills: missingSkills,
      keywords: {
        found: allDetectedSkills.slice(0, 8),
        missing: missingKeywords,
      },
      formatting,
      formattingWarnings: Array.isArray(rawAnalysis.formattingWarnings) ? rawAnalysis.formattingWarnings : [],
      experienceAnalysis: Array.isArray(rawAnalysis.experienceFeedback) ? rawAnalysis.experienceFeedback : [
        'Use strong action verbs to begin each project and experience bullet point',
        'Quantify engineering results (e.g. latency reduced, queries optimized)',
      ],
      projectAnalysis: Array.isArray(rawAnalysis.projectFeedback) ? rawAnalysis.projectFeedback : [
        'Highlight software architecture, data modeling, and trade-offs made',
      ],
      jobComparison,
      recommendedJobs,
      source: sourceMeta,
    }
  },

  /**
   * Career Competency, Skill Gap & Job Readiness Evaluation
   */
  async analyzeCareer({ user, targetRole, jobId, currentSkills = [] }) {
    let activeTargetRole = targetRole ? String(targetRole).trim() : ''
    let selectedJob = null

    // 1. Verify Job if jobId provided
    if (jobId) {
      const { rows } = await query(
        `SELECT j.id, j.title, j.company_name, j.description, j.status, j.location
         FROM jobs j
         WHERE j.id = $1`,
        [jobId]
      )
      if (!rows[0] || (rows[0].status !== 'published' && rows[0].status !== 'active')) {
        throw notFound('Job posting is no longer active or published')
      }
      selectedJob = rows[0]
      if (!activeTargetRole) {
        activeTargetRole = selectedJob.title
      }
    }

    if (!activeTargetRole) {
      activeTargetRole = 'Frontend Developer'
    }

    // 2. Gather Profile Evidence from PostgreSQL
    let profileSkills = []
    let experienceEntries = []
    let educationEntries = []
    let studentProfile = {}

    if (user?.id) {
      try {
        const bundle = await getProfileBundle(user.id)
        profileSkills = Array.isArray(bundle?.skills) ? bundle.skills.map((s) => s.name) : []
        experienceEntries = Array.isArray(bundle?.experience) ? bundle.experience : []
        educationEntries = Array.isArray(bundle?.education) ? bundle.education : []
        studentProfile = bundle?.student || {}
      } catch {
        // Fallback
      }
    }

    // Extract verified skills from experience
    const expText = experienceEntries.map((e) => `${e.title || ''} ${e.description || ''}`).join(' ')
    const detectedInExp = detectSkillsFromText(expText).all

    const verifiedSet = new Set(detectedInExp.map((s) => s.toLowerCase()))
    const verifiedSkills = []
    const claimedSkills = []

    const combinedSkillInputs = new Set([...currentSkills, ...profileSkills])
    for (const skill of combinedSkillInputs) {
      if (verifiedSet.has(skill.toLowerCase())) {
        verifiedSkills.push(skill)
      } else {
        claimedSkills.push(skill)
      }
    }

    for (const skill of detectedInExp) {
      if (!combinedSkillInputs.has(skill) && !verifiedSkills.some((vs) => vs.toLowerCase() === skill.toLowerCase())) {
        verifiedSkills.push(skill)
      }
    }

    const candidateSkills = [...verifiedSkills, ...claimedSkills]

    // 3. Deterministic Readiness Score & Gap Calculation
    const roleBenchmark = getRoleBenchmark(activeTargetRole)
    const completedTasks = user?.id ? await getCompletedTasksForUser(user.id).catch(() => []) : []

    const jobSkills = selectedJob?.description
      ? detectSkillsFromText(selectedJob.description).all
      : []

    const scoreResult = calculateReadinessScore({
      targetRole: activeTargetRole,
      roleBenchmark,
      jobRecord: selectedJob ? {
        requiredSkills: jobSkills.length > 0 ? jobSkills : roleBenchmark.essentialSkills,
        preferredSkills: roleBenchmark.recommendedSkills,
      } : null,
      candidateSkills,
      verifiedSkills,
      claimedSkills,
      experienceEntries,
      educationEntries,
      studentProfile,
      completedTasksCount: completedTasks.length,
      totalTasksCount: completedTasks.length > 0 ? completedTasks.length + 4 : 0,
    })

    // 4. LLM Qualitative Evaluation
    const prompt = buildCareerAnalysisPrompt({
      targetRole: activeTargetRole,
      currentSkills: candidateSkills,
      verifiedSkills,
      claimedSkills,
      benchmarkRequirements: roleBenchmark.essentialSkills,
      profileSummary: `${studentProfile.degree || 'Engineering'}, ${experienceEntries.length} experience entries`,
      jobContext: selectedJob ? {
        title: selectedJob.title,
        companyName: selectedJob.company_name,
        description: selectedJob.description,
      } : null,
    })

    let rawAnalysis = {}
    try {
      rawAnalysis = await generateStructured({
        prompt,
        systemInstruction: SYSTEM_PROMPTS.CAREER_GAP_ANALYSIS,
        schemaName: 'career_analysis',
      })
    } catch {
      rawAnalysis = {}
    }

    // 5. Real Platform Resources (Mentors & Events)
    const { recommendedMentors, recommendedEvents } = await getPlatformResources({ targetRole: activeTargetRole })

    // 6. Check existing roadmap
    let existingRoadmap = null
    if (user?.id) {
      try {
        const latest = await getLatestRoadmapForUser(user.id, { targetRole: activeTargetRole, jobId })
        if (latest) {
          existingRoadmap = await getRoadmapWithTasks(latest.id, user.id)
        }
      } catch {
        // Non-fatal
      }
    }

    // Formulate final missing skills
    let finalMissing = []
    if (Array.isArray(rawAnalysis.missingSkills) && rawAnalysis.missingSkills.length > 0) {
      finalMissing = rawAnalysis.missingSkills.map((m) => {
        if (typeof m === 'string') {
          const isEssential = roleBenchmark.essentialSkills.some((es) => es.toLowerCase() === m.toLowerCase())
          return {
            skill: m,
            priority: isEssential ? 'high' : 'medium',
            reason: isEssential ? `Core prerequisite for ${activeTargetRole}` : `Commonly expected for ${activeTargetRole}`,
          }
        }
        return m
      })
    } else {
      finalMissing = [
        ...scoreResult.missingEssential.map((s) => ({
          skill: s,
          priority: 'high',
          reason: `Core essential requirement for ${activeTargetRole}`,
        })),
        ...scoreResult.missingRecommended.map((s) => ({
          skill: s,
          priority: 'medium',
          reason: `Recommended standard for ${activeTargetRole}`,
        })),
      ]
    }

    // Formulate final skill matches
    let finalMatches = []
    if (Array.isArray(rawAnalysis.skillMatches) && rawAnalysis.skillMatches.length > 0) {
      finalMatches = rawAnalysis.skillMatches.map((sm) => ({
        ...sm,
        verified: sm.verified ?? verifiedSkills.some((v) => v.toLowerCase() === (sm.skill || '').toLowerCase()),
      }))
    } else {
      finalMatches = [
        ...scoreResult.matchedEssential.map((s) => ({
          skill: s,
          match: 'high',
          score: 90,
          verified: verifiedSkills.some((v) => v.toLowerCase() === s.toLowerCase()),
        })),
        ...scoreResult.matchedRecommended.map((s) => ({
          skill: s,
          match: 'medium',
          score: 75,
          verified: verifiedSkills.some((v) => v.toLowerCase() === s.toLowerCase()),
        })),
      ]
    }

    return {
      targetRole: activeTargetRole,
      jobId: selectedJob?.id || null,
      job: selectedJob ? {
        id: selectedJob.id,
        title: selectedJob.title,
        company: selectedJob.company_name,
        location: selectedJob.location,
      } : null,
      readinessScore: scoreResult.total,
      isIncomplete: scoreResult.isIncomplete,
      scoreBreakdown: {
        essentialScore: scoreResult.essentialScore,
        recommendedScore: scoreResult.recommendedScore,
        experienceScore: scoreResult.experienceScore,
        educationScore: scoreResult.educationScore,
        taskScore: scoreResult.taskScore,
      },
      explanation: scoreResult.explanation,
      summary: rawAnalysis.summary || `Readiness evaluation for ${activeTargetRole} grounded in verified and claimed profile evidence.`,
      skills: {
        verified: verifiedSkills,
        claimed: claimedSkills,
        matching: finalMatches,
        missing: finalMissing,
      },
      skillMatches: finalMatches,
      missingSkills: finalMissing,
      recommendedActions: Array.isArray(rawAnalysis.recommendedActions) && rawAnalysis.recommendedActions.length > 0
        ? rawAnalysis.recommendedActions
        : [
            `Address priority skill gaps in ${finalMissing.slice(0, 2).map((m) => m.skill).join(' and ')}`,
            'Build fullstack projects with verified deployment and automated tests',
            'Connect with platform alumni mentors working in your target domain',
          ],
      recommendedMentors,
      recommendedEvents,
      roadmap: existingRoadmap,
    }
  },

  /**
   * Generates or regenerates a personalized learning roadmap
   */
  async generateRoadmap({ user, targetRole, jobId, regenerate = false }) {
    if (!user?.id) {
      throw unprocessable('Authenticated user is required to generate a roadmap')
    }

    const readiness = await this.analyzeCareer({ user, targetRole, jobId })
    const activeTargetRole = readiness.targetRole

    // If not regenerating, check if user already has an existing roadmap for this role/job
    if (!regenerate && readiness.roadmap) {
      return readiness.roadmap
    }

    // Gather previously completed tasks to reconcile
    const previouslyCompleted = await getCompletedTasksForUser(user.id).catch(() => [])

    // Prompt AI for personalized staged roadmap
    const prompt = buildRoadmapPrompt({
      targetRole: activeTargetRole,
      missingSkills: readiness.missingSkills,
      currentSkills: readiness.skills?.matching?.map((m) => m.skill) || [],
      jobContext: readiness.job,
    })

    let rawRoadmap = {}
    try {
      rawRoadmap = await generateStructured({
        prompt,
        systemInstruction: SYSTEM_PROMPTS.CAREER_ROADMAP,
        schemaName: 'roadmap_generation',
      })
    } catch {
      rawRoadmap = {}
    }

    let generatedTasks = Array.isArray(rawRoadmap.tasks) ? rawRoadmap.tasks : []

    // If AI generation produced no tasks, use deterministic standard staged template
    if (generatedTasks.length === 0) {
      const isBackend = activeTargetRole.toLowerCase().includes('backend')
      const topGap1 = readiness.missingSkills[0]?.skill || (isBackend ? 'PostgreSQL' : 'TypeScript')
      const topGap2 = readiness.missingSkills[1]?.skill || (isBackend ? 'Docker' : 'Testing')

      generatedTasks = [
        {
          stage: 'Foundations',
          stageOrder: 1,
          taskOrder: 1,
          title: `Core Fundamentals & Prerequisite Mastery: ${topGap1}`,
          description: `Master fundamental syntax, patterns, and principles for ${topGap1}.`,
          skillFocus: topGap1,
          priority: 'high',
          estimatedDuration: '1 week',
          completionCriteria: [`Study core documentation and design patterns for ${topGap1}`, 'Complete 3 targeted coding exercises', 'Implement basic architectural demo'],
          learningActivity: `Review standard documentation and best practices for ${topGap1}`,
          practiceProject: `Build a standalone module applying ${topGap1}`,
        },
        {
          stage: 'Core Skills',
          stageOrder: 2,
          taskOrder: 1,
          title: `Role Specialization & Production Tooling: ${topGap2}`,
          description: `Develop proficiency in ${topGap2} and modern development tooling.`,
          skillFocus: topGap2,
          priority: 'high',
          estimatedDuration: '1-2 weeks',
          completionCriteria: [`Configure and deploy an environment using ${topGap2}`, 'Implement error handling and boundary tests', 'Integrate into local workflow'],
          learningActivity: `Follow step-by-step technical guides on ${topGap2}`,
          practiceProject: `Integrate ${topGap2} into existing project codebase`,
        },
        {
          stage: 'Applied Projects',
          stageOrder: 3,
          taskOrder: 1,
          title: `End-to-End Production Project for ${activeTargetRole}`,
          description: `Build and deploy a full-featured software project demonstrating ${topGap1} and ${topGap2}.`,
          skillFocus: 'System Architecture',
          priority: 'high',
          estimatedDuration: '2 weeks',
          completionCriteria: ['Implement authenticated endpoints and data persistence', 'Add automated test coverage (>80%)', 'Deploy to cloud hosting with CI/CD'],
          learningActivity: 'Architect full stack application with comprehensive documentation',
          practiceProject: `Production-ready application demonstrating ${activeTargetRole} capabilities`,
        },
        {
          stage: 'Interview Preparation',
          stageOrder: 4,
          taskOrder: 1,
          title: `Technical Interview Readiness & System Design`,
          description: `Practice technical questions, architectural trade-offs, and coding problems for ${activeTargetRole}.`,
          skillFocus: 'System Design & Problem Solving',
          priority: 'medium',
          estimatedDuration: '1-2 weeks',
          completionCriteria: ['Solve 5 key domain coding challenges', 'Conduct 1 mock technical interview session', 'Prepare STAR stories for past projects'],
          learningActivity: 'Review algorithmic patterns and system design frameworks',
          practiceProject: 'Write technical architecture document explaining scaling trade-offs',
        },
        {
          stage: 'Job Application Readiness',
          stageOrder: 5,
          taskOrder: 1,
          title: `Resume Optimization and Alumni Mentorship Review`,
          description: `Tailor resume with verified metrics, update portfolio, and book an advisory session with an alumni mentor.`,
          skillFocus: 'Career Strategy',
          priority: 'medium',
          estimatedDuration: '1 week',
          completionCriteria: ['Quantify project achievements with measurable metrics', 'Review roadmap progress with a Platform Alumni Mentor', 'Submit 3 tailored job applications'],
          learningActivity: 'Refine technical portfolio and ATS resume format',
          practiceProject: 'Publish live portfolio with demonstration links and GitHub repositories',
        },
      ]
    }

    // Reconcile new tasks with previously completed tasks
    const reconciledTasks = reconcileRoadmapTasks(generatedTasks, previouslyCompleted)

    // Persist roadmap
    const saved = await saveRoadmapWithTasks({
      userId: user.id,
      targetRole: activeTargetRole,
      jobId: readiness.job?.id || null,
      readinessScore: readiness.readinessScore,
      summary: rawRoadmap.summary || `Personalized ${activeTargetRole} career progression roadmap.`,
      skillsGap: {
        matching: readiness.skills?.matching || [],
        missing: readiness.skills?.missing || [],
      },
      metadata: {
        totalStages: 5,
        targetCompany: readiness.job?.company || null,
      },
      version: 1,
      tasks: reconciledTasks,
    })

    return saved
  },

  /**
   * Retrieves an existing roadmap with tasks and progress
   */
  async getRoadmap({ user, roadmapId, targetRole, jobId }) {
    if (!user?.id) {
      throw unprocessable('Authenticated user is required')
    }

    if (roadmapId) {
      return getRoadmapWithTasks(roadmapId, user.id)
    }

    const latest = await getLatestRoadmapForUser(user.id, { targetRole, jobId })
    if (!latest) {
      return null
    }

    return getRoadmapWithTasks(latest.id, user.id)
  },

  /**
   * Updates task completion state with strict user authorization
   */
  async updateRoadmapTask({ user, taskId, isCompleted }) {
    if (!user?.id) {
      throw unprocessable('Authenticated user is required')
    }

    return updateTaskStatus({ taskId, userId: user.id, isCompleted })
  },

  /**
   * Retrieves verified platform learning resources
   */
  async getResources({ user, targetRole }) {
    return getPlatformResources({ targetRole })
  },
}

