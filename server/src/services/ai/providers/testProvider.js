import crypto from 'node:crypto'

const TEST_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'who', 'what', 'where', 'when', 'why', 'how', 'find', 'some',
  'any', 'my', 'me', 'i', 'would', 'like', 'help', 'related', 'someone', 'interested',
])

function normalizeTestToken(token) {
  if (token === 'alumni' || token === 'alumnus' || token === 'alumna') return 'alumn'
  if (token === 'jobs' || token === 'job' || token === 'openings' || token === 'opening') return 'job'
  if (token === 'events' || token === 'event' || token === 'meetups') return 'event'
  if (token === 'developer' || token === 'developers' || token === 'development') return 'dev'
  if (token === 'engineer' || token === 'engineers' || token === 'engineering') return 'eng'
  if (token === 'ai' || token === 'artificial' || token === 'intelligence') return 'ai'
  return token
}

export class TestProvider {
  constructor() {
    this.name = 'test'
  }

  isConfigured() {
    return true
  }

  assertConfigured() {
    return true
  }

  async generateText(promptOrOpts, maybeSystemInstruction) {
    const prompt = String(typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts || '')
    const lower = prompt.toLowerCase()

    if (lower.includes('backend development') || lower.includes('backend')) {
      return `For backend development, I recommend mastering Node.js/Express, PostgreSQL relational schema design, REST/GraphQL APIs, and Docker containerization. Quantify latency improvements and build distributed caching solutions with Redis.`
    }

    if (lower.includes('mentor') || lower.includes('guidance')) {
      if (prompt.includes('Retrieved Platform Mentors')) {
        return `Based on our verified alumni directory, I recommend booking a 1-on-1 session with the mentors displayed below. They have direct expertise in software engineering and can assist with technical roadmap reviews.`
      }
      return `I couldn't find an exact matching mentor in the current directory with that specific keyword, but you can explore our mentorship directory to connect with verified alumni.`
    }

    if (lower.includes('job') || lower.includes('opening')) {
      if (prompt.includes('Retrieved Active Job Openings')) {
        return `I found active opportunities on our job board matching your technical profile. Review the requirements and reach out to alumni working at those companies for referrals.`
      }
      return `I couldn't find a strong matching job in the current job listings. Check back regularly as campus partners and alumni frequently post new openings.`
    }

    if (lower.includes('alumni') || lower.includes('people') || lower.includes('connect')) {
      if (prompt.includes('Retrieved Platform Alumni')) {
        return `Here are relevant alumni from our network who match your query. You can connect with them directly or view their full profiles to learn about their career trajectories.`
      }
      return `I couldn't find any alumni matching that query in the directory right now. Try expanding your search terms or checking back later.`
    }

    return `As your Career Advisor, I recommend strengthening core system fundamentals, building end-to-end fullstack projects, and networking with alumni in your target industry.`
  }

  async generateStructured(promptOrOpts, maybeSystemInstruction) {
    const prompt = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts
    const schemaName = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.schemaName : 'response'
    if (schemaName === 'resume_analysis') {
      return {
        score: 86,
        detectedSkills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Git'],
        recommendedSkills: ['TypeScript', 'Docker', 'Testing'],
        formatting: [
          { label: 'Length within 2 pages', passed: true },
          { label: 'Contact information present', passed: true },
          { label: 'Action verbs in experience', passed: true },
        ],
        improvements: [
          { section: 'Projects', advice: 'Quantify metrics and throughput for fullstack apps.' },
        ],
        strengths: ['Clear project breakdown', 'Solid fullstack skill overlap'],
        summary: 'Strong technical profile matching core software engineering roles.',
      }
    }

    if (schemaName === 'career_analysis') {
      return {
        targetRole: 'Frontend Engineer',
        readinessScore: 84,
        skillMatches: [
          { skill: 'React', match: 'high', score: 92 },
          { skill: 'JavaScript', match: 'high', score: 95 },
          { skill: 'TypeScript', match: 'medium', score: 65 },
        ],
        missingSkills: ['System Design', 'Automated Testing'],
        recommendedActions: [
          'Complete unit and integration testing suite in project',
          'Attend upcoming Distributed Systems campus workshop',
        ],
        recommendedMentors: [],
      }
    }

    return {
      text: 'AI response generated successfully.',
      suggestedActions: [
        { label: 'Explore Directory', to: '/alumni' },
        { label: 'Browse Jobs', to: '/jobs' },
      ],
    }
  }

  async generateEmbedding(text) {
    const dim = 768
    const vector = new Array(dim).fill(0)
    const raw = String(text || '').toLowerCase().trim()
    if (!raw) return vector

    // Tokenize into words, remove stop words, apply simple stemming
    const rawTokens = raw.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1)
    const filteredTokens = rawTokens.filter((t) => !TEST_STOP_WORDS.has(t)).map(normalizeTestToken)
    const tokens = filteredTokens.length > 0 ? filteredTokens : rawTokens

    if (tokens.length === 0) {
      const hash = crypto.createHash('sha256').update(raw).digest()
      for (let i = 0; i < dim; i++) {
        vector[i] = ((hash[i % hash.length] - 128) / 128) * (1 / Math.sqrt(dim))
      }
    } else {
      for (const token of tokens) {
        const h = crypto.createHash('sha256').update(token).digest()
        for (let b = 0; b < 6; b++) {
          const idx = h.readUInt16BE(b * 2) % dim
          const sign = (h[12 + b] % 2 === 0) ? 1 : -1
          vector[idx] += sign * (1.0 / Math.sqrt(tokens.length))
        }
      }
    }

    // Normalize vector to unit length
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1
    return vector.map((v) => Number((v / norm).toFixed(6)))
  }
}
