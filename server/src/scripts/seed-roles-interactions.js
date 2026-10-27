/**
 * seed-roles-interactions.js
 *
 * Seeds comprehensive test accounts and interaction baselines for all primary personas:
 *   - Student:   student.test@alumni.edu   (Aarav Sharma)
 *   - Alumni:    alumni.test@alumni.edu    (Priya Nair)
 *   - Professor: professor.test@alumni.edu (Dr. Ramesh Kulkarni)
 * Password for all: Password123!
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { query, closePool } from '../config/database.js'
import { ensureDevDatabase } from '../config/devDbAutoStart.js'

const SHARED_PASSWORD = 'Password123!'
const BCRYPT_ROUNDS = 10

export const TEST_ACCOUNTS = {
  student: {
    email: 'student.test@alumni.edu',
    firstName: 'Aarav',
    lastName: 'Sharma',
    role: 'STUDENT',
    department: 'Computer Science & Engineering',
    degree: 'B.Tech in Computer Science & Engineering',
    yearOfStudy: 3,
    expectedGraduation: 2027,
    city: 'Mumbai',
    country: 'India',
    location: 'Mumbai, India',
    headline: 'Computer Science Scholar @ VIT | Aspiring Systems Architect',
    bio: 'Passionate computer science scholar focused on scalable backend microservices, distributed data systems, and real-time computing.',
    careerInterests: 'Distributed Systems, Cloud Architecture, Full-Stack Engineering, AI & Applied ML',
    skills: ['JavaScript', 'TypeScript', 'Node.js', 'React.js', 'Python', 'PostgreSQL', 'Docker'],
  },
  alumni: {
    email: 'alumni.test@alumni.edu',
    firstName: 'Priya',
    lastName: 'Nair',
    role: 'ALUMNI',
    department: 'Information Technology',
    degree: 'B.Tech in Information Technology',
    graduationYear: 2020,
    currentCompany: 'Google',
    currentPosition: 'Senior Staff Systems Architect',
    industry: 'Cloud Infrastructure & Distributed Systems',
    city: 'Bengaluru',
    country: 'India',
    location: 'Bengaluru, India',
    headline: 'Senior Staff Systems Architect @ Google | Alumni Mentor',
    bio: 'Senior Staff Systems Architect at Google. Passionate about empowering students through 1-on-1 technical roadmaps, systems design coaching, and portfolio critiques.',
    isOpenToMentor: true,
    mentorshipCapacity: 5,
    preferredMode: 'video',
    verificationStatus: 'verified',
    skills: ['Distributed Systems', 'Cloud Architecture', 'Kubernetes', 'Go', 'System Design', 'PostgreSQL'],
  },
  professor: {
    email: 'professor.test@alumni.edu',
    firstName: 'Dr. Ramesh',
    lastName: 'Kulkarni',
    role: 'PROFESSOR',
    department: 'Computer Science & Engineering',
    degree: 'Ph.D. in Computer Science & Distributed Operating Systems',
    graduationYear: 2008,
    currentCompany: 'Vidyalankar Institute of Technology',
    currentPosition: 'Professor & Head of Department',
    industry: 'Higher Education & Advanced Research',
    city: 'Mumbai',
    country: 'India',
    location: 'Mumbai, India',
    headline: 'Professor & Head of Department @ VIT | Academic Advisor',
    bio: 'Senior Professor and Head of Computer Science Department. Research advisor in Distributed Computing, Cloud Virtualization, and Academic-Industry Collaboration.',
    isOpenToMentor: true,
    mentorshipCapacity: 10,
    preferredMode: 'in_person',
    verificationStatus: 'verified',
    skills: ['Distributed Systems', 'Operating Systems', 'Parallel Computing', 'System Design', 'Research Methodology'],
  },
}

async function ensureRoles() {
  const roles = ['STUDENT', 'ALUMNI', 'PROFESSOR', 'FACULTY', 'ADMIN', 'MODERATOR']
  for (const r of roles) {
    const existing = await query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [r])
    if (existing.rows.length === 0) {
      await query(
        'INSERT INTO roles (name, description) VALUES ($1, $2)',
        [r, `${r} role`],
      )
    }
  }
}

async function ensureSkills(skillNames) {
  const skillMap = {}
  for (const name of skillNames) {
    const existing = await query('SELECT id FROM skills WHERE LOWER(name) = LOWER($1)', [name])
    if (existing.rows.length > 0) {
      skillMap[name] = existing.rows[0].id
    } else {
      const { rows } = await query(
        `INSERT INTO skills (name, category) VALUES ($1, 'Technology') RETURNING id`,
        [name],
      )
      skillMap[name] = rows[0].id
    }
  }
  return skillMap
}

export async function seedRolesInteractions() {
  await ensureDevDatabase()
  await ensureRoles()

  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, BCRYPT_ROUNDS)
  const allSkills = Array.from(new Set([
    ...TEST_ACCOUNTS.student.skills,
    ...TEST_ACCOUNTS.alumni.skills,
    ...TEST_ACCOUNTS.professor.skills,
  ]))
  const skillMap = await ensureSkills(allSkills)

  const seededUsers = {}

  for (const [key, account] of Object.entries(TEST_ACCOUNTS)) {
    // 1. Upsert User
    const { rows: userRows } = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name,
                          is_email_verified, is_active, is_suspended)
       VALUES (LOWER($1), $2, $3, $4, TRUE, TRUE, FALSE)
       ON CONFLICT (LOWER(email)) DO UPDATE
         SET password_hash     = EXCLUDED.password_hash,
             first_name        = EXCLUDED.first_name,
             last_name         = EXCLUDED.last_name,
             is_email_verified = TRUE,
             is_active         = TRUE,
             is_suspended      = FALSE
       RETURNING id, email, first_name, last_name`,
      [account.email, passwordHash, account.firstName, account.lastName],
    )
    const userId = userRows[0].id
    seededUsers[key] = { ...account, id: userId }

    // 2. Assign Role
    await query('DELETE FROM user_roles WHERE user_id = $1', [userId])
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)
       ON CONFLICT DO NOTHING`,
      [userId, account.role],
    )

    // 3. Profiles: Student or Alumni
    if (account.role === 'STUDENT') {
      await query(
        `INSERT INTO student_profiles (
           user_id, department, degree, year_of_study, expected_graduation,
           career_interests, bio, is_open_to_mentorship, city, country, location
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
         ON CONFLICT (user_id) DO UPDATE SET
           department            = EXCLUDED.department,
           degree                = EXCLUDED.degree,
           year_of_study         = EXCLUDED.year_of_study,
           expected_graduation   = EXCLUDED.expected_graduation,
           career_interests      = EXCLUDED.career_interests,
           bio                   = EXCLUDED.bio,
           is_open_to_mentorship = TRUE,
           city                  = EXCLUDED.city,
           country               = EXCLUDED.country,
           location              = EXCLUDED.location`,
        [
          userId, account.department, account.degree, account.yearOfStudy,
          account.expectedGraduation, account.careerInterests, account.bio,
          account.city, account.country, account.location,
        ],
      )
    } else {
      // Alumni & Professor share alumni_profiles schema
      await query(
        `INSERT INTO alumni_profiles (
           user_id, graduation_year, degree, department, major, current_company,
           current_position, job_title, industry, bio, city, country, location,
           is_open_to_mentor, mentorship_capacity, verification_status, verified_at
         ) VALUES ($1, $2, $3, $4, $4, $5, $6, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           graduation_year     = EXCLUDED.graduation_year,
           degree              = EXCLUDED.degree,
           department          = EXCLUDED.department,
           major               = EXCLUDED.major,
           current_company     = EXCLUDED.current_company,
           current_position    = EXCLUDED.current_position,
           job_title           = EXCLUDED.job_title,
           industry            = EXCLUDED.industry,
           bio                 = EXCLUDED.bio,
           city                = EXCLUDED.city,
           country             = EXCLUDED.country,
           location            = EXCLUDED.location,
           is_open_to_mentor   = EXCLUDED.is_open_to_mentor,
           mentorship_capacity = EXCLUDED.mentorship_capacity,
           verification_status = 'verified',
           verified_at         = NOW()`,
        [
          userId, account.graduationYear ?? 2020, account.degree, account.department,
          account.currentCompany, account.currentPosition, account.industry,
          account.bio, account.city, account.country, account.location,
          Boolean(account.isOpenToMentor), account.mentorshipCapacity ?? 5,
          account.verificationStatus ?? 'verified',
        ],
      )
    }

    // 4. Dedicated `profiles` projection table entry
    await query(
      `INSERT INTO profiles (user_id, headline, bio, department, location, graduation_year)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         headline        = EXCLUDED.headline,
         bio             = EXCLUDED.bio,
         department      = EXCLUDED.department,
         location        = EXCLUDED.location,
         graduation_year = EXCLUDED.graduation_year`,
      [
        userId, account.headline, account.bio, account.department,
        account.location, account.graduationYear ?? account.expectedGraduation ?? null,
      ],
    )

    // 5. Dedicated `mentorship_settings` entry for mentors (Alumni & Professor)
    if (account.isOpenToMentor) {
      await query(
        `INSERT INTO mentorship_settings (user_id, is_available, capacity, preferred_mode, bio)
         VALUES ($1, TRUE, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           is_available   = TRUE,
           capacity       = EXCLUDED.capacity,
           preferred_mode = EXCLUDED.preferred_mode,
           bio            = EXCLUDED.bio`,
        [userId, account.mentorshipCapacity ?? 5, account.preferredMode ?? 'video', account.bio],
      )
    }

    // 6. User Skills
    for (const skill of account.skills) {
      const skillId = skillMap[skill]
      if (skillId) {
        await query(
          `INSERT INTO user_skills (user_id, skill_id, proficiency)
           VALUES ($1, $2, 'expert')
           ON CONFLICT (user_id, skill_id) DO NOTHING`,
          [userId, skillId],
        )
      }
    }

    // 7. Privacy and Notification preferences
    await query(
      `INSERT INTO privacy_settings (user_id, allow_connection_requests, allow_messages_from)
       VALUES ($1, TRUE, 'connections')
       ON CONFLICT (user_id) DO UPDATE SET
         allow_connection_requests = TRUE,
         allow_messages_from = 'connections'`,
      [userId],
    )

    await query(
      `INSERT INTO notification_preferences (user_id, email_enabled, in_app_enabled)
       VALUES ($1, TRUE, TRUE)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )
  }

  const studentId = seededUsers.student.id
  const alumniId = seededUsers.alumni.id
  const profId = seededUsers.professor.id

  // 8. Establish pre-connected state between Student and Alumni
  // This enables the student to immediately request mentorship without the "Connect first" error.
  await query(
    `INSERT INTO connections (requester_id, addressee_id, status, responded_at)
     VALUES ($1, $2, 'accepted', NOW())
     ON CONFLICT DO NOTHING`,
    [studentId, alumniId],
  )
  await query(
    `UPDATE connections SET status = 'accepted', responded_at = NOW()
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [studentId, alumniId],
  )

  // 9. Reset prior interactions between Alumni and Professor so connection test runs clean
  await query(
    `DELETE FROM connections
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [alumniId, profId],
  )

  // 10. Clean prior mentorship requests/relationships between Student and Alumni for a fresh flow
  await query(
    `DELETE FROM mentorship_relationships
     WHERE (mentor_id = $1 AND mentee_id = $2)
        OR (mentor_id = $2 AND mentee_id = $1)`,
    [alumniId, studentId],
  )
  await query(
    `DELETE FROM mentorship_requests
     WHERE (mentor_id = $1 AND mentee_id = $2)
        OR (mentor_id = $2 AND mentee_id = $1)`,
    [alumniId, studentId],
  )

  console.log('----------------------------------------------------')
  console.log('✓ Roles and interactions seeded successfully!')
  console.log('----------------------------------------------------')
  console.log('1. Student:   student.test@alumni.edu   (Aarav Sharma)   [Password123!]')
  console.log('2. Alumni:    alumni.test@alumni.edu    (Priya Nair)     [Password123!]')
  console.log('3. Professor: professor.test@alumni.edu (Dr. Ramesh)     [Password123!]')
  console.log('----------------------------------------------------')
  console.log('Status:')
  console.log(' • Student <-> Alumni: Pre-connected (ready for mentorship request test)')
  console.log(' • Alumni <-> Professor: Unconnected (ready for connection request test)')
  console.log(' • Mentorship settings & profiles: Active and verified')
  console.log('----------------------------------------------------')

  return seededUsers
}

if (process.argv[1]?.endsWith('seed-roles-interactions.js')) {
  seedRolesInteractions()
    .then(async () => {
      await closePool()
      process.exit(0)
    })
    .catch(async (err) => {
      console.error('Seeding error:', err)
      await closePool()
      process.exit(1)
    })
}
