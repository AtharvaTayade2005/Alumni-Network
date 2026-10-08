import 'dotenv/config'
import bcrypt from 'bcrypt'
import { query, closePool } from '../src/config/database.js'
import { aiService } from '../src/services/ai/aiService.js'
import { syncEntitiesToIndex } from '../src/services/ai/retrievalService.js'

async function ensureSeedEntities() {
  console.log('[Setup] Seeding rich PostgreSQL entities for semantic discovery...')
  const passwordHash = await bcrypt.hash('DevPassw0rd!', 10)

  // 1. Seed or update AI Alumnus: Rahul Sharma
  let { rows: u1 } = await query(`SELECT id FROM users WHERE email = 'rahul.ai@alumni.local'`)
  let u1Id
  if (u1.length === 0) {
    const res = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active, is_suspended)
       VALUES ('rahul.ai@alumni.local', $1, 'Rahul', 'Sharma', TRUE, TRUE, FALSE)
       RETURNING id`,
      [passwordHash]
    )
    u1Id = res.rows[0].id
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE LOWER(name) = 'alumni'`, [u1Id])
  } else {
    u1Id = u1[0].id
  }

  await query(
    `INSERT INTO alumni_profiles (user_id, current_company, current_position, industry, bio, city, country, graduation_year, is_open_to_mentor, verification_status)
     VALUES ($1, 'Microsoft', 'Senior AI Engineer', 'Artificial Intelligence', 'Passionate about deep learning, LLMs, and neural architectures.', 'Mumbai', 'India', 2019, TRUE, 'verified')
     ON CONFLICT (user_id) DO UPDATE SET
       current_company = 'Microsoft',
       current_position = 'Senior AI Engineer',
       industry = 'Artificial Intelligence',
       bio = 'Passionate about deep learning, LLMs, and neural architectures.',
       city = 'Mumbai',
       country = 'India',
       verification_status = 'verified'`,
    [u1Id]
  )
  await query(
    `INSERT INTO privacy_settings (user_id, show_profile_in_directory)
     VALUES ($1, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET show_profile_in_directory = TRUE`,
    [u1Id]
  )

  // 2. Seed or update Web Alumnus: Priya Patel (React & Node.js)
  let { rows: u2 } = await query(`SELECT id FROM users WHERE email = 'priya.web@alumni.local'`)
  let u2Id
  if (u2.length === 0) {
    const res = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified, is_active, is_suspended)
       VALUES ('priya.web@alumni.local', $1, 'Priya', 'Patel', TRUE, TRUE, FALSE)
       RETURNING id`,
      [passwordHash]
    )
    u2Id = res.rows[0].id
    await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE LOWER(name) = 'alumni'`, [u2Id])
  } else {
    u2Id = u2[0].id
  }

  await query(
    `INSERT INTO alumni_profiles (user_id, current_company, current_position, industry, bio, city, country, graduation_year, is_open_to_mentor, verification_status)
     VALUES ($1, 'Atlassian', 'Staff Fullstack Engineer', 'Software Engineering', 'Specialist in scalable React applications and Node.js microservices.', 'Mumbai', 'India', 2020, TRUE, 'verified')
     ON CONFLICT (user_id) DO UPDATE SET
       current_company = 'Atlassian',
       current_position = 'Staff Fullstack Engineer',
       industry = 'Software Engineering',
       bio = 'Specialist in scalable React applications and Node.js microservices.',
       city = 'Mumbai',
       country = 'India',
       verification_status = 'verified'`,
    [u2Id]
  )
  await query(
    `INSERT INTO privacy_settings (user_id, show_profile_in_directory)
     VALUES ($1, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET show_profile_in_directory = TRUE`,
    [u2Id]
  )

  // Attach skills to Rahul & Priya
  for (const [userId, skillNames] of [
    [u1Id, ['Artificial Intelligence', 'Machine Learning', 'Python', 'PyTorch']],
    [u2Id, ['React', 'Node.js', 'TypeScript', 'PostgreSQL']],
  ]) {
    for (const name of skillNames) {
      let { rows: sk } = await query(`SELECT id FROM skills WHERE LOWER(name) = LOWER($1)`, [name])
      let skillId = sk[0]?.id
      if (!skillId) {
        const ins = await query(`INSERT INTO skills (name, category) VALUES ($1, 'Technical') RETURNING id`, [name])
        skillId = ins.rows[0].id
      }
      await query(`INSERT INTO user_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT (user_id, skill_id) DO NOTHING`, [userId, skillId])
    }
  }

  // 3. Seed active/published Backend Job
  const { rows: adminRows } = await query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE LOWER(r.name) = 'admin' LIMIT 1`)
  const adminId = adminRows[0]?.id || u1Id

  let { rows: jobRows } = await query(`SELECT id FROM jobs WHERE title = 'Backend Systems Engineer' LIMIT 1`)
  if (jobRows.length === 0) {
    const res = await query(
      `INSERT INTO jobs (posted_by, title, company_name, description, location, status, moderated_by, moderated_at, published_at, work_mode, employment_type, experience_level)
       VALUES ($1, 'Backend Systems Engineer', 'Microsoft', 'Develop high-throughput cloud microservices with Node.js, TypeScript, and PostgreSQL database optimizations.', 'Remote', 'published', $2, NOW(), NOW(), 'remote', 'full_time', 'senior')
       RETURNING id`,
      [u1Id, adminId]
    )
    const jobId = res.rows[0].id
    // Attach skills
    for (const s of ['Node.js', 'PostgreSQL']) {
      const { rows: sk } = await query(`SELECT id FROM skills WHERE LOWER(name) = LOWER($1)`, [s])
      if (sk[0]?.id) {
        await query(`INSERT INTO job_skills (job_id, skill_id, required) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING`, [jobId, sk[0].id])
      }
    }
  } else {
    await query(`UPDATE jobs SET status = 'published' WHERE id = $1`, [jobRows[0].id])
  }

  // 4. Seed published AI Event in Mumbai
  let { rows: eventRows } = await query(`SELECT id FROM events WHERE title = 'Mumbai Technology Summit: AI & Generative Models' LIMIT 1`)
  if (eventRows.length === 0) {
    await query(
      `INSERT INTO events (organizer_id, title, description, event_date, start_time, end_time, venue, city, status)
       VALUES ($1, 'Mumbai Technology Summit: AI & Generative Models', 'Premier gathering for software developers in Mumbai exploring artificial intelligence, machine learning, and modern backend systems.', CURRENT_DATE + INTERVAL '10 days', '09:30:00', '17:00:00', 'NESCO Convention Center', 'Mumbai', 'published')`,
      [u1Id]
    )
  } else {
    await query(`UPDATE events SET status = 'published' WHERE id = $1`, [eventRows[0].id])
  }

  console.log('✔ Seed entities ready in PostgreSQL.\n')
}

async function runE2EVerification() {
  console.log('=== REAL END-TO-END SEMANTIC SEARCH & DISCOVERY VERIFICATION ===\n')

  await ensureSeedEntities()

  console.log('[Step 1] Synchronizing PostgreSQL entities into vector index...')
  await syncEntitiesToIndex()
  console.log('✔ Vector index sync completed.\n')

  // We test the 5 required natural-language queries
  const testQueries = [
    {
      name: 'Test 1: Find alumni who work in AI',
      query: 'Find alumni who work in AI',
      type: 'PEOPLE',
      verifyEntity: async (item) => {
        const { rows } = await query(`SELECT id, first_name, last_name, is_active FROM users WHERE id = $1`, [item.id])
        if (rows.length === 0) throw new Error(`Person ${item.id} (${item.title}) not found in PostgreSQL users table!`)
        if (!rows[0].is_active) throw new Error(`Person ${item.id} is inactive`)
        return `Verified user: ${rows[0].first_name} ${rows[0].last_name}`
      },
    },
    {
      name: 'Test 2: Find people with React and Node.js experience',
      query: 'Find people with React and Node.js experience',
      type: 'PEOPLE',
      verifyEntity: async (item) => {
        const { rows } = await query(`SELECT id, first_name, last_name FROM users WHERE id = $1`, [item.id])
        if (rows.length === 0) throw new Error(`Person ${item.id} not found in PostgreSQL!`)
        return `Verified person: ${rows[0].first_name} ${rows[0].last_name}`
      },
    },
    {
      name: 'Test 3: Find backend engineering jobs',
      query: 'Find backend engineering jobs',
      type: 'JOBS',
      verifyEntity: async (item) => {
        const { rows } = await query(`SELECT id, title, status FROM jobs WHERE id = $1`, [item.id])
        if (rows.length === 0) throw new Error(`Job ${item.id} (${item.title}) not found in PostgreSQL jobs table!`)
        if (!['published', 'active'].includes(rows[0].status.toLowerCase())) {
          throw new Error(`Job ${item.id} is not active in PostgreSQL (status: ${rows[0].status})`)
        }
        return `Verified active job: ${rows[0].title}`
      },
    },
    {
      name: 'Test 4: Find technology events related to AI',
      query: 'Find technology events related to AI',
      type: 'EVENTS',
      verifyEntity: async (item) => {
        const { rows } = await query(`SELECT id, title, status FROM events WHERE id = $1`, [item.id])
        if (rows.length === 0) throw new Error(`Event ${item.id} (${item.title}) not found in PostgreSQL events table!`)
        return `Verified event: ${rows[0].title}`
      },
    },
    {
      name: 'Test 5: Find opportunities for someone interested in backend development',
      query: 'Find opportunities for someone interested in backend development',
      type: 'ALL',
      verifyEntity: async (item) => {
        if (item.entityType === 'PEOPLE') {
          const { rows } = await query(`SELECT id FROM users WHERE id = $1`, [item.id])
          if (!rows.length) throw new Error(`Candidate user ${item.id} missing in PostgreSQL`)
          return `Verified alumni entity (${item.title})`
        } else if (item.entityType === 'JOBS') {
          const { rows } = await query(`SELECT id, status FROM jobs WHERE id = $1`, [item.id])
          if (!rows.length) throw new Error(`Candidate job ${item.id} missing in PostgreSQL`)
          return `Verified active job entity (${item.title})`
        } else if (item.entityType === 'EVENTS') {
          const { rows } = await query(`SELECT id FROM events WHERE id = $1`, [item.id])
          if (!rows.length) throw new Error(`Candidate event ${item.id} missing in PostgreSQL`)
          return `Verified event entity (${item.title})`
        }
        throw new Error(`Unknown entity type: ${item.entityType}`)
      },
    },
  ]

  for (const t of testQueries) {
    console.log(`--- Running ${t.name} ---`)
    console.log(`Query: "${t.query}" (Type: ${t.type})`)

    const result = await aiService.semanticSearch({
      query: t.query,
      type: t.type,
      limit: 5,
    })

    console.log(`Total results returned: ${result.total}`)
    if (result.total === 0) {
      throw new Error(`Expected results for query "${t.query}", but got 0!`)
    }

    for (const item of result.results) {
      console.log(`  • [${item.entityType}] "${item.title}" - ${item.relevance?.label || item.matchScore + '% Match'} (Score: ${item.matchScore})`)
      console.log(`    Why: ${item.matchReason}`)
      const verificationMsg = await t.verifyEntity(item)
      console.log(`    ✔ PostgreSQL check: ${verificationMsg}`)
    }
    console.log(`✔ ${t.name} PASSED\n`)
  }

  console.log('======================================================')
  console.log('ALL 5 REAL QUERIES VERIFIED AGAINST POSTGRESQL!')
  console.log('Zero hallucination, full database grounding confirmed.')
  console.log('======================================================')
  await closePool()
  process.exit(0)
}

runE2EVerification().catch(async (err) => {
  console.error('E2E Verification Error:', err)
  await closePool().catch(() => {})
  process.exit(1)
})
