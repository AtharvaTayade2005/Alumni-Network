/**
 * Prompt Management Service
 * Keeps prompt templates, system instructions, and schemas centralized and versioned.
 */

export const SYSTEM_PROMPTS = {
  CAREER_ADVISOR: `You are the official AI Career & Networking Advisor for the Alumni Network Portal at Vidyalankar Institute of Technology.
Your mission is to provide clear, actionable career advisory, connect students and alumni, recommend high-fit job opportunities, and advise on skills.
Tone: Professional, supportive, constructive, and concise. Format with clear markdown bullet points where appropriate.

STRICT NO-HALLUCINATION POLICY FOR PLATFORM ENTITIES:
- Only recommend or reference alumni, mentors, and job postings that are explicitly provided in the retrieved platform data below.
- Never invent people, companies, job listings, or contact URLs.
- If the user specifically asks for alumni, mentors, or jobs, and the retrieved context indicates none were found, state clearly and honestly that no matching records were found in the current platform directory.
- For general skill advice or interview tips, offer industry-standard best practices, but keep platform-specific connections strictly grounded in the database records provided.`,

  RESUME_ANALYZER: `You are an expert ATS (Applicant Tracking System) and Technical Resume Reviewer.
Analyze the provided resume text thoroughly. Evaluate technical skills, impact quantification, clarity, formatting, and role alignment.
Return a structured assessment identifying detected strengths, missing critical skills, and clear improvements.`,

  CAREER_GAP_ANALYSIS: `You are a Senior Engineering Competency & Career Progression Advisor.
Analyze the candidate's skills against industry benchmark requirements for their target role.
Identify mastery level, skill gaps, immediate actionable milestones, and recommended mentors.`,
}

export function buildAssistantPrompt({
  message,
  history = [],
  userProfile = {},
  retrievedAlumni = [],
  retrievedMentors = [],
  retrievedJobs = [],
}) {
  const userRole = userProfile.role || 'STUDENT'
  const userName = userProfile.name || 'Member'
  const degree = userProfile.degree || userProfile.department || 'Engineering'
  const skills = Array.isArray(userProfile.skills) && userProfile.skills.length > 0
    ? userProfile.skills.join(', ')
    : 'None listed yet'
  const interests = userProfile.careerInterests || 'Software & Technology'

  let prompt = `User Context:
- Name: ${userName}
- Role: ${userRole}
- Field / Department: ${degree}
- Active Skills: ${skills}
- Interests: ${interests}
`

  if (retrievedAlumni.length > 0) {
    prompt += `\nRetrieved Platform Alumni (from PostgreSQL):\n`
    for (const a of retrievedAlumni) {
      prompt += `- ${a.name} (${a.currentRole || a.headline} at ${a.currentCompany}), Skills: ${(a.skills || []).join(', ') || 'N/A'}. Match: ${a.matchReason}\n`
    }
  }

  if (retrievedMentors.length > 0) {
    prompt += `\nRetrieved Platform Mentors (Available for 1-on-1 Mentorship):\n`
    for (const m of retrievedMentors) {
      prompt += `- ${m.name} (${m.role} at ${m.company}), Expertise: ${m.expertise}. Match: ${m.matchReason}\n`
    }
  }

  if (retrievedJobs.length > 0) {
    prompt += `\nRetrieved Active Job Openings (from Job Board):\n`
    for (const j of retrievedJobs) {
      prompt += `- ${j.title} at ${j.companyName} (${j.location}), Skills: ${(j.skills || []).join(', ') || 'General'}. Match: ${j.matchReason}\n`
    }
  }

  if (history?.length > 0) {
    prompt += `\nRecent Conversation History:\n`
    for (const h of history.slice(-6)) {
      prompt += `${h.role === 'user' ? 'User' : 'Advisor'}: ${h.text}\n`
    }
  }

  prompt += `\nCurrent User Query:\n${message}\n\nPlease provide an insightful, actionable response grounded in the provided platform data.`
  return prompt
}

export function buildResumeAnalysisPrompt({ resumeText, targetRole = 'Software Engineer', benchmarkSkills = [] }) {
  let prompt = `Target Role: ${targetRole}\n`
  if (benchmarkSkills.length > 0) {
    prompt += `Benchmark Industry Skills: ${benchmarkSkills.join(', ')}\n`
  }
  prompt += `\nResume Text:\n${resumeText}\n`
  prompt += `\nPerform a complete ATS scan and return a valid JSON object matching this schema:
{
  "score": <number 0-100>,
  "detectedSkills": [<strings>],
  "recommendedSkills": [<strings>],
  "formatting": [
    { "label": "<check name>", "passed": <boolean> }
  ],
  "improvements": [
    { "section": "<section name>", "advice": "<specific advice>" }
  ],
  "strengths": [<strings>],
  "summary": "<2-sentence executive summary>"
}`
  return prompt
}

export function buildCareerAnalysisPrompt({ targetRole, currentSkills = [], benchmarkRequirements = [] }) {
  let prompt = `Target Role: ${targetRole}\nCandidate Skills: ${currentSkills.join(', ') || 'General Engineering'}\n`
  if (benchmarkRequirements.length > 0) {
    prompt += `Benchmark Industry Stack: ${benchmarkRequirements.join(', ')}\n`
  }
  prompt += `\nPerform a skill gap and career readiness evaluation. Return a valid JSON object matching:
{
  "targetRole": "${targetRole}",
  "readinessScore": <number 0-100>,
  "skillMatches": [
    { "skill": "<skill>", "match": "high"|"medium"|"low", "score": <number 0-100> }
  ],
  "missingSkills": [<strings>],
  "recommendedActions": [<strings>],
  "recommendedMentors": []
}`
  return prompt
}
