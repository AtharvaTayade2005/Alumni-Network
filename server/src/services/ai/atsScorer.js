/**
 * ATS Scoring & Signal Extraction Engine
 * Evaluates resumes through deterministic heuristics and industry ATS scoring standards.
 */

import { getRoleBenchmark } from './skillTaxonomy.js'

const ACTION_VERBS = new Set([
  'built', 'developed', 'designed', 'architected', 'spearheaded', 'engineered',
  'implemented', 'deployed', 'optimized', 'improved', 'created', 'integrated',
  'managed', 'led', 'orchestrated', 'automated', 'reduced', 'increased', 'scaled',
  'refactored', 'delivered', 'mentored', 'analyzed', 'established', 'formulated',
])

export function evaluateSections(text = '') {
  const content = String(text)
  const sections = []

  // 1. Contact Information
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(content)
  const hasPhone = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(content)
  const hasLinks = /(?:linkedin\.com|github\.com|portfolio|gitlab\.com)/i.test(content)
  const contactPassed = hasEmail && (hasPhone || hasLinks)
  sections.push({
    name: 'Contact Information',
    found: contactPassed,
    feedback: contactPassed
      ? 'Email and contact coordinates detected'
      : 'Include email and professional links (LinkedIn or GitHub)',
  })

  // 2. Education
  const hasEducation = /(?:education|academics|degree|b\.?tech|m\.?tech|bachelor|master|university|college|institute)/i.test(content)
  sections.push({
    name: 'Education',
    found: hasEducation,
    feedback: hasEducation
      ? 'Academic credentials and degree details found'
      : 'Add formal education degree and graduation details',
  })

  // 3. Experience / Work History
  const hasExperience = /(?:experience|work\s+history|employment|internship|professional\s+experience)/i.test(content)
  sections.push({
    name: 'Work Experience',
    found: hasExperience,
    feedback: hasExperience
      ? 'Work or internship experience section identified'
      : 'Include internships, co-ops, or full-time experience',
  })

  // 4. Technical Projects
  const hasProjects = /(?:projects|academic\s+projects|personal\s+projects|portfolio)/i.test(content)
  sections.push({
    name: 'Projects',
    found: hasProjects,
    feedback: hasProjects
      ? 'Technical project portfolio section identified'
      : 'Add key technical projects highlighting technologies used and scale',
  })

  // 5. Technical Skills
  const hasSkills = /(?:skills|technical\s+skills|core\s+competencies|technologies|tech\s+stack)/i.test(content)
  sections.push({
    name: 'Skills',
    found: hasSkills,
    feedback: hasSkills
      ? 'Dedicated technical skills catalog present'
      : 'Add a categorized technical skills section for automated parsing',
  })

  // 6. Certifications & Achievements
  const hasCerts = /(?:certifications?|achievements?|awards?|honors?|publications?)/i.test(content)
  sections.push({
    name: 'Certifications & Honors',
    found: hasCerts,
    feedback: hasCerts
      ? 'Certifications or notable honors recognized'
      : 'Optional: consider adding relevant certifications or hackathon honors',
  })

  return sections
}

export function evaluateMetricsAndVerbs(text = '') {
  const content = String(text)
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 5)

  let actionVerbCount = 0
  let metricCount = 0

  const metricRegex = /(?:\d+%\s*(?:increase|decrease|reduction|improvement|growth)|\b\d+(?:ms|s|x|\+)?\b|\b\d+(?:k|m|mil|million|thousand)\b|\b\d+\s*(?:users|clients|requests|endpoints|queries|stars))/i

  for (const line of lines) {
    const firstWord = line.replace(/^[•*\-–—]\s*/, '').split(/\s+/)[0]?.toLowerCase()
    if (ACTION_VERBS.has(firstWord)) {
      actionVerbCount++
    }
    if (metricRegex.test(line)) {
      metricCount++
    }
  }

  return {
    actionVerbCount,
    metricCount,
    hasStrongVerbs: actionVerbCount >= 3,
    hasQuantifiableImpact: metricCount >= 2,
  }
}

