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

  async generateText(promptOrOpts, _maybeSystemInstruction) {
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

  async generateStructured(promptOrOpts, _maybeSystemInstruction) {
    const prompt = String(typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts || '')
    const schemaName = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.schemaName : 'response'
    const isResume = schemaName === 'resume_analysis' || prompt.includes('UNTRUSTED_RESUME_CONTENT') || prompt.includes('ATS scan') || prompt.includes('Resume Text')

    if (isResume) {
      const lower = prompt.toLowerCase()
      const isBackend = lower.includes('backend')
      const isFrontend = lower.includes('frontend')
      const isFullStack = lower.includes('full stack') || lower.includes('fullstack')

      let detected = ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Git']
      let missing = ['TypeScript', 'Docker', 'Testing']
      let summaryText = 'Strong technical profile matching core software engineering roles.'

      if (isBackend) {
        detected = ['Node.js', 'PostgreSQL', 'Express', 'SQL', 'Git']
        missing = ['Docker', 'Redis', 'Microservices']
        summaryText = 'Well-structured technical background with strong backend and database foundations.'
      } else if (isFrontend) {
        detected = ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Git']
        missing = ['Next.js', 'Web Performance', 'Tailwind CSS']
        summaryText = 'Demonstrates solid frontend development capabilities and modern UI architecture.'
      } else if (isFullStack) {
        detected = ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Git']
        missing = ['Docker', 'Redis', 'CI/CD']
        summaryText = 'Strong full stack profile with balanced client and server experience.'
      }

      // If resume contains prompt injection (e.g. demanding 100), ignore it and stay objective
      return {
        score: 84,
        summary: summaryText,
        strengths: [
          'Clear separation of technical projects with active repository links',
          'Demonstrates hands-on experience in full-stack architecture',
        ],
        improvements: [
          {
            section: 'Experience',
            issue: 'Lacks measurable impact indicators',
            recommendation: 'Quantify achievements with percentage improvements and user scale.',
          },
          {
            section: 'Projects',
            issue: 'Missing deployment references',
            recommendation: 'Include live URLs or demo links alongside GitHub repository links.',
          },
        ],
        detectedSkills: detected,
        missingSkills: missing,
        recommendedSkills: missing,
        missingKeywords: ['CI/CD', 'Scalability', 'Containerization'],
        experienceFeedback: [
          'Lead bullets with action verbs (e.g., spearheaded, architected, optimized)',
          'Highlight specific business value delivered in internship positions',
        ],
        projectFeedback: [
          'Highlight concurrency, database query optimization, and architectural decisions',
        ],
        formattingWarnings: [
          'Ensure margins are consistent across all section headings',
        ],
        formatting: [
          { label: 'Length within standard ATS guidelines', passed: true },
          { label: 'Contact coordinates present and verifiable', passed: true },
          { label: 'Action verbs in project bullets', passed: true },
        ],
      }
    }

    const isCareer = schemaName === 'career_analysis' || prompt.includes('skill gap and career readiness evaluation')
    if (isCareer) {
      const lower = prompt.toLowerCase()
      const isBackend = lower.includes('backend')
      const isDevOps = lower.includes('devops')
      const isAI = lower.includes('ai') || lower.includes('machine learning')
      const isFullStack = lower.includes('full stack') || lower.includes('fullstack')

      if (isBackend) {
        return {
          targetRole: 'Backend Developer',
          readinessScore: 80,
          summary: 'Solid foundation in server-side logic and database persistence with targeted gaps in cloud infrastructure and distributed caching.',
          skillMatches: [
            { skill: 'Node.js', match: 'high', score: 90, verified: true },
            { skill: 'PostgreSQL', match: 'high', score: 88, verified: true },
            { skill: 'REST API', match: 'high', score: 85, verified: true },
            { skill: 'Git', match: 'medium', score: 75, verified: false },
          ],
          missingSkills: [
            { skill: 'Docker', priority: 'high', reason: 'Essential for containerizing microservices and CI/CD pipelines.' },
            { skill: 'Redis', priority: 'medium', reason: 'Commonly expected for high-throughput session and caching layers.' },
            { skill: 'System Design', priority: 'high', reason: 'Critical for architecting scalable distributed systems.' },
          ],
          recommendedActions: [
            'Containerize an existing backend service using Docker and Docker Compose',
            'Implement an in-memory Redis caching tier with TTL invalidation',
            'Study distributed system patterns including idempotency and circuit breakers',
          ],
        }
      }

      if (isDevOps) {
        return {
          targetRole: 'DevOps Engineer',
          readinessScore: 68,
          summary: 'Good familiarity with Linux and version control, with essential development needed in orchestration and infrastructure as code.',
          skillMatches: [
            { skill: 'Linux', match: 'high', score: 85, verified: true },
            { skill: 'Git', match: 'high', score: 90, verified: true },
            { skill: 'Bash', match: 'medium', score: 70, verified: false },
          ],
          missingSkills: [
            { skill: 'Kubernetes', priority: 'high', reason: 'Industry standard for container orchestration.' },
            { skill: 'Terraform', priority: 'high', reason: 'Crucial for declarative infrastructure as code.' },
            { skill: 'CI/CD', priority: 'high', reason: 'Required for automated deployment pipelines.' },
          ],
          recommendedActions: [
            'Set up automated GitHub Actions workflow for linting and testing',
            'Deploy a multi-tier application on Kubernetes using minikube or kind',
          ],
        }
      }

      if (isAI) {
        return {
          targetRole: 'AI / Machine Learning Engineer',
          readinessScore: 72,
          summary: 'Strong Python background with hands-on foundational libraries; requires deep learning and model serving experience.',
          skillMatches: [
            { skill: 'Python', match: 'high', score: 92, verified: true },
            { skill: 'Git', match: 'high', score: 85, verified: true },
            { skill: 'Data Analysis', match: 'medium', score: 70, verified: false },
          ],
          missingSkills: [
            { skill: 'PyTorch', priority: 'high', reason: 'Primary deep learning framework in modern AI engineering.' },
            { skill: 'LLMs', priority: 'high', reason: 'Essential for retrieval-augmented generation and prompt workflows.' },
            { skill: 'Model Deployment', priority: 'medium', reason: 'Necessary for serving models via low-latency inference APIs.' },
          ],
          recommendedActions: [
            'Fine-tune an open-source transformer model on domain data',
            'Build a semantic search and RAG pipeline with vector embeddings',
          ],
        }
      }

      // Default Frontend / Full Stack
      return {
        targetRole: isFullStack ? 'Full Stack Developer' : 'Frontend Developer',
        readinessScore: 84,
        summary: 'Excellent modern frontend capabilities with React and JavaScript; ready for advanced state management and testing fundamentals.',
        skillMatches: [
          { skill: 'React', match: 'high', score: 92, verified: true },
          { skill: 'JavaScript', match: 'high', score: 95, verified: true },
          { skill: 'HTML', match: 'high', score: 90, verified: true },
          { skill: 'TypeScript', match: 'medium', score: 65, verified: false },
        ],
        missingSkills: [
          { skill: 'System Design', priority: 'high', reason: 'Important for frontend architecture and modular component boundaries.' },
          { skill: 'Automated Testing', priority: 'high', reason: 'Expected for production-grade reliability with Vitest and Playwright.' },
          { skill: 'Web Performance', priority: 'medium', reason: 'Crucial for Core Web Vitals and load-time optimizations.' },
        ],
        recommendedActions: [
          'Complete unit and integration testing suites using Vitest and React Testing Library',
          'Implement server-side rendering and static generation with Next.js',
          'Profile browser rendering cycles and optimize bundle chunks',
        ],
      }
    }

    const isRoadmap = schemaName === 'roadmap_generation' || prompt.includes('progressive, personalized career learning roadmap')
    if (isRoadmap) {
      const lower = prompt.toLowerCase()
      const isBackend = lower.includes('backend')

      const roleStageTasks = isBackend ? [
        {
          stage: 'Foundations',
          stageOrder: 1,
          taskOrder: 1,
          title: 'Database Schema Modeling and Normalization',
          description: 'Design robust 3NF relational schemas, implement composite indexes, and understand query execution plans.',
          skillFocus: 'PostgreSQL',
          priority: 'high',
          estimatedDuration: '1 week',
          completionCriteria: ['Write migration for multi-entity relationship', 'Analyze queries using EXPLAIN ANALYZE', 'Implement transactional ACID constraints'],
          learningActivity: 'Study relational database index internals and transaction isolation levels',
          practiceProject: 'Refactor e-commerce database schema to eliminate N+1 query patterns',
        },
        {
          stage: 'Core Skills',
          stageOrder: 2,
          taskOrder: 1,
          title: 'Containerization and Multi-Stage Builds',
          description: 'Package backend Express application into an optimized, secure Docker container using alpine images.',
          skillFocus: 'Docker',
          priority: 'high',
          estimatedDuration: '1-2 weeks',
          completionCriteria: ['Create Dockerfile with non-root user', 'Set up multi-stage build reducing image size', 'Configure docker-compose with PostgreSQL and Redis services'],
          learningActivity: 'Learn Docker container layers, networking, and volume persistence',
          practiceProject: 'Containerize an existing API and deploy locally with docker-compose',
        },
        {
          stage: 'Applied Projects',
          stageOrder: 3,
          taskOrder: 1,
          title: 'Build Distributed High-Throughput Service with Redis Caching',
          description: 'Architect a production-ready microservice featuring rate limiting, background queues, and cache invalidation.',
          skillFocus: 'System Design & Redis',
          priority: 'high',
          estimatedDuration: '2 weeks',
          completionCriteria: ['Implement Redis caching layer with TTL', 'Add BullMQ / Redis job queue for asynchronous emails', 'Write integration tests covering failure scenarios'],
          learningActivity: 'Explore caching topologies, write-through vs cache-aside strategies',
          practiceProject: 'Build an asynchronous notification dispatcher service with rate limiting',
        },
        {
          stage: 'Interview Preparation',
          stageOrder: 4,
          taskOrder: 1,
          title: 'System Design Case Studies: Scalable API & Data Partitioning',
          description: 'Practice architectural trade-offs: SQL vs NoSQL, sharding, vertical vs horizontal scaling, and message queues.',
          skillFocus: 'System Design',
          priority: 'medium',
          estimatedDuration: '1-2 weeks',
          completionCriteria: ['Diagram architecture for URL shortener or rate limiter', 'Calculate bandwidth and storage estimations', 'Present architectural trade-offs'],
          learningActivity: 'Review classic system design interview patterns and API idempotency',
          practiceProject: 'Draft detailed architectural RFC for a scalable real-time feed',
        },
        {
          stage: 'Job Application Readiness',
          stageOrder: 5,
          taskOrder: 1,
          title: 'Tailor Resume with Verified Backend Metrics and Alumni Mock Interview',
          description: 'Update resume bullets with quantified throughput improvements and book a 1-on-1 session with a platform alumni mentor.',
          skillFocus: 'Career Strategy',
          priority: 'medium',
          estimatedDuration: '1 week',
          completionCriteria: ['Quantify project achievements with latency and throughput metrics', 'Conduct 1 mock technical interview with an Alumni Mentor', 'Submit 3 tailored job applications'],
          learningActivity: 'Prepare STAR-format behavioral examples and technical deep-dives',
          practiceProject: 'Publish live backend API demo on cloud with automated health check',
        },
      ] : [
        {
          stage: 'Foundations',
          stageOrder: 1,
          taskOrder: 1,
          title: 'Advanced TypeScript & Type Safety Fundamentals',
          description: 'Master generics, utility types, discriminated unions, and strict null checks in TypeScript.',
          skillFocus: 'TypeScript',
          priority: 'high',
          estimatedDuration: '1 week',
          completionCriteria: ['Refactor JavaScript components to strict TypeScript', 'Eliminate all "any" types', 'Define robust API interface contracts'],
          learningActivity: 'Study TypeScript Handbook on generics and narrowing',
          practiceProject: 'Type-safe state machine for multi-step checkout workflow',
        },
        {
          stage: 'Core Skills',
          stageOrder: 2,
          taskOrder: 1,
          title: 'Production Component Architecture & Automated Testing',
          description: 'Implement modular UI components and automated test suites using Vitest and React Testing Library.',
          skillFocus: 'Testing & Vitest',
          priority: 'high',
          estimatedDuration: '1-2 weeks',
          completionCriteria: ['Write unit tests for UI components', 'Test error boundary fallback states', 'Achieve >80% test coverage on critical paths'],
          learningActivity: 'Learn testing user interactions over implementation details',
          practiceProject: 'Accessible design system component library with interactive story examples',
        },
        {
          stage: 'Applied Projects',
          stageOrder: 3,
          taskOrder: 1,
          title: 'Full-Stack Performance-Optimized Dashboard',
          description: 'Build a high-performance web dashboard featuring client-side caching, virtualized lists, and optimistic updates.',
          skillFocus: 'React & Web Performance',
          priority: 'high',
          estimatedDuration: '2 weeks',
          completionCriteria: ['Implement windowing for large lists', 'Optimize bundle with code-splitting', 'Score 90+ on Google Lighthouse Performance'],
          learningActivity: 'Analyze bundle composition and browser main-thread bottlenecks',
          practiceProject: 'Real-time analytics dashboard with WebSockets and SVG chart rendering',
        },
        {
          stage: 'Interview Preparation',
          stageOrder: 4,
          taskOrder: 1,
          title: 'Frontend System Design & Coding Patterns',
          description: 'Master frontend architecture concepts: state management topologies, offline sync, design systems, and security (XSS/CSRF).',
          skillFocus: 'Frontend Architecture',
          priority: 'medium',
          estimatedDuration: '1-2 weeks',
          completionCriteria: ['Solve 5 advanced JavaScript DOM and event-loop problems', 'Design scalable micro-frontend or modular UI architecture', 'Prepare technical walk-through of past projects'],
          learningActivity: 'Study frontend system design case studies and web security practices',
          practiceProject: 'Implement reusable autocomplete search component from scratch',
        },
        {
          stage: 'Job Application Readiness',
          stageOrder: 5,
          taskOrder: 1,
          title: 'Portfolio Optimization & Alumni Networking',
          description: 'Polish portfolio deployment, verify WCAG 2.1 accessibility, and connect with alumni frontend engineers.',
          skillFocus: 'Career Strategy',
          priority: 'medium',
          estimatedDuration: '1 week',
          completionCriteria: ['Deploy portfolio with custom domain and automated CI/CD', 'Pass automated axe-core accessibility audit', 'Connect with 2 alumni mentors in target companies'],
          learningActivity: 'Review portfolio presentation best practices and resume bullet impact',
          practiceProject: 'Write technical engineering blog post breaking down an architectural challenge',
        },
      ]

      return {
        summary: `Tailored 5-stage career progression roadmap designed to elevate technical competencies for ${isBackend ? 'Backend Developer' : 'Frontend Developer'}.`,
        tasks: roleStageTasks,
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
