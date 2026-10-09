/**
 * Technical Skill Taxonomy & Role Benchmarks
 * Standardizes skill categorization, keyword detection, and role benchmarks.
 */

export const SKILL_CATEGORIES = {
  languages: {
    label: 'Programming Languages',
    skills: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Golang',
      'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL', 'HTML', 'CSS', 'Bash', 'Shell',
    ],
  },
  frameworks: {
    label: 'Frameworks & Libraries',
    skills: [
      'React', 'Next.js', 'Node.js', 'Express', 'Vue', 'Angular', 'Django',
      'Flask', 'FastAPI', 'Spring Boot', 'ASP.NET', 'Ruby on Rails', 'NestJS',
      'Tailwind CSS', 'Redux', 'GraphQL', 'REST API',
    ],
  },
  databases: {
    label: 'Databases & Storage',
    skills: [
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Elasticsearch',
      'Cassandra', 'DynamoDB', 'Oracle', 'Supabase', 'Firebase', 'Prisma',
    ],
  },
  cloudDevops: {
    label: 'Cloud & DevOps',
    skills: [
      'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'CI/CD',
      'GitHub Actions', 'Terraform', 'Linux', 'Nginx', 'Microservices',
      'Serverless', 'Kafka', 'RabbitMQ',
    ],
  },
  tools: {
    label: 'Developer Tools',
    skills: [
      'Git', 'GitHub', 'GitLab', 'Postman', 'Jest', 'Vitest', 'Cypress',
      'Webpack', 'Vite', 'Jira', 'Figma', 'System Design', 'Agile', 'Scrum',
    ],
  },
  aiData: {
    label: 'AI & Data Engineering',
    skills: [
      'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'Scikit-Learn',
      'Pandas', 'NumPy', 'Computer Vision', 'NLP', 'LLMs', 'Prompt Engineering',
      'Hugging Face', 'Data Analysis',
    ],
  },
  softSkills: {
    label: 'Soft Skills & Leadership',
    skills: [
      'Leadership', 'Problem Solving', 'Communication', 'Teamwork',
      'Mentorship', 'Project Management', 'Code Review', 'Cross-Functional Collaboration',
    ],
  },
}

export const ROLE_BENCHMARKS = {
  'backend developer': {
    title: 'Backend Developer',
    essentialSkills: ['Node.js', 'PostgreSQL', 'SQL', 'REST API', 'Git', 'System Design'],
    recommendedSkills: ['Docker', 'Redis', 'Microservices', 'CI/CD', 'Testing'],
    keywords: ['API', 'database', 'microservices', 'throughput', 'scalability', 'queries', 'authentication'],
  },
  'frontend developer': {
    title: 'Frontend Developer',
    essentialSkills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Git'],
    recommendedSkills: ['Next.js', 'Tailwind CSS', 'Redux', 'Responsive Design', 'Web Performance'],
    keywords: ['UI', 'component', 'responsive', 'accessibility', 'client-side', 'DOM', 'state management'],
  },
  'full stack developer': {
    title: 'Full Stack Developer',
    essentialSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Git'],
    recommendedSkills: ['Docker', 'REST API', 'Tailwind CSS', 'System Design', 'Redis'],
    keywords: ['end-to-end', 'fullstack', 'database', 'frontend', 'backend', 'deployment', 'REST'],
  },
  'devops engineer': {
    title: 'DevOps Engineer',
    essentialSkills: ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'AWS', 'Git'],
    recommendedSkills: ['Terraform', 'Bash', 'GitHub Actions', 'Nginx', 'Monitoring'],
    keywords: ['infrastructure', 'automation', 'pipelines', 'containerization', 'cloud', 'uptime', 'scaling'],
  },
  'ai engineer': {
    title: 'AI / Machine Learning Engineer',
    essentialSkills: ['Python', 'PyTorch', 'TensorFlow', 'Machine Learning', 'Git'],
    recommendedSkills: ['Pandas', 'NumPy', 'Deep Learning', 'NLP', 'Docker', 'LLMs'],
    keywords: ['model', 'training', 'datasets', 'neural networks', 'inference', 'embeddings', 'tuning'],
  },
  'data analyst': {
    title: 'Data Analyst',
    essentialSkills: ['SQL', 'Python', 'Data Analysis', 'Pandas', 'Excel', 'Problem Solving'],
    recommendedSkills: ['Tableau', 'Power BI', 'NumPy', 'Communication', 'Statistics'],
    keywords: ['metrics', 'visualization', 'reporting', 'analytics', 'insights', 'dashboards', 'queries'],
  },
  'mobile developer': {
    title: 'Mobile Developer',
    essentialSkills: ['JavaScript', 'React Native', 'Swift', 'Kotlin', 'Git'],
    recommendedSkills: ['Flutter', 'iOS', 'Android', 'REST API', 'Firebase'],
    keywords: ['mobile', 'app', 'ios', 'android', 'react native', 'screens', 'offline-first'],
  },
  'software engineer': {
    title: 'Software Engineer',
    essentialSkills: ['Data Structures', 'Git', 'System Design', 'SQL', 'Algorithms'],
    recommendedSkills: ['Testing', 'Clean Code', 'CI/CD', 'Docker', 'Problem Solving'],
    keywords: ['architecture', 'performance', 'optimization', 'refactoring', 'scale', 'maintainability'],
  },
}

