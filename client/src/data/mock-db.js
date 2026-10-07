export const institution = 'Vidyalankar Institute of Technology'

export const mockUsers = [
  {
    id: 'u001',
    name: 'Aarav Mehta',
    email: 'aarav.m@example.edu',
    avatarUrl: null,
    graduationYear: 2021,
    degree: 'B.Tech Computer Engineering',
    department: 'Computer Science',
    currentPosition: 'Senior Software Engineer',
    currentCompany: 'Microsoft',
    city: 'Hyderabad',
    country: 'India',
    industry: 'Technology',
    skills: [
      { id: 's1', name: 'React' },
      { id: 's2', name: 'TypeScript' },
      { id: 's3', name: 'Distributed Systems' }
    ],
    bio: 'Software engineer with 5+ years of experience building scalable enterprise applications. Passionate about system design and frontend performance. Always happy to mentor recent grads from Vidyalankar Institute of Technology!',
    verified: true,
    openToMentor: true,
    roles: ['ALUMNI'],
  },
  {
    id: 'u002',
    name: 'Neha Kapoor',
    email: 'neha.k@example.edu',
    avatarUrl: null,
    graduationYear: 2018,
    degree: 'MBA',
    department: 'Business Administration',
    currentPosition: 'Product Manager',
    currentCompany: 'Google',
    city: 'Bengaluru',
    country: 'India',
    industry: 'Technology',
    skills: [
      { id: 's4', name: 'Product Strategy' },
      { id: 's5', name: 'Agile' },
      { id: 's6', name: 'Data Analytics' }
    ],
    bio: 'Data-driven Product Manager specializing in developer tools and cloud infrastructure. Formerly an engineer, transitioned to PM to focus on user impact. Reach out if you want to chat about career transitions.',
    verified: true,
    openToMentor: true,
    roles: ['ALUMNI'],
  },
  {
    id: 'u003',
    name: 'Rahul Shah',
    email: 'rahul.s@example.edu',
    avatarUrl: null,
    graduationYear: 2023,
    degree: 'B.Tech Information Technology',
    department: 'Information Technology',
    currentPosition: 'Data Scientist',
    currentCompany: 'Flipkart',
    city: 'Bengaluru',
    country: 'India',
    industry: 'E-commerce',
    skills: [
      { id: 's7', name: 'Python' },
      { id: 's8', name: 'Machine Learning' },
      { id: 's9', name: 'SQL' }
    ],
    bio: 'Building recommendation systems and optimizing supply chain logistics. Enjoy participating in Kaggle competitions in my free time.',
    verified: true,
    openToMentor: false,
    roles: ['ALUMNI'],
  },
  {
    id: 'u004',
    name: 'Riya Shah',
    email: 'guest@example.com',
    avatarUrl: null,
    graduationYear: 2026,
    degree: 'B.Tech Computer Engineering',
    department: 'Computer Science',
    currentPosition: 'Student',
    currentCompany: 'Vidyalankar Institute of Technology',
    city: 'Mumbai',
    country: 'India',
    industry: 'Technology',
    skills: [
      { id: 's1', name: 'React' },
      { id: 's10', name: 'Node.js' }
    ],
    bio: 'Third-year student passionate about full-stack web development. Looking for summer internship opportunities!',
    verified: true,
    openToMentor: false,
    roles: ['STUDENT', 'ADMIN'],
  }
]

export const mockJobs = [
  {
    id: 'j001',
    title: 'Frontend Engineer',
    company: 'Atlassian',
    location: 'Bengaluru',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    experience: '2-4 years',
    salaryRange: '₹20L - ₹35L',
    skills: ['React', 'TypeScript', 'GraphQL'],
    description: 'Join our Jira Cloud team to build next-generation project management interfaces.',
    requirements: 'Strong understanding of React fundamentals and state management.',
    postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    deadline: new Date(Date.now() + 15 * 86400000).toISOString(),
    postedByAlumni: true,
    postedBy: 'u003'
  },
  {
    id: 'j002',
    title: 'Product Analyst',
    company: 'Deloitte',
    location: 'Mumbai',
    workMode: 'On-site',
    employmentType: 'Full-time',
    experience: 'Entry-level',
    salaryRange: '₹12L - ₹18L',
    skills: ['SQL', 'Tableau', 'Excel'],
    description: 'Work with cross-functional teams to drive product decisions using data insights.',
    requirements: 'Analytical mindset and ability to communicate complex data simply.',
    postedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
    postedByAlumni: false
  },
  {
    id: 'j003',
    title: 'Software Engineer II',
    company: 'Microsoft',
    location: 'Hyderabad',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    experience: '3+ years',
    salaryRange: '₹25L - ₹45L',
    skills: ['C#', 'Azure', 'Distributed Systems'],
    description: 'Building planetary-scale infrastructure for Azure Cosmos DB.',
    requirements: 'Experience with distributed systems and high-throughput backend services.',
    postedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    deadline: new Date(Date.now() + 10 * 86400000).toISOString(),
    postedByAlumni: true,
    postedBy: 'u001'
  }
]

export const mockEvents = [
  {
    id: 'e001',
    title: 'Annual Alumni Networking Night',
    description: 'Join hundreds of Vidyalankar Institute of Technology alumni for an evening of networking, dinner, and keynote speakers. Reconnect with old friends and expand your professional circle.',
    date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    time: '18:30:00',
    location: 'Taj Lands End, Mumbai',
    category: 'Networking',
    attendees: 312,
    capacity: 500,
    isVirtual: false,
    organizer: 'Vidyalankar Institute of Technology Alumni Association',
    speakers: ['Aarav Mehta', 'Neha Kapoor']
  },
  {
    id: 'e002',
    title: 'Career Talk: Transitioning to Product Management',
    description: 'A deep dive into the skills and mindset required to successfully transition from engineering to product management.',
    date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    time: '17:00:00',
    location: 'Zoom',
    category: 'Career Talk',
    attendees: 145,
    capacity: 500,
    isVirtual: true,
    organizer: 'Career Services',
    speakers: ['Neha Kapoor']
  }
]
