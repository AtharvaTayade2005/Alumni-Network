import { query } from '../../config/database.js'
import { getRoleBenchmark } from './skillTaxonomy.js'

/**
 * Technical Career Readiness & Skill Gap Calculation Engine
 */

export function calculateReadinessScore({
  targetRole,
  roleBenchmark,
  jobRecord = null,
  candidateSkills = [],
  verifiedSkills: _verifiedSkills = [],
  claimedSkills: _claimedSkills = [],
  experienceEntries = [],
  educationEntries = [],
  studentProfile = null,
  completedTasksCount = 0,
  totalTasksCount = 0,
}) {
  const benchmark = roleBenchmark || getRoleBenchmark(targetRole)
  const candidateLower = new Set(candidateSkills.map((s) => String(s).toLowerCase().trim()))

  // Check if profile is empty / incomplete
  const hasNoData = candidateSkills.length === 0 &&
    experienceEntries.length === 0 &&
    educationEntries.length === 0

  if (hasNoData) {
    return {
      total: 0,
      isIncomplete: true,
      essentialScore: 0,
      recommendedScore: 0,
      experienceScore: 0,
      educationScore: 0,
      taskScore: 0,
      matchedEssential: [],
      missingEssential: benchmark.essentialSkills,
      matchedRecommended: [],
      missingRecommended: benchmark.recommendedSkills,
      explanation: 'No profile skills, experience, or education found. Please add your technical background to compute an accurate readiness score.',
    }
  }

  // 1. Essential Skills Coverage (Max 40 pts)
  const essentialList = jobRecord?.requiredSkills?.length
    ? jobRecord.requiredSkills
    : benchmark.essentialSkills

  const matchedEssential = []
  const missingEssential = []

  for (const skill of essentialList) {
    const sLower = skill.toLowerCase()
    const isMatched = candidateLower.has(sLower) ||
      [...candidateLower].some((c) => c.includes(sLower) || sLower.includes(c))

    if (isMatched) {
      matchedEssential.push(skill)
    } else {
      missingEssential.push(skill)
    }
  }

  const essentialScore = essentialList.length > 0
    ? Math.round((matchedEssential.length / essentialList.length) * 40)
    : 30

  // 2. Recommended Skills Coverage (Max 20 pts)
  const recommendedList = jobRecord?.preferredSkills?.length
    ? jobRecord.preferredSkills
    : benchmark.recommendedSkills

  const matchedRecommended = []
  const missingRecommended = []

  for (const skill of recommendedList) {
    const sLower = skill.toLowerCase()
    const isMatched = candidateLower.has(sLower) ||
      [...candidateLower].some((c) => c.includes(sLower) || sLower.includes(c))

    if (isMatched) {
      matchedRecommended.push(skill)
    } else {
      missingRecommended.push(skill)
    }
  }

  const recommendedScore = recommendedList.length > 0
    ? Math.round((matchedRecommended.length / recommendedList.length) * 20)
    : 15

  // 3. Hands-on Experience & Projects (Max 20 pts)
  let experienceScore = 0
  if (experienceEntries.length > 0) {
    // Points for experience volume and role relevance
    const roleKeywords = benchmark.keywords || []
    let relevantCount = 0
    for (const exp of experienceEntries) {
      const text = `${exp.title || ''} ${exp.description || ''}`.toLowerCase()
      const hasKeywords = roleKeywords.some((kw) => text.includes(kw.toLowerCase()))
      if (hasKeywords) relevantCount += 1
    }
    experienceScore = Math.min(20, (experienceEntries.length * 5) + (relevantCount * 5))
  } else if (candidateSkills.length >= 4) {
    // Baseline project potential for students with proven skill density
    experienceScore = 8
  }

  // 4. Education & Academic Background (Max 10 pts)
  let educationScore = 5
  const academicField = [
    ...educationEntries.map((e) => `${e.degree || ''} ${e.field_of_study || ''}`),
    `${studentProfile?.degree || ''} ${studentProfile?.department || ''}`,
  ].join(' ').toLowerCase()

  if (academicField.includes('computer') || academicField.includes('software') || academicField.includes('data') || academicField.includes('information') || academicField.includes('tech') || academicField.includes('engineering')) {
    educationScore = 10
  } else if (educationEntries.length > 0 || studentProfile?.degree) {
    educationScore = 7
  }

  // 5. Completed Learning Roadmap Tasks (Max 10 pts)
  let taskScore = 0
  if (totalTasksCount > 0) {
    taskScore = Math.round((completedTasksCount / totalTasksCount) * 10)
  } else {
    // If no roadmap tasks created yet, allocate partial credit based on skill match ratio
    taskScore = Math.round(((matchedEssential.length + matchedRecommended.length) / Math.max(1, essentialList.length + recommendedList.length)) * 5)
  }

  const total = Math.max(0, Math.min(100, essentialScore + recommendedScore + experienceScore + educationScore + taskScore))

  return {
    total,
    isIncomplete: false,
    essentialScore,
    recommendedScore,
    experienceScore,
    educationScore,
    taskScore,
    matchedEssential,
    missingEssential,
    matchedRecommended,
    missingRecommended,
    explanation: `Readiness estimate: Essential skills (${essentialScore}/40), Recommended skills (${recommendedScore}/20), Experience & projects (${experienceScore}/20), Education (${educationScore}/10), Roadmap progress (${taskScore}/10).`,
  }
}