/**
 * Normalizes text for regex searches
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extracts recognized skills from arbitrary text
 */
export function detectSkillsFromText(text = '') {
  const content = String(text)
  const detected = {
    languages: [],
    frameworks: [],
    databases: [],
    cloudDevops: [],
    tools: [],
    aiData: [],
    softSkills: [],
    all: [],
  }

  const seen = new Set()

  for (const [catKey, catInfo] of Object.entries(SKILL_CATEGORIES)) {
    for (const skill of catInfo.skills) {
      // Special case handling for short acronyms like C, C++, Go, R, etc.
      let pattern
      if (skill === 'C++') {
        pattern = /(?:^|\W)c\+\+(?:$|\W)/i
      } else if (skill === 'C#') {
        pattern = /(?:^|\W)c#(?:$|\W)/i
      } else if (skill === 'Go' || skill === 'Golang') {
        pattern = /(?:^|\W)(?:golang|go\s+programming|go\s+lang)(?:$|\W)/i
      } else if (skill === 'SQL') {
        pattern = /(?:^|\W)sql(?:\b|$|\W)/i
      } else if (skill === 'R') {
        pattern = /(?:^|\W)r\s+programming(?:$|\W)/i
      } else {
        pattern = new RegExp(`(?:^|\\W)${escapeRegex(skill)}(?:$|\\W)`, 'i')
      }

      if (pattern.test(content)) {
        if (!seen.has(skill.toLowerCase())) {
          seen.add(skill.toLowerCase())
          detected[catKey].push(skill)
          detected.all.push(skill)
        }
      }
    }
  }

  return detected
}

/**
 * Infers a target role if user did not provide one
 */
export function inferRoleFromResume(text = '', detectedSkills = []) {
  const lower = String(text).toLowerCase()
  const skillList = Array.isArray(detectedSkills) ? detectedSkills : []
  const skillSet = new Set(skillList.map((s) => s.toLowerCase()))

  // Check explicit title hints in resume
  if (/full[\s-]stack\s+(?:developer|engineer)/i.test(lower)) return 'Full Stack Developer'
  if (/backend\s+(?:developer|engineer)/i.test(lower)) return 'Backend Developer'
  if (/frontend\s+(?:developer|engineer)/i.test(lower)) return 'Frontend Developer'
  if (/devops\s+engineer|cloud\s+engineer|site\s+reliability/i.test(lower)) return 'DevOps Engineer'
  if (/(?:machine\s+learning|ai|data\s+scientist)\s+engineer/i.test(lower)) return 'AI / Machine Learning Engineer'

  // Infer based on skill cluster density
  let backendScore = 0
  let frontendScore = 0
  let devopsScore = 0
  let aiScore = 0

  if (skillSet.has('react') || skillSet.has('vue') || skillSet.has('angular') || skillSet.has('html') || skillSet.has('css')) {
    frontendScore += 2
  }
  if (skillSet.has('node.js') || skillSet.has('express') || skillSet.has('postgresql') || skillSet.has('mysql') || skillSet.has('rest api')) {
    backendScore += 2
  }
  if (skillSet.has('docker') || skillSet.has('kubernetes') || skillSet.has('aws') || skillSet.has('ci/cd') || skillSet.has('terraform')) {
    devopsScore += 2
  }
  if (skillSet.has('python') || skillSet.has('pytorch') || skillSet.has('tensorflow') || skillSet.has('pandas') || skillSet.has('machine learning')) {
    aiScore += 2
  }

  if (frontendScore > 0 && backendScore > 0) return 'Full Stack Developer'
  if (frontendScore > backendScore && frontendScore > devopsScore && frontendScore > aiScore) return 'Frontend Developer'
  if (backendScore > devopsScore && backendScore > aiScore) return 'Backend Developer'
  if (devopsScore > aiScore && devopsScore > 1) return 'DevOps Engineer'
  if (aiScore > 1) return 'AI / Machine Learning Engineer'

  return 'Software Engineer'
}

/**
 * Returns role benchmark data for a given role title
 */
export function getRoleBenchmark(roleTitle = 'Software Engineer') {
  const cleanTitle = String(roleTitle || '').toLowerCase().trim()

  for (const [key, data] of Object.entries(ROLE_BENCHMARKS)) {
    if (cleanTitle.includes(key) || key.includes(cleanTitle)) {
      return data
    }
  }

  return ROLE_BENCHMARKS['software engineer']
}