export function evaluateFormatting(text = '') {
  const charLength = text.length
  const lines = text.split('\n')
  const bulletLines = lines.filter((l) => /^[•*\-–—]/.test(l.trim())).length

  const checks = [
    {
      label: 'Document Length & Density',
      passed: charLength >= 350 && charLength <= 12000,
      note: charLength < 350
        ? 'Resume is too brief (< 350 characters); provide more depth.'
        : charLength > 12000
          ? 'Resume exceeds typical 2-page density; consider concise editing.'
          : 'Appropriate document length for standard ATS parsing.',
    },
    {
      label: 'Bullet Point Structure',
      passed: bulletLines >= 4 || lines.length >= 10,
      note: bulletLines >= 4
        ? 'Bullet points help ATS parsers isolate responsibilities.'
        : 'Use bullet points to format achievements and project contributions.',
    },
    {
      label: 'Clean Text Readability',
      // Check for excessive strange characters or table separator junk
      passed: !/[|│║]{4,}/.test(text),
      note: 'Avoid complex nested tables or graphic columns that disrupt machine parsers.',
    },
  ]

  return checks
}

/**
 * Calculates a grounded, deterministic ATS score based on measurable signals.
 */
export function calculateAtsScore({
  text = '',
  detectedSkills = [],
  targetRole = 'Software Engineer',
  selectedJob = null,
}) {
  const sections = evaluateSections(text)
  const metrics = evaluateMetricsAndVerbs(text)
  const formatting = evaluateFormatting(text)
  const benchmark = getRoleBenchmark(targetRole)

  // 1. Section Completeness (Max 25 pts)
  const requiredSectionNames = ['Contact Information', 'Education', 'Work Experience', 'Projects', 'Skills']
  const matchedRequired = sections.filter((s) => requiredSectionNames.includes(s.name) && s.found).length
  const sectionScore = Math.round((matchedRequired / requiredSectionNames.length) * 25)

  // 2. Skill & Benchmark Coverage (Max 35 pts)
  const allDetected = new Set(detectedSkills.map((s) => s.toLowerCase()))
  let skillMatchCount = 0

  const targetBenchmarkSkills = selectedJob?.requiredSkills || benchmark.essentialSkills
  for (const s of targetBenchmarkSkills) {
    if (allDetected.has(s.toLowerCase())) {
      skillMatchCount++
    }
  }

  const skillRatio = targetBenchmarkSkills.length > 0
    ? skillMatchCount / targetBenchmarkSkills.length
    : 0.5
  const skillScore = Math.min(35, Math.round(skillRatio * 35))

  // 3. Action Verbs & Quantified Metrics (Max 25 pts)
  let impactScore = 0
  if (metrics.actionVerbCount >= 5) impactScore += 12
  else if (metrics.actionVerbCount >= 2) impactScore += 8
  else if (metrics.actionVerbCount >= 1) impactScore += 4

  if (metrics.metricCount >= 4) impactScore += 13
  else if (metrics.metricCount >= 2) impactScore += 9
  else if (metrics.metricCount >= 1) impactScore += 5

  // 4. Formatting & Readability (Max 15 pts)
  const passedFormatChecks = formatting.filter((f) => f.passed).length
  const formattingScore = Math.round((passedFormatChecks / formatting.length) * 15)

  // Overall Score
  const rawScore = sectionScore + skillScore + impactScore + formattingScore
  const finalScore = Math.max(10, Math.min(98, rawScore))

  return {
    score: finalScore,
    atsCompatibility: Math.min(100, Math.round(finalScore * 1.02)),
    breakdown: {
      sectionScore,
      skillScore,
      impactScore,
      formattingScore,
    },
    sections,
    metrics,
    formatting,
  }
}