/**
 * Reconciles newly generated roadmap tasks with previously completed tasks.
 * Ensures completed work is never discarded when a student regenerates their roadmap!
 */
export function reconcileRoadmapTasks(newTasks = [], previouslyCompletedTasks = []) {
  if (!previouslyCompletedTasks || previouslyCompletedTasks.length === 0) {
    return newTasks.map((t, idx) => ({
      ...t,
      stageOrder: t.stageOrder || 1,
      taskOrder: t.taskOrder || (idx + 1),
      isCompleted: false,
      completedAt: null,
    }))
  }

  const completedMap = new Map()
  for (const ct of previouslyCompletedTasks) {
    if (ct.skillFocus) {
      completedMap.set(ct.skillFocus.toLowerCase().trim(), ct)
    }
    if (ct.title) {
      completedMap.set(ct.title.toLowerCase().trim(), ct)
    }
  }

  return newTasks.map((t, idx) => {
    const skillKey = (t.skillFocus || '').toLowerCase().trim()
    const titleKey = (t.title || '').toLowerCase().trim()

    let matched = null
    if (skillKey && completedMap.has(skillKey)) {
      matched = completedMap.get(skillKey)
    } else if (titleKey && completedMap.has(titleKey)) {
      matched = completedMap.get(titleKey)
    } else {
      // Check partial title matching
      for (const [key, ct] of completedMap.entries()) {
        if (key.length > 5 && (titleKey.includes(key) || key.includes(titleKey))) {
          matched = ct
          break
        }
      }
    }

    if (matched) {
      return {
        ...t,
        stageOrder: t.stageOrder || 1,
        taskOrder: t.taskOrder || (idx + 1),
        isCompleted: true,
        completedAt: matched.completedAt || matched.completed_at || new Date(),
      }
    }

    return {
      ...t,
      stageOrder: t.stageOrder || 1,
      taskOrder: t.taskOrder || (idx + 1),
      isCompleted: false,
      completedAt: null,
    }
  })
}

/**
 * Retrieves real platform learning resources (verified mentors and active events)
 */
export async function getPlatformResources({ targetRole: _targetRole = '' } = {}) {
  let recommendedMentors = []
  let recommendedEvents = []

  // 1. Real active alumni mentors from PostgreSQL
  try {
    const { rows: mentors } = await query(
      `SELECT u.id, u.first_name, u.last_name, ap.current_company, ap.current_position
       FROM users u
       JOIN alumni_profiles ap ON ap.user_id = u.id
       WHERE ap.is_open_to_mentor = true
       LIMIT 3`
    )
    recommendedMentors = mentors.map((m) => ({
      id: m.id,
      name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Alumni Mentor',
      company: m.current_company || 'Industry Partner',
      role: m.current_position || 'Senior Engineer',
    }))
  } catch {
    // Non-fatal
  }

  // 2. Real upcoming published platform events
  try {
    const { rows: events } = await query(
      `SELECT id, title, description, event_type, event_date, start_time
       FROM events
       WHERE status = 'published'
       ORDER BY event_date ASC
       LIMIT 3`
    )
    recommendedEvents = events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.event_type || 'Workshop',
      date: e.event_date,
      description: e.description ? e.description.slice(0, 120) + '...' : '',
    }))
  } catch {
    // Non-fatal
  }

  return {
    recommendedMentors,
    recommendedEvents,
  }
}
