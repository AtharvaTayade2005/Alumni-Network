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
    const rawPrompt = String(
      typeof promptOrOpts === 'object' && promptOrOpts !== null
        ? promptOrOpts.prompt
        : promptOrOpts || ''
    )

    // Extract the actual user query from structured prompt if present, avoiding system prompt pollution
    const queryMatch = rawPrompt.match(/Current User Query:\s*([\s\S]*?)(?:\n\nPlease provide|\n\nRecent Conversation|$)/i)
    const userQuery = (queryMatch ? queryMatch[1].trim() : rawPrompt.trim())
    const qLower = userQuery.toLowerCase()

    // 1. Resume / ATS / Review advice
    if (/\b(resume|cv|ats|curriculum vitae)\b/i.test(qLower) || (/\b(review|format|template)\b/i.test(qLower) && !/\b(code|pr)\b/i.test(qLower))) {
      return `Here is tailored guidance to optimize your resume for campus recruiters and Applicant Tracking Systems (ATS):

1. **ATS Format & Structure:**
   - Use a clean, single-column layout with standard headings: Summary, Technical Skills, Experience, Projects, and Education.
   - Avoid tables, multi-column blocks, text boxes, graphics, and icons, which frequently cause ATS parser errors.
   - Save and export as standard PDF or Word (.docx).

2. **Quantifiable Bullet Points (STAR Method):**
   - Begin each bullet with a strong action verb (e.g., *Architected*, *Engineered*, *Optimized*, *Automated*).
   - Quantify results with engineering metrics (e.g., *"Reduced API response latency by 35% with Redis caching"* or *"Built REST API handling 5,000+ daily requests"*).

3. **Skills Categorization:**
   - Clearly group skills into Languages (JavaScript, TypeScript, Python), Frameworks & Libraries (React, Node.js, Express), Databases (PostgreSQL, MongoDB), and Tools/DevOps (Docker, Git, AWS).

4. **Projects & Proof of Work:**
   - Include direct GitHub repository links and live demonstration URLs for at least two comprehensive full-stack projects.

Tip: You can use our built-in **Resume Analyzer** at \`/resume-analyzer\` for an automated ATS score, section breakdown, and detailed keyword gap analysis.`
    }

    // 2. React / Frontend / UI / Interview preparation
    if (/\b(react|frontend|front-end|ui|vue|angular|css|html)\b/i.test(qLower) || (/\binterview\b/i.test(qLower) && !/\b(backend|cloud|devops)\b/i.test(qLower))) {
      return `To thoroughly prepare for a modern React & Frontend Engineering interview, focus on these five core pillars:

1. **JavaScript & TypeScript Fundamentals:**
   - Master closures, the event loop, event delegation, hoisting, prototypes, and asynchronous JavaScript (\`Promises\`, \`async/await\`).
   - Understand TypeScript fundamentals: interfaces, union types, generics, and strict type checking.

2. **React Internals & Architecture:**
   - **Virtual DOM & Reconciliation:** Understand fiber architecture, batching, and how React determines when to re-render.
   - **Hooks In-Depth:** Explain mechanics and trade-offs of \`useState\`, \`useEffect\`, \`useMemo\`, \`useCallback\`, \`useRef\`, and creating custom hooks.
   - **State Management:** When to use local state vs. React Context vs. external stores (Redux Toolkit, Zustand, or TanStack Query for server state).

3. **Frontend System Design & Performance:**
   - Component composition patterns, code-splitting with \`React.lazy\` and \`Suspense\`, bundle optimization, and image lazy-loading.
   - Core Web Vitals: Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).

4. **Machine Coding & Practical Exercises:**
   - Practice building standard components within a 45-minute window: Autocomplete search bar with debouncing, infinite scroll list with \`IntersectionObserver\`, and accessible modal dialogs.

5. **Behavioral & Project Walkthrough:**
   - Be prepared to discuss technical challenges: how you diagnosed a frontend memory leak, optimized render performance, or designed an accessible design system.`
    }

    // 3. Backend / Node.js / Database / API / System Architecture
    if (/\b(backend|back-end|node|express|database|postgres|postgresql|sql|api|rest|graphql|redis|nosql)\b/i.test(qLower) && !/\b(job|jobs|opening|openings)\b/i.test(qLower)) {
      return `For robust backend engineering, prioritize the following architecture, persistence, and scaling fundamentals:

1. **Server Architecture & Runtime:**
   - Node.js event-driven architecture, libuv thread pool, and handling asynchronous non-blocking I/O efficiently.
   - Modular RESTful / GraphQL API design with clean controllers, service layers, and validation (e.g. Zod schemas).

2. **Relational Database Mastery (PostgreSQL):**
   - Database normalization (3NF), foreign keys, composite indexes, and transaction isolation levels (ACID).
   - Profiling query performance with \`EXPLAIN ANALYZE\` and preventing N+1 query antipatterns.

3. **Authentication & Security:**
   - Secure JWT token architecture with short-lived access tokens and rotating refresh tokens stored in HTTP-only cookies.
   - Rate limiting, password hashing (bcrypt/argon2), input sanitization, and CORS headers.

4. **Caching & Asynchronous Queues:**
   - In-memory caching with Redis (cache-aside pattern, TTL expiration, invalidation strategies).
   - Background job processing and message queues (BullMQ, RabbitMQ) for asynchronous tasks like email dispatch.

5. **Containerization & Deployment:**
   - Multi-stage Docker builds to reduce image size, docker-compose orchestration, and CI/CD pipelines.`
    }

    // 4. Cloud Architecture / DevOps / AWS / Kubernetes / Docker
    if (/\b(cloud|devops|aws|azure|gcp|docker|kubernetes|k8s|terraform|architecture)\b/i.test(qLower) && !/\b(job|jobs|opening|openings)\b/i.test(qLower) && !/\b(mentor|mentors|mentorship)\b/i.test(qLower)) {
      return `For Cloud Architecture and DevOps engineering, here is a structured roadmap and advisory:

1. **Cloud Core Services & Networking:**
   - Compute: Elastic instances, container runtimes (ECS, EKS), and serverless functions (AWS Lambda).
   - Networking & Security: Virtual Private Clouds (VPCs), subnets, NAT gateways, security groups, and IAM least-privilege policies.

2. **Containerization & Orchestration:**
   - Docker container packaging, multi-stage builds, and lightweight Alpine base images.
   - Kubernetes architecture: Pods, Deployments, Services, Ingress controllers, and Helm charts for package management.

3. **Infrastructure as Code (IaC):**
   - Declarative infrastructure management with Terraform or AWS CDK. Maintain clean state backends and modular configurations.

4. **Observability & SRE Best Practices:**
   - Centralized logging, metrics collection (Prometheus, Grafana), health check probes, and distributed tracing.
   - High availability patterns: multi-AZ deployments, auto-scaling groups, and automated database failover.`
    }

    // 5. Jobs / Openings / Hiring / Internships
    if (/\b(jobs?|openings?|hiring|internships?|vacanc(?:y|ies)|positions?|opportunities)\b/i.test(qLower)) {
      if (rawPrompt.includes('Retrieved Active Job Openings')) {
        return `I found active opportunities on our platform job board matching your technical profile. Review the requirements on the Job Board and consider reaching out to alumni at those companies for referrals and application guidance.`
      }
      return `You can explore all active verified opportunities directly on our Job Board at \`/jobs\`. Partner companies and alumni regularly post internships, full-time positions, and referral opportunities across frontend, backend, cloud, and AI engineering.`
    }

    // 6. Mentors / Networking / Connections (explicitly requested)
    if (/\b(mentors?|mentorship|networking|connect(?:ions?)?|advis(?:or|ing))\b/i.test(qLower)) {
      if (rawPrompt.includes('Retrieved Platform Mentors')) {
        return `Based on our verified alumni directory, I recommend booking a 1-on-1 session with the mentors displayed below. They have direct expertise in software engineering and cloud systems, and can assist with technical roadmap reviews, resume feedback, and mock interviews.`
      }
      return `Our alumni network connects you with verified mentors working at top companies (including Google, Microsoft, and Atlassian). You can browse available mentors by domain, review their background, and request 1-on-1 sessions at \`/mentorship\`.`
    }

    // 7. Alumni / Directory / People search
    if (/\b(alumni|alumnus|alumna|graduates?|people|members?)\b/i.test(qLower)) {
      if (rawPrompt.includes('Retrieved Platform Alumni')) {
        return `Here are relevant alumni from our network matching your query. You can connect with them directly or view their full profiles to learn about their career trajectories.`
      }
      return `You can search and filter verified alumni by department, graduation year, current company, and technical skills in our Alumni Directory at \`/alumni\`.`
    }

    // 8. AI / Machine Learning / Data Science
    if (/\b(ai|artificial intelligence|machine learning|ml|deep learning|data science|nlp|llm)\b/i.test(qLower)) {
      return `For aspiring AI and Machine Learning Engineers, here is a progressive skill roadmap:

1. **Mathematical Foundations:** Linear algebra, multivariate calculus, probability distributions, and statistical hypothesis testing.
2. **Data Processing & ML Libraries:** Python, NumPy, Pandas, Scikit-learn for supervised/unsupervised learning pipelines.
3. **Deep Learning Frameworks:** PyTorch or TensorFlow for constructing neural networks, CNNs, and Transformer architectures.
4. **LLM Applications & RAG:** Embeddings, vector stores, prompt engineering, and Retrieval-Augmented Generation architectures.
5. **Production Deployment:** Serving models with FastAPI, containerizing inference endpoints, and monitoring model drift.`
    }

    // 9. General dynamic career guidance (no static canned mentor response)
    return `Here is structured career and technical advice tailored to your query regarding "${userQuery}":

1. **Core Technical Foundations:** Focus on mastering the key principles and primary programming tools in this domain before moving to advanced frameworks.
2. **Hands-On Projects:** Build and deploy end-to-end applications demonstrating clean code architecture, error handling, and automated test coverage.
3. **Portfolio & ATS Alignment:** Highlight quantifiable achievements in your resume and use our ATS Resume Analyzer to verify keyword coverage.
4. **Community Engagement:** Connect with alumni and peers in your target companies through the portal to ask for roadmap advice and informational interviews.

Explore our Job Readiness evaluator at \`/job-readiness\` or ATS Resume Analyzer at \`/resume-analyzer\` for further personalized insights.`
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
      const roleMatch = prompt.match(/Target Role:\s*([^\n\r]+)/i)
      const roleText = (roleMatch ? roleMatch[1] : lower).toLowerCase()

      const isFullStack = roleText.includes('full stack') || roleText.includes('fullstack')
      const isBackend = !isFullStack && roleText.includes('backend')
      const isDevOps = roleText.includes('devops')
      const isAI = !isFullStack && /\b(ai|artificial intelligence|machine learning|ml engineer|data scientist)\b/i.test(roleText)

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
      const roleMatch = prompt.match(/Target Role:\s*([^\n\r]+)/i)
      const roleText = (roleMatch ? roleMatch[1] : lower).toLowerCase()

      const isFullStack = roleText.includes('full stack') || roleText.includes('fullstack')
      const isBackend = !isFullStack && roleText.includes('backend')
      const targetRoleTitle = isFullStack ? 'Full Stack Developer' : (isBackend ? 'Backend Developer' : 'Frontend Developer')

      let roleStageTasks
      if (isFullStack) {
        roleStageTasks = [
          {
            stage: 'Foundations',
            stageOrder: 1,
            taskOrder: 1,
            title: 'Modern TypeScript & Full-Stack Data Contracts',
            description: 'Master strict typing across both client and server, sharing schema definitions with Zod.',
            skillFocus: 'TypeScript & Node.js',
            priority: 'high',
            estimatedDuration: '1 week',
            completionCriteria: ['Configure end-to-end type safety', 'Define API contracts with Zod validation', 'Eliminate untyped request/response boundaries'],
            learningActivity: 'Study end-to-end type safety patterns and schema validation',
            practiceProject: 'Build a typed API client and form validation pipeline',
          },
          {
            stage: 'Core Skills',
            stageOrder: 2,
            taskOrder: 1,
            title: 'Containerization, PostgreSQL Modeling & Caching',
            description: 'Dockerize a multi-container stack with Express, PostgreSQL, and Redis caching.',
            skillFocus: 'Docker & PostgreSQL',
            priority: 'high',
            estimatedDuration: '1-2 weeks',
            completionCriteria: ['Write optimized Dockerfile and docker-compose.yml', 'Implement relational schema with indexes', 'Add Redis caching layer with TTL invalidation'],
            learningActivity: 'Learn container networking, volumes, and relational query profiling',
            practiceProject: 'Containerize an end-to-end full stack web application',
          },
          {
            stage: 'Applied Projects',
            stageOrder: 3,
            taskOrder: 1,
            title: 'Full-Stack Distributed Web Application with CI/CD',
            description: 'Architect a production-grade full stack application with automated testing and continuous integration.',
            skillFocus: 'React, Node.js & CI/CD',
            priority: 'high',
            estimatedDuration: '2 weeks',
            completionCriteria: ['Set up GitHub Actions CI pipeline', 'Implement responsive UI with optimistic updates', 'Achieve >80% test coverage across client and server'],
            learningActivity: 'Study CI/CD workflows and automated end-to-end test suites',
            practiceProject: 'Deploy a full-stack platform with automated migrations and live health checks',
          },
          {
            stage: 'Interview Preparation',
            stageOrder: 4,
            taskOrder: 1,
            title: 'Full-Stack System Design & Architectural Trade-offs',
            description: 'Master system design: load balancing, database indexing, caching strategies, and API security.',
            skillFocus: 'System Design',
            priority: 'medium',
            estimatedDuration: '1-2 weeks',
            completionCriteria: ['Diagram scalable three-tier architecture', 'Evaluate SQL vs NoSQL trade-offs', 'Present architectural case study'],
            learningActivity: 'Practice system design interview questions and whiteboard architecture diagrams',
            practiceProject: 'Draft detailed system architecture RFC for high-traffic real-time application',
          },
          {
            stage: 'Job Application Readiness',
            stageOrder: 5,
            taskOrder: 1,
            title: 'Production Portfolio Verification & Alumni Mentorship',
            description: 'Deploy full-stack project with custom domain and schedule a mock interview with an alumni mentor.',
            skillFocus: 'Career Strategy',
            priority: 'medium',
            estimatedDuration: '1 week',
            completionCriteria: ['Publish live production demo with README architecture docs', 'Book 1-on-1 mock interview with an Alumni Mentor', 'Submit 3 tailored job applications'],
            learningActivity: 'Refine technical portfolio and ATS resume format',
            practiceProject: 'Publish live portfolio with demonstration links and GitHub repositories',
          },
        ]
      } else if (isBackend) {
        roleStageTasks = [
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
      ]
    } else {
      roleStageTasks = [
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
    }

      return {
        summary: `Tailored 5-stage career progression roadmap designed to elevate technical competencies for ${targetRoleTitle}.`,
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
