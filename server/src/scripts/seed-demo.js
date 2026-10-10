/**
 * Comprehensive Idempotent Demo Seeder for Alumni Network Portal.
 * Creates realistic demonstration users, alumni profiles, student profiles,
 * faculty/professors, jobs, applications, events, RSVPs, mentorship relationships,
 * connections, conversations, messages, notifications, and donations.
 *
 * Usage:
 *   npm run db:seed:demo
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import config from '../config/env.js'
import { closePool, withTransaction } from '../config/database.js'
import { ensureDevDatabase } from '../config/devDbAutoStart.js'
import logger from '../utils/logger.js'

export const DEMO_PASSWORD = 'Demo@Portal2026!'

// Required Core Demo Personas (from Specification)
export const CORE_DEMO_ACCOUNTS = [
  { role: 'ADMIN', email: 'admin.demo@alumniportal.test', firstName: 'Portal', lastName: 'Administrator', title: 'System Administrator' },
  { role: 'ALUMNI', email: 'alumni.demo@alumniportal.test', firstName: 'Aarav', lastName: 'Mehta', title: 'Sr. Software Engineer', company: 'Microsoft', grad: 2020, major: 'Computer Engineering', city: 'Mumbai', country: 'India' },
  { role: 'ALUMNI', email: 'priya.demo@alumniportal.test', firstName: 'Priya', lastName: 'Sharma', title: 'Lead Data Scientist', company: 'Google', grad: 2019, major: 'Information Technology', city: 'Bengaluru', country: 'India' },
  { role: 'ALUMNI', email: 'rohan.demo@alumniportal.test', firstName: 'Rohan', lastName: 'Desai', title: 'Principal Cloud Architect', company: 'AWS', grad: 2017, major: 'Computer Engineering', city: 'Seattle', country: 'United States' },
  { role: 'ALUMNI', email: 'neha.demo@alumniportal.test', firstName: 'Neha', lastName: 'Kulkarni', title: 'Security Operations Lead', company: 'CrowdStrike', grad: 2018, major: 'Cybersecurity', city: 'Pune', country: 'India' },
  { role: 'ALUMNI', email: 'kavya.demo@alumniportal.test', firstName: 'Kavya', lastName: 'Nair', title: 'Group Product Manager', company: 'Stripe', grad: 2016, major: 'Electronics & Telecom', city: 'San Francisco', country: 'United States' },
  { role: 'STUDENT', email: 'student.demo@alumniportal.test', firstName: 'Atharva', lastName: 'Patil', year: 3, major: 'Computer Engineering', studentId: 'STU-2023-0101' },
  { role: 'STUDENT', email: 'isha.demo@alumniportal.test', firstName: 'Isha', lastName: 'Shah', year: 4, major: 'Data Science & AI', studentId: 'STU-2022-0145' },
  { role: 'STUDENT', email: 'rahul.demo@alumniportal.test', firstName: 'Rahul', lastName: 'Joshi', year: 2, major: 'Information Technology', studentId: 'STU-2024-0089' },
  { role: 'STUDENT', email: 'sneha.demo@alumniportal.test', firstName: 'Sneha', lastName: 'Rao', year: 3, major: 'Cybersecurity', studentId: 'STU-2023-0210' },
]

// Additional Diverse Alumni Profiles (15+ Total Alumni)
export const ADDITIONAL_ALUMNI = [
  { firstName: 'Aditya', lastName: 'Joshi', email: 'aditya.joshi@alumni.test', title: 'Staff Product Designer', company: 'Figma', grad: 2019, major: 'Computer Engineering', industry: 'Design & Software', city: 'San Francisco', country: 'United States' },
  { firstName: 'Tanvi', lastName: 'Merchant', email: 'tanvi.merchant@alumni.test', title: 'Founder & CEO', company: 'Novasphere Labs', grad: 2015, major: 'Computer Science', industry: 'Venture & AI', city: 'Bengaluru', country: 'India' },
  { firstName: 'Sameer', lastName: 'Sen', email: 'sameer.sen@alumni.test', title: 'VP Quantitative Trading', company: 'Goldman Sachs', grad: 2016, major: 'Mathematics & Computing', industry: 'Finance', city: 'London', country: 'United Kingdom' },
  { firstName: 'Pooja', lastName: 'Hegde', email: 'pooja.hegde@alumni.test', title: 'Senior Robotics Engineer', company: 'Boston Dynamics', grad: 2018, major: 'Mechanical Engineering', industry: 'Robotics', city: 'Boston', country: 'United States' },
  { firstName: 'Karan', lastName: 'Bhatt', email: 'karan.bhatt@alumni.test', title: 'Hardware Systems Engineer', company: 'Apple', grad: 2017, major: 'Electronics Engineering', industry: 'Hardware', city: 'Cupertino', country: 'United States' },
  { firstName: 'Dr. Ananya', lastName: 'Roy', email: 'ananya.roy@alumni.test', title: 'AI Research Scientist', company: 'OpenAI', grad: 2014, major: 'Computer Science', industry: 'Artificial Intelligence', city: 'San Francisco', country: 'United States' },
  { firstName: 'Meera', lastName: 'Kapoor', email: 'meera.kapoor@alumni.test', title: 'Global Tech Talent Director', company: 'Meta', grad: 2015, major: 'Human Resources & IT', industry: 'Talent Acquisition', city: 'Singapore', country: 'Singapore' },
  { firstName: 'Varun', lastName: 'Singhal', email: 'varun.singhal@alumni.test', title: 'Staff Site Reliability Engineer', company: 'Netflix', grad: 2017, major: 'Information Technology', industry: 'Cloud & Infrastructure', city: 'Los Gatos', country: 'United States' },
  { firstName: 'Siddharth', lastName: 'Rao', email: 'siddharth.rao@alumni.test', title: 'Full Stack Engineering Lead', company: 'Vercel', grad: 2021, major: 'Computer Engineering', industry: 'Web Platform', city: 'Remote', country: 'India' },
  { firstName: 'Divya', lastName: 'Swaminathan', email: 'divya.swami@alumni.test', title: 'Staff Mobile Engineer (iOS)', company: 'Uber', grad: 2018, major: 'Software Engineering', industry: 'Transportation Tech', city: 'Bengaluru', country: 'India' },
]

// Faculty / Professor Profiles (Specification Step 3)
export const FACULTY_PROFILES = [
  {
    firstName: 'Dr. Rajesh', lastName: 'Kulkarni', email: 'prof.kulkarni@alumniportal.test',
    department: 'Computer Science & Engineering', designation: 'Professor & Head of Department',
    degree: 'Ph.D. Computer Science (IIT Bombay)', bio: 'Specialist in Distributed Systems, Cloud Architecture, and Fault Tolerant Protocols. Advises undergraduate research projects.',
    officeLocation: 'Academic Block 4, Room 402', officeHours: 'Tuesdays & Thursdays, 2:00 PM – 4:30 PM',
  },
  {
    firstName: 'Prof. Sunita', lastName: 'Verma', email: 'prof.verma@alumniportal.test',
    department: 'Information Technology', designation: 'Associate Professor & Placement Liaison',
    degree: 'Ph.D. Information Technology (IISc Bangalore)', bio: 'Expertise in Machine Learning, NLP, and Explainable AI. Coordinates industry relations and student career mentorship.',
    officeLocation: 'IT Annex, Room 210', officeHours: 'Mondays & Wednesdays, 11:00 AM – 1:00 PM',
  },
  {
    firstName: 'Dr. Amit', lastName: 'Sharma', email: 'prof.sharma@alumniportal.test',
    department: 'Electronics & Telecommunication', designation: 'Professor & Dean of Research',
    degree: 'Ph.D. Electrical Engineering (IIT Madras)', bio: 'Research interests in Embedded IoT, Edge Computing, and Signal Processing. Faculty mentor for competitive hackathons.',
    officeLocation: 'Telecom Block, Room 301', officeHours: 'Fridays, 10:00 AM – 12:30 PM',
  },
  {
    firstName: 'Prof. Ananya', lastName: 'Deshmukh', email: 'prof.deshmukh@alumniportal.test',
    department: 'Computer Engineering', designation: 'Assistant Professor & Security Lab In-charge',
    degree: 'M.Tech Computer Engineering (IIT Delhi)', bio: 'Specializes in Applied Cryptography, Cyber Defense, and Secure Coding standards. Oversees student cybersecurity club.',
    officeLocation: 'Cyber Defense Lab 2, Room 104', officeHours: 'Wednesdays, 3:00 PM – 5:00 PM',
  },
  {
    firstName: 'Dr. Venkatesh', lastName: 'Iyer', email: 'prof.iyer@alumniportal.test',
    department: 'Applied Mathematics & Computing', designation: 'Senior Professor & Dean of Academics',
    degree: 'Ph.D. Applied Mathematics (TIFR Mumbai)', bio: 'Conducts research in Algorithms, Graph Theory, and High-Performance Scientific Computing.',
    officeLocation: 'Dean Office, Main Administrative Building', officeHours: 'Daily by appointment',
  },
]

export async function seedDemoData() {
  if (config.isProduction) {
    throw new Error('Refusing to seed demo data in PRODUCTION environment!')
  }

  await ensureDevDatabase()
  logger.info('Starting idempotent demo environment population...')
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const userMap = new Map() // email -> userId

  await withTransaction(async (client) => {
    // 1. Ensure Roles Exist
    const rolesToEnsure = ['ADMIN', 'ALUMNI', 'STUDENT', 'PROFESSOR', 'FACULTY', 'MODERATOR']
    for (const role of rolesToEnsure) {
      await client.query(
        `INSERT INTO roles (name, description) VALUES ($1, $2)
         ON CONFLICT (LOWER(name)) DO NOTHING`,
        [role, `${role} role for Alumni Network Portal`],
      )
    }

    // Helper to upsert user
    async function upsertUser({ email, firstName, lastName, role }) {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active, is_suspended)
         VALUES (LOWER($1), $2, $3, $4, TRUE, TRUE, FALSE)
         ON CONFLICT (LOWER(email)) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               is_email_verified = TRUE,
               is_active = TRUE,
               is_suspended = FALSE
         RETURNING id`,
        [email, passwordHash, firstName, lastName],
      )
      const userId = rows[0].id
      userMap.set(email.toLowerCase(), userId)

      // Assign primary role
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)
         ON CONFLICT DO NOTHING`,
        [userId, role],
      )

      // Privacy and notification defaults conforming to schema
      await client.query(
        `INSERT INTO privacy_settings (user_id, show_email, show_phone, show_location, show_employer, show_social_links, show_profile_in_directory, show_mentorship_availability, allow_connection_requests, allow_messages_from)
         VALUES ($1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'everyone')
         ON CONFLICT (user_id) DO UPDATE SET allow_messages_from = 'everyone', allow_connection_requests = TRUE`,
        [userId],
      )
      await client.query(
        `INSERT INTO notification_preferences (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      )
      return userId
    }

    // 2. Seed Core Demo Accounts
    for (const acc of CORE_DEMO_ACCOUNTS) {
      const userId = await upsertUser(acc)
      if (acc.role === 'ALUMNI') {
        await client.query(
          `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department, major, current_company, current_position, job_title, city, country, location, is_open_to_mentor, mentorship_capacity, verification_status, bio)
           VALUES ($1, $2, $3, $4, $4, $5, $6, $6, $7, $8, $9, TRUE, 3, 'verified', $10)
           ON CONFLICT (user_id) DO UPDATE
             SET graduation_year = EXCLUDED.graduation_year,
                 current_company = EXCLUDED.current_company,
                 job_title = EXCLUDED.job_title,
                 is_open_to_mentor = TRUE,
                 verification_status = 'verified'`,
          [userId, acc.grad, 'B.Tech', acc.major, acc.company, acc.title, acc.city, acc.country, `${acc.city}, ${acc.country}`, `Experienced ${acc.title} at ${acc.company}. Open to mentoring juniors and helping with resume reviews.`],
        )
      } else if (acc.role === 'STUDENT') {
        await client.query(
          `INSERT INTO student_profiles (user_id, degree, department, major, year_of_study, student_id_number, verification_status, career_interests, is_open_to_mentorship)
           VALUES ($1, 'B.Tech', $2, $2, $3, $4, 'verified', 'Software Engineering, Full Stack, Cloud, Distributed Systems', TRUE)
           ON CONFLICT (user_id) DO UPDATE
             SET year_of_study = EXCLUDED.year_of_study,
                 verification_status = 'verified'`,
          [userId, acc.major, acc.year, acc.studentId],
        )
      }
    }

    // 3. Seed Additional Alumni Profiles (15+ total alumni)
    for (const acc of ADDITIONAL_ALUMNI) {
      const userId = await upsertUser({ ...acc, role: 'ALUMNI' })
      await client.query(
        `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department, major, current_company, current_position, job_title, industry, city, country, location, is_open_to_mentor, mentorship_capacity, verification_status, bio)
         VALUES ($1, $2, 'B.Tech / M.Tech', $3, $3, $4, $5, $5, $6, $7, $8, $9, TRUE, 2, 'verified', $10)
         ON CONFLICT (user_id) DO UPDATE
           SET current_company = EXCLUDED.current_company,
               job_title = EXCLUDED.job_title,
               industry = EXCLUDED.industry,
               verification_status = 'verified'`,
        [userId, acc.grad, acc.major, acc.company, acc.title, acc.industry, acc.city, acc.country, `${acc.city}, ${acc.country}`, `Experienced professional in ${acc.industry} working at ${acc.company}. Enthusiastic about giving back to students.`],
      )
    }

    // 4. Seed Faculty / Professors
    for (const prof of FACULTY_PROFILES) {
      const userId = await upsertUser({ ...prof, role: 'PROFESSOR' })
      await client.query(
        `INSERT INTO alumni_profiles (user_id, degree, department, major, current_position, job_title, current_company, is_open_to_mentor, mentorship_capacity, verification_status, bio)
         VALUES ($1, $2, $3, $3, $4, $4, 'Vidyalankar Institute of Technology', TRUE, 5, 'verified', $5)
         ON CONFLICT (user_id) DO UPDATE
           SET department = EXCLUDED.department,
               job_title = EXCLUDED.job_title,
               current_position = EXCLUDED.current_position,
               bio = EXCLUDED.bio,
               verification_status = 'verified'`,
        [userId, prof.degree, prof.department, prof.designation, `${prof.bio} Office: ${prof.officeLocation} (${prof.officeHours})`],
      )
    }

    // 5. Seed Skills & Map to Users
    const skillsList = [
      'JavaScript', 'TypeScript', 'React.js', 'Node.js', 'Python', 'PostgreSQL',
      'Docker', 'Kubernetes', 'Amazon Web Services', 'Distributed Systems',
      'Machine Learning', 'Data Structures & Algorithms', 'Cybersecurity', 'System Design', 'Product Management',
    ]
    const skillIds = []
    for (const skill of skillsList) {
      const existing = await client.query('SELECT id FROM skills WHERE LOWER(name) = LOWER($1)', [skill])
      let sid
      if (existing.rows.length > 0) {
        sid = existing.rows[0].id
      } else {
        const { rows } = await client.query(
          `INSERT INTO skills (name, category) VALUES ($1, 'Engineering') RETURNING id`,
          [skill],
        )
        sid = rows[0].id
      }
      skillIds.push(sid)
    }

    // Assign skills to Aarav, Priya, Rohan, Atharva
    const aaravId = userMap.get('alumni.demo@alumniportal.test')
    const priyaId = userMap.get('priya.demo@alumniportal.test')
    const atharvaId = userMap.get('student.demo@alumniportal.test')
    const adminId = userMap.get('admin.demo@alumniportal.test')
    const ishaId = userMap.get('isha.demo@alumniportal.test')
    const rohanId = userMap.get('rohan.demo@alumniportal.test')
    const nehaId = userMap.get('neha.demo@alumniportal.test')
    const rahulId = userMap.get('rahul.demo@alumniportal.test')
    const snehaId = userMap.get('sneha.demo@alumniportal.test')

    for (let i = 0; i < 5; i++) {
      if (aaravId && skillIds[i]) {
        await client.query(`INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1, $2, 'expert') ON CONFLICT DO NOTHING`, [aaravId, skillIds[i]])
      }
      if (priyaId && skillIds[i + 5]) {
        await client.query(`INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1, $2, 'expert') ON CONFLICT DO NOTHING`, [priyaId, skillIds[i + 5]])
      }
      if (atharvaId && skillIds[i]) {
        await client.query(`INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1, $2, 'intermediate') ON CONFLICT DO NOTHING`, [atharvaId, skillIds[i]])
      }
    }

    // 6. Seed Connections (safe symmetric check)
    async function ensureConnection(reqId, addId, status = 'accepted') {
      if (!reqId || !addId) return
      const { rows } = await client.query(
        `SELECT id FROM connections
         WHERE LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
           AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`,
        [reqId, addId],
      )
      if (rows.length === 0) {
        await client.query(
          `INSERT INTO connections (requester_id, addressee_id, status, responded_at)
           VALUES ($1, $2, $3, $4)`,
          [reqId, addId, status, status === 'accepted' ? new Date() : null],
        )
      }
    }

    await ensureConnection(atharvaId, aaravId, 'accepted')
    await ensureConnection(ishaId, priyaId, 'accepted')
    await ensureConnection(rahulId, rohanId, 'accepted')
    await ensureConnection(snehaId, nehaId, 'pending')

    // 7. Seed Mentorship Requests & Relationships
    if (atharvaId && aaravId) {
      const { rows: reqRows } = await client.query(
        `INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, message, preferred_mode, status, responded_at)
         VALUES ($1, $2, 'Prepare for technical interviews and build portfolio projects', 'Distributed Systems', 'Seeking mentorship for backend software engineering roles.', 'chat', 'accepted', NOW())
         ON CONFLICT (mentor_id, mentee_id) DO UPDATE
           SET career_goal = EXCLUDED.career_goal, status = EXCLUDED.status
         RETURNING id`,
        [aaravId, atharvaId],
      )
      const requestId = reqRows[0]?.id
      if (requestId) {
        await client.query(
          `INSERT INTO mentorship_relationships (request_id, mentor_id, mentee_id, status, started_at)
           VALUES ($1, $2, $3, 'active', NOW() - INTERVAL '14 days')
           ON CONFLICT (request_id) DO NOTHING`,
          [requestId, aaravId, atharvaId],
        )
      }
    }

    if (ishaId && priyaId) {
      const { rows: reqRows } = await client.query(
        `INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, message, preferred_mode, status, responded_at)
         VALUES ($1, $2, 'Publish AI papers and prepare for industry data science interviews', 'Machine Learning & NLP', 'Focusing on Applied Machine Learning pipelines and research.', 'video', 'accepted', NOW())
         ON CONFLICT (mentor_id, mentee_id) DO UPDATE
           SET career_goal = EXCLUDED.career_goal, status = EXCLUDED.status
         RETURNING id`,
        [priyaId, ishaId],
      )
      const requestId = reqRows[0]?.id
      if (requestId) {
        await client.query(
          `INSERT INTO mentorship_relationships (request_id, mentor_id, mentee_id, status, started_at)
           VALUES ($1, $2, $3, 'active', NOW() - INTERVAL '7 days')
           ON CONFLICT (request_id) DO NOTHING`,
          [requestId, priyaId, ishaId],
        )
      }
    }

    if (snehaId && nehaId) {
      await client.query(
        `INSERT INTO mentorship_requests (mentor_id, mentee_id, career_goal, area_of_interest, message, preferred_mode, status)
         VALUES ($1, $2, 'Guidance on OSCP certification and security operations', 'Cybersecurity', 'Interested in learning Threat Intelligence and SOC practices.', 'chat', 'pending')
         ON CONFLICT (mentor_id, mentee_id) DO UPDATE
           SET career_goal = EXCLUDED.career_goal, status = EXCLUDED.status`,
        [nehaId, snehaId],
      )
    }

    // 8. Seed Realistic Jobs (10-15 Listings conforming to constraints)
    const demoJobs = [
      {
        posterId: aaravId || adminId,
        title: 'Senior Software Engineer (Distributed Systems)',
        company: 'Microsoft',
        location: 'Mumbai, Maharashtra',
        workMode: 'hybrid',
        type: 'full_time',
        experience: 'mid',
        industry: 'Cloud & Enterprise',
        description: 'Build high-throughput, low-latency microservices powering Azure cloud storage. Looking for strong proficiency in C#/.NET or Go, distributed consensus, and containerized deployments.',
        status: 'published',
      },
      {
        posterId: priyaId || adminId,
        title: 'Machine Learning Research Intern (Summer 2026)',
        company: 'Google',
        location: 'Bengaluru, Karnataka',
        workMode: 'onsite',
        type: 'internship',
        experience: 'entry',
        industry: 'Artificial Intelligence',
        description: 'Join Google Research India working on multilingual large language models, evaluation frameworks, and efficient inference on edge devices. Python and PyTorch proficiency required.',
        status: 'published',
      },
      {
        posterId: rohanId || adminId,
        title: 'Cloud Infrastructure Engineer',
        company: 'Amazon Web Services',
        location: 'Hyderabad, Telangana',
        workMode: 'hybrid',
        type: 'full_time',
        experience: 'mid',
        industry: 'Cloud Computing',
        description: 'Help architect next-generation VPC routing and serverless compute primitives. Experience with Linux systems programming, Terraform, and AWS CDK is highly valued.',
        status: 'published',
      },
      {
        posterId: nehaId || adminId,
        title: 'Application Security Specialist',
        company: 'CrowdStrike',
        location: 'Pune, Maharashtra',
        workMode: 'hybrid',
        type: 'full_time',
        experience: 'senior',
        industry: 'Cybersecurity',
        description: 'Perform static and dynamic application security testing (SAST/DAST), code reviews, and threat modeling for endpoint telemetry agents.',
        status: 'published',
      },
      {
        posterId: userMap.get('kavya.demo@alumniportal.test') || adminId,
        title: 'Associate Product Manager',
        company: 'Stripe',
        location: 'Bengaluru / Remote',
        workMode: 'remote',
        type: 'full_time',
        experience: 'entry',
        industry: 'FinTech',
        description: 'Lead merchant onboarding and developer experience initiatives for Stripe Connect. Strong analytical thinking and cross-functional leadership required.',
        status: 'published',
      },
      {
        posterId: userMap.get('tanvi.merchant@alumni.test') || adminId,
        title: 'Full Stack Engineer (Founding Team)',
        company: 'Novasphere Labs',
        location: 'Bengaluru, Karnataka',
        workMode: 'onsite',
        type: 'full_time',
        experience: 'mid',
        industry: 'Artificial Intelligence',
        description: 'Early engineer role building generative AI workflow automations using React, Node.js, and PostgreSQL. Equity grant included.',
        status: 'published',
      },
      {
        posterId: userMap.get('sameer.sen@alumni.test') || adminId,
        title: 'Quantitative Research Analyst',
        company: 'Goldman Sachs',
        location: 'Mumbai, Maharashtra',
        workMode: 'onsite',
        type: 'full_time',
        experience: 'entry',
        industry: 'Investment Banking',
        description: 'Develop mathematical models for derivatives pricing and algorithmic risk management. Strong skills in Python, C++, and probability theory.',
        status: 'published',
      },
      {
        posterId: adminId,
        title: 'Cybersecurity Analyst (Junior)',
        company: 'Tata Consultancy Services',
        location: 'Mumbai, Maharashtra',
        workMode: 'onsite',
        type: 'full_time',
        experience: 'entry',
        industry: 'Information Technology',
        description: 'Entry-level position for 2026 graduates interested in incident response and vulnerability scanning.',
        status: 'published',
      },
      {
        posterId: userMap.get('aditya.joshi@alumni.test') || adminId,
        title: 'Product Design Fellow',
        company: 'Figma',
        location: 'Remote',
        workMode: 'remote',
        type: 'internship',
        experience: 'entry',
        industry: 'Design & Software',
        description: 'Six-month fellowship working on collaborative canvas tools and design systems. Portfolio submission required.',
        status: 'pending_review',
      },
      {
        posterId: userMap.get('varun.singhal@alumni.test') || adminId,
        title: 'Staff Site Reliability Engineer',
        company: 'Netflix',
        location: 'Los Gatos, CA / Remote',
        workMode: 'remote',
        type: 'full_time',
        experience: 'senior',
        industry: 'Media & Streaming',
        description: 'Ensure 99.999% availability for Netflix edge proxies and video delivery microservices. Deep Linux kernel and eBPF knowledge.',
        status: 'published',
      },
      {
        posterId: userMap.get('divya.swami@alumni.test') || adminId,
        title: 'Mobile Engineer (iOS / Swift)',
        company: 'Uber',
        location: 'Bengaluru, Karnataka',
        workMode: 'hybrid',
        type: 'full_time',
        experience: 'mid',
        industry: 'Rider Platform',
        description: 'Scale high-frequency location streaming and real-time navigation inside the flagship rider application.',
        status: 'published',
      },
      {
        posterId: adminId,
        title: 'Data Science Intern (NLP)',
        company: 'Novasphere Labs',
        location: 'Remote',
        workMode: 'remote',
        type: 'internship',
        experience: 'entry',
        industry: 'Artificial Intelligence',
        description: 'Hands-on internship working with fine-tuned transformer architectures and vector indexing.',
        status: 'published',
      },
    ]

    const createdJobIds = []
    for (const j of demoJobs) {
      const isPublished = j.status === 'published'
      const existing = await client.query('SELECT id FROM jobs WHERE posted_by = $1 AND title = $2', [j.posterId, j.title])
      if (existing.rows.length > 0) {
        createdJobIds.push(existing.rows[0].id)
      } else {
        const { rows } = await client.query(
          `INSERT INTO jobs (posted_by, company_name, title, description, location, work_mode, employment_type, experience_level, status, deadline, published_at, moderated_by, moderated_at, industry)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE + 45, $10, $11, $12, $13)
           RETURNING id`,
          [
            j.posterId, j.company, j.title, j.description, j.location,
            j.workMode, j.type, j.experience, j.status,
            isPublished ? new Date() : null,
            isPublished ? adminId : null,
            isPublished ? new Date() : null,
            j.industry,
          ],
        )
        createdJobIds.push(rows[0].id)
      }
    }

    // 9. Seed Job Applications (conforming to applications_has_attachment constraint)
    if (atharvaId && createdJobIds[0]) {
      await client.query(
        `INSERT INTO job_applications (job_id, applicant_id, status, cover_letter, resume_url, reviewed_by, reviewed_at)
         VALUES ($1, $2, 'under_review', 'Excited about the Distributed Systems opening at Microsoft. My capstone project focuses on consensus protocols.', 'https://storage.alumniportal.test/resumes/atharva-patil.pdf', $3, NOW())
         ON CONFLICT (job_id, applicant_id) DO UPDATE SET status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by`,
        [createdJobIds[0], atharvaId, adminId],
      )
    }
    if (ishaId && createdJobIds[1]) {
      await client.query(
        `INSERT INTO job_applications (job_id, applicant_id, status, cover_letter, resume_url, reviewed_by, reviewed_at)
         VALUES ($1, $2, 'shortlisted', 'Applying for the Google Research Intern position. I have published research in multilingual NLP benchmarks.', 'https://storage.alumniportal.test/resumes/isha-shah.pdf', $3, NOW())
         ON CONFLICT (job_id, applicant_id) DO UPDATE SET status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by`,
        [createdJobIds[1], ishaId, adminId],
      )
    }
    if (rahulId && createdJobIds[2]) {
      await client.query(
        `INSERT INTO job_applications (job_id, applicant_id, status, cover_letter, resume_url, reviewed_by, reviewed_at)
         VALUES ($1, $2, 'accepted', 'Thrilled to apply for the AWS Cloud Infrastructure position.', 'https://storage.alumniportal.test/resumes/rahul-joshi.pdf', $3, NOW())
         ON CONFLICT (job_id, applicant_id) DO UPDATE SET status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by`,
        [createdJobIds[2], rahulId, adminId],
      )
    }
    if (snehaId && createdJobIds[3]) {
      await client.query(
        `INSERT INTO job_applications (job_id, applicant_id, status, cover_letter, resume_url)
         VALUES ($1, $2, 'submitted', 'Applying for the Application Security position.', 'https://storage.alumniportal.test/resumes/sneha-rao.pdf')
         ON CONFLICT (job_id, applicant_id) DO UPDATE SET status = EXCLUDED.status`,
        [createdJobIds[3], snehaId],
      )
    }

    // 10. Seed Events & RSVPs (conforming to events constraints)
    const demoEvents = [
      {
        title: 'Annual Alumni Homecoming & Grand Dinner 2026',
        description: 'Reunite with professors, batchmates, and current students on campus. Keynote address by distinguished alumni followed by networking dinner.',
        venue: 'Auditorium & Quadrangle, Campus Hub',
        virtualUrl: null,
        daysFromNow: 25,
      },
      {
        title: 'Masterclass: Distributed Systems & Microservices at Hyperscale',
        description: 'Interactive architecture walkthrough by Aarav Mehta (Microsoft) on handling 1M+ requests per second with high availability.',
        venue: null,
        virtualUrl: 'https://teams.microsoft.com/meet/vit-distributed-systems',
        daysFromNow: 10,
      },
      {
        title: 'Campus Tech Placements & Internship Fair 2026',
        description: 'Top recruiters and alumni-led startups interviewing final year students and evaluating pre-final year interns.',
        venue: 'Main Placement Hub, Academic Block 2',
        virtualUrl: null,
        daysFromNow: 40,
      },
      {
        title: 'Women in Technology Leadership Panel',
        description: 'Inspiring keynote and panel discussion featuring Priya Sharma (Google), Kavya Nair (Stripe), and Neha Kulkarni (CrowdStrike).',
        venue: 'Seminar Hall 1',
        virtualUrl: 'https://youtube.com/live/vit-women-in-tech',
        daysFromNow: 18,
      },
      {
        title: 'Technical Mock Interview & Resume Diagnostic Clinic',
        description: 'One-on-one resume reviews, live coding walkthroughs, and behavioral interview coaching conducted by verified alumni mentors.',
        venue: 'Computer Engineering Department, Lab 304',
        virtualUrl: null,
        daysFromNow: 8,
      },
      {
        title: 'Founder Stories: From Campus Project to Seed Funding',
        description: 'Tanvi Merchant (CEO, Novasphere Labs) shares her journey from student engineer to raising venture capital.',
        venue: 'Seminar Hall 3',
        virtualUrl: null,
        daysFromNow: -14, // Past event
      },
    ]

    for (const ev of demoEvents) {
      let eventId
      const existingEv = await client.query('SELECT id FROM events WHERE title = $1', [ev.title])
      if (existingEv.rows.length > 0) {
        eventId = existingEv.rows[0].id
      } else {
        const eventDate = new Date(Date.now() + ev.daysFromNow * 86400000).toISOString().split('T')[0]
        const { rows } = await client.query(
          `INSERT INTO events (organizer_id, title, description, event_date, end_date, start_time, end_time, venue, virtual_url, status, max_attendees, published_at)
           VALUES ($1, $2, $3, $4, $4, '10:00:00', '13:00:00', $5, $6, 'published', 250, NOW())
           RETURNING id`,
          [adminId, ev.title, ev.description, eventDate, ev.venue, ev.virtualUrl],
        )
        eventId = rows[0].id
      }

      // RSVP Atharva, Isha, Aarav
      if (atharvaId) {
        await client.query(`INSERT INTO event_rsvps (event_id, user_id, status, guest_count) VALUES ($1, $2, 'going', 0) ON CONFLICT (event_id, user_id) DO NOTHING`, [eventId, atharvaId])
      }
      if (aaravId) {
        await client.query(`INSERT INTO event_rsvps (event_id, user_id, status, guest_count) VALUES ($1, $2, 'going', 0) ON CONFLICT (event_id, user_id) DO NOTHING`, [eventId, aaravId])
      }
      if (ishaId) {
        await client.query(`INSERT INTO event_rsvps (event_id, user_id, status, guest_count) VALUES ($1, $2, 'going', 0) ON CONFLICT (event_id, user_id) DO NOTHING`, [eventId, ishaId])
      }
    }

    // 11. Seed Realistic Conversations & Messages (Migration 013 format)
    if (atharvaId && aaravId) {
      const lowId = atharvaId < aaravId ? atharvaId : aaravId
      const highId = atharvaId < aaravId ? aaravId : atharvaId
      const directKey = `${lowId}:${highId}`

      let convId
      const existingConv = await client.query('SELECT id FROM conversations WHERE direct_key = $1', [directKey])
      if (existingConv.rows.length > 0) {
        convId = existingConv.rows[0].id
      } else {
        const { rows: convRows } = await client.query(
          `INSERT INTO conversations (type, direct_key, last_message_at)
           VALUES ('direct', $1, NOW())
           RETURNING id`,
          [directKey],
        )
        convId = convRows[0].id
      }

      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
         VALUES ($1, $2, NOW() - INTERVAL '3 days', NOW()),
                ($1, $3, NOW() - INTERVAL '3 days', NOW())
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [convId, atharvaId, aaravId],
      )

      async function ensureMessage(senderId, recipientId, body, intervalDays) {
        const existingMsg = await client.query('SELECT id FROM messages WHERE conversation_id = $1 AND body = $2', [convId, body])
        if (existingMsg.rows.length === 0) {
          await client.query(
            `INSERT INTO messages (conversation_id, sender_id, recipient_id, body, created_at)
             VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::INTERVAL)`,
            [convId, senderId, recipientId, body, intervalDays],
          )
        }
      }

      await ensureMessage(atharvaId, aaravId, 'Hi Aarav Sir! Thanks for accepting my mentorship request. I am working on my distributed consensus project and would love your guidance.', '3')
      await ensureMessage(aaravId, atharvaId, 'Hey Atharva, happy to connect! Consensus protocols are a great topic. Are you implementing Raft or Paxos? Make sure to account for network partitions and leader heartbeats.', '2')
      await ensureMessage(atharvaId, aaravId, 'Implementing Raft in Go! I am testing election timeouts right now. Would love to demo it during our next session.', '1')
    }

    // 12. Seed Notifications (Migration 013 types & dedupe keys)
    async function ensureNotification(userId, type, title, body, dedupeKey, isRead, intervalStr) {
      if (!userId) return
      const existingNotif = await client.query('SELECT id FROM notifications WHERE dedupe_key = $1', [dedupeKey])
      if (existingNotif.rows.length === 0) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, is_read, dedupe_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() - ($7)::INTERVAL)`,
          [userId, type, title, body, isRead, dedupeKey, intervalStr],
        )
      }
    }

    await ensureNotification(atharvaId, 'connection_accepted', 'Connection Accepted', 'Aarav Mehta accepted your connection request.', 'conn_acc_atharva_aarav', true, '3 days')
    await ensureNotification(atharvaId, 'event_reminder', 'Upcoming Event Reminder', 'Workshop: Building Resilient Microservices starts in 8 days.', 'event_rem_atharva_1', false, '2 hours')
    await ensureNotification(nehaId, 'mentorship_request', 'New Mentorship Request', 'Sneha Rao requested mentorship in Cybersecurity.', 'mentor_req_neha_sneha', false, '5 hours')

    // 13. Seed Demo Donations (Migration 014 format)
    if (aaravId) {
      const { rows: dRows } = await client.query(
        `SELECT id FROM donations WHERE user_id = $1 AND purpose = $2`,
        [aaravId, 'Alumni Scholarship Endowment 2026'],
      )
      if (dRows.length === 0) {
        await client.query(
          `INSERT INTO donations (user_id, amount, currency, purpose, status, provider, is_anonymous)
           VALUES ($1, 25000.00, 'INR', 'Alumni Scholarship Endowment 2026', 'SUCCESS', 'stripe', FALSE)`,
          [aaravId],
        )
      }
    }
    if (priyaId) {
      const { rows: dRows } = await client.query(
        `SELECT id FROM donations WHERE user_id = $1 AND purpose = $2`,
        [priyaId, 'Advanced Computing AI Hardware Lab Fund'],
      )
      if (dRows.length === 0) {
        await client.query(
          `INSERT INTO donations (user_id, amount, currency, purpose, status, provider, is_anonymous)
           VALUES ($1, 50000.00, 'INR', 'Advanced Computing AI Hardware Lab Fund', 'SUCCESS', 'stripe', FALSE)`,
          [priyaId],
        )
      }
    }

    // 14. Seed Audit Logs (Migration 014 format)
    if (adminId) {
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'SYSTEM_DEMO_SEEDED', 'system', $2, '{"version":"1.0.0","environment":"development"}')`,
        [adminId, String(adminId)],
      )
    }
  })

  logger.info('Demo database seeded successfully with realistic data!')
  console.log('\n======================================================')
  console.log('DEMO ENVIRONMENT CREDENTIALS (Shared Password: Demo@Portal2026!)')
  console.log('======================================================')
  console.table(CORE_DEMO_ACCOUNTS.map((a) => ({
    Role: a.role,
    Name: `${a.firstName} ${a.lastName}`,
    Email: a.email,
  })))
  console.log('======================================================\n')
}

// Standalone execution
if (process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  seedDemoData()
    .then(() => closePool())
    .catch(async (err) => {
      console.error('Demo seeding failed:', err)
      await closePool()
      process.exit(1)
    })
}
