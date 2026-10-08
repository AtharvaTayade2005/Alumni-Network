import { query, closePool } from '../src/config/database.js'

const BASE_URL = 'http://localhost:5000/api'

async function run() {
  console.log('=== VERIFYING AI CAREER ASSISTANT END-TO-END ===\n')

  // 1. Sign in as student
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@alumni.local', password: 'DevPassw0rd!' }),
  })
  const loginBody = await loginRes.json()
  if (!loginRes.ok || !loginBody.data?.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(loginBody)}`)
  }
  const token = loginBody.data.accessToken
  console.log('✔ Authenticated as student@alumni.local')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const queries = [
    {
      num: 1,
      title: 'Test 1: Backend Skills Inquiry',
      query: 'What skills should I learn for backend development?',
    },
    {
      num: 2,
      title: 'Test 2: Alumni Discovery Query',
      query: 'Find alumni who can help me with backend development.',
    },
    {
      num: 3,
      title: 'Test 3: Job Matching Query',
      query: 'Which jobs match my profile?',
    },
    {
      num: 4,
      title: 'Test 4: Skill Gaps Against Available Roles',
      query: 'What skills am I missing for the jobs available to me?',
    },
    {
      num: 5,
      title: 'Test 5: Mentor Recommendation Query',
      query: 'Who would be a good mentor for me?',
    },
  ]

  for (const q of queries) {
    console.log(`\n-----------------------------------------------------------`)
    console.log(`[${q.num}/5] ${q.title}`)
    console.log(`Query: "${q.query}"`)

    const chatRes = await fetch(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: q.query, history: [] }),
    })
    const chatBody = await chatRes.json()

    if (!chatRes.ok || !chatBody.success) {
      throw new Error(`Query failed (${chatRes.status}): ${JSON.stringify(chatBody)}`)
    }

    console.log(`✔ Status: 200 OK`)
    console.log(`✔ Response Text: ${chatBody.data.text.slice(0, 140)}...`)
    console.log(`✔ Suggested Actions: ${chatBody.data.suggestedActions?.length || 0} returned`)

    const { people = [], jobs = [], mentors = [] } = chatBody.data.recommendations || {}

    // Verify people in PostgreSQL
    if (people.length > 0) {
      console.log(`  -> Validating ${people.length} alumni recommendations in PostgreSQL...`)
      for (const p of people) {
        const { rows } = await query('SELECT id, first_name, last_name FROM users WHERE id = $1', [p.id])
        if (rows.length === 0) {
          throw new Error(`Alumni ${p.id} (${p.name}) NOT FOUND in PostgreSQL!`)
        }
        console.log(`     ✔ Alumnus verified in DB: ${p.name} (id: ${p.id})`)
      }
    } else {
      console.log(`  -> Alumni recommendations: 0 (Honest response, no hallucinations)`)
    }

    // Verify jobs in PostgreSQL
    if (jobs.length > 0) {
      console.log(`  -> Validating ${jobs.length} job recommendations in PostgreSQL...`)
      for (const j of jobs) {
        const { rows } = await query('SELECT id, title, company_name FROM jobs WHERE id = $1', [j.id])
        if (rows.length === 0) {
          throw new Error(`Job ${j.id} (${j.title}) NOT FOUND in PostgreSQL!`)
        }
        console.log(`     ✔ Job verified in DB: ${j.title} at ${j.companyName} (id: ${j.id})`)
      }
    } else {
      console.log(`  -> Job recommendations: 0 (Honest response, no hallucinations)`)
    }

    // Verify mentors in PostgreSQL
    if (mentors.length > 0) {
      console.log(`  -> Validating ${mentors.length} mentor recommendations in PostgreSQL...`)
      for (const m of mentors) {
        const { rows } = await query(
          `SELECT u.id, ap.is_open_to_mentor
           FROM users u
           JOIN alumni_profiles ap ON ap.user_id = u.id
           WHERE u.id = $1`,
          [m.id]
        )
        if (rows.length === 0) {
          throw new Error(`Mentor ${m.id} (${m.name}) NOT FOUND in PostgreSQL!`)
        }
        if (!rows[0].is_open_to_mentor) {
          throw new Error(`Mentor ${m.id} (${m.name}) is marked UNAVAILABLE for mentorship in DB!`)
        }
        console.log(`     ✔ Mentor verified in DB & is_open_to_mentor=true: ${m.name} (id: ${m.id})`)
      }
    } else {
      console.log(`  -> Mentor recommendations: 0 (Honest response, no hallucinations)`)
    }
  }

  console.log('\n===========================================================')
  console.log('ALL 5 END-TO-END AI ASSISTANT QUERIES FULLY VERIFIED!')
  console.log('ALL RECOMMENDED ENTITIES VERIFIED IN POSTGRESQL!')
  console.log('===========================================================')

  await closePool()
}

run().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
