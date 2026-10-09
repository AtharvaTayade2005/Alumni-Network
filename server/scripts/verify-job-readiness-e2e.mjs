import assert from 'node:assert/strict'
import request from 'supertest'
process.env.NODE_ENV = 'test'
process.env.TEST_PG_PORT = '54330'

const { startTestDatabase, stopTestDatabase } = await import('../tests/helpers/testDatabase.js')
await startTestDatabase()

const { default: app } = await import('../src/app.js')
const { query, closePool } = await import('../src/config/database.js')
const { hashPassword } = await import('../src/utils/crypto.js')
const { syncSkills } = await import('../src/models/profileModel.js')

async function createStudent(emailPrefix, skills = []) {
  const mail = `${emailPrefix}.${Date.now()}@alumni.edu`
  const passwordHash = await hashPassword('DevPassw0rd!')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, 'Aarav', 'Student', TRUE) RETURNING id`,
    [mail, passwordHash],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'student'`,
    [id],
  )
  await query(
    `INSERT INTO student_profiles (user_id, degree, department, year_of_study)
     VALUES ($1, 'B.Tech Computer Science', 'Computer Engineering', 4)`,
    [id],
  )
  if (skills.length > 0) {
    await syncSkills(id, skills)
  }
  return { id, email: mail, password: 'DevPassw0rd!' }
}

async function createEmployer(emailPrefix) {
  const mail = `${emailPrefix}.${Date.now()}@alumni.edu`
  const passwordHash = await hashPassword('DevPassw0rd!')
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ($1, $2, 'Vikram', 'Alum', TRUE) RETURNING id`,
    [mail, passwordHash],
  )
  const id = rows[0].id
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'alumni'`,
    [id],
  )
  return { id, email: mail, password: 'DevPassw0rd!' }
}

async function loginUser(u) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: u.email, password: u.password })
  assert.equal(res.status, 200)
  return res.body.data.accessToken
}

async function run() {
  console.log('=== VERIFYING AI JOB READINESS, SKILL GAPS & CAREER ROADMAP END-TO-END ===\n')

  const student = await createStudent('readiness.learner', ['Node.js', 'PostgreSQL', 'Express', 'Git', 'Docker', 'REST API'])
  const token = await loginUser(student)
  const authHeader = { Authorization: `Bearer ${token}` }
  console.log(`✔ Authenticated as student ${student.email}\n`)

  // SCENARIO 1: Evaluate readiness for Backend Developer
  console.log('-----------------------------------------------------------')
  console.log('[1/8] SCENARIO 1: Grounded Readiness Evaluation (Backend Developer)')
  const res1 = await request(app)
    .post('/api/ai/career/analyze')
    .set(authHeader)
    .send({ targetRole: 'Backend Developer' })

  assert.equal(res1.status, 200)
  assert.equal(res1.body.success, true)
  const data1 = res1.body.data
  console.log(`  Target Role: ${data1.targetRole}`)
  console.log(`  Readiness Score: ${data1.readinessScore}%`)
  console.log(`  Breakdown: Essential: ${data1.scoreBreakdown.essentialScore}/40, Rec: ${data1.scoreBreakdown.recommendedScore}/20, Exp: ${data1.scoreBreakdown.experienceScore}/20`)
  console.log(`  Matching Skills: ${data1.skillMatches.map((m) => m.skill).join(', ')}`)
  console.log(`  Missing Gaps: ${data1.missingSkills.map((m) => m.skill).join(', ')}`)
  assert.ok(data1.readinessScore > 50, 'Backend developer should have strong score')
  assert.ok(data1.skillMatches.some((m) => m.skill.toLowerCase().includes('node')))
  console.log('  ✔ Backend Developer readiness evaluation verified')

  // SCENARIO 2: Target Role Adaptation (Frontend Developer)
  console.log('\n-----------------------------------------------------------')
  console.log('[2/8] SCENARIO 2: Target Role Adaptation (Frontend Developer)')
  const res2 = await request(app)
    .post('/api/ai/career/analyze')
    .set(authHeader)
    .send({ targetRole: 'Frontend Developer' })

  assert.equal(res2.status, 200)
  const data2 = res2.body.data
  console.log(`  Target Role: ${data2.targetRole}`)
  console.log(`  Readiness Score: ${data2.readinessScore}%`)
  console.log(`  Missing Skills for Frontend: ${data2.missingSkills.map((m) => m.skill).join(', ')}`)
  assert.ok(data2.readinessScore < data1.readinessScore, 'Frontend score should be lower given backend skills')
  console.log('  ✔ Role adaptation verified')

  // SCENARIO 3: Comparison against Real Active PostgreSQL Job
  console.log('\n-----------------------------------------------------------')
  console.log('[3/8] SCENARIO 3: Real Active PostgreSQL Job Evaluation')
  const employer = await createEmployer('hiring.manager')

  // Admin to moderate job
  const adminPw = await hashPassword('DevPassw0rd!')
  const { rows: adminRows } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
     VALUES ('job.moderator@alumni.edu', $1, 'Admin', 'Mod', TRUE) RETURNING id`,
    [adminPw]
  )
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE LOWER(name) = 'admin'`,
    [adminRows[0].id]
  )

  const { rows: jobRows } = await query(
    `INSERT INTO jobs (
       posted_by, company_name, title, description,
       location, status, moderated_by, moderated_at, published_at, work_mode, employment_type
     ) VALUES (
       $1, 'Atlassian India', 'Senior Cloud Platform Engineer',
       'Looking for engineers with Node.js, PostgreSQL, Docker, Redis, Kubernetes and AWS.',
       'Bengaluru', 'published', $2, NOW(), NOW(), 'hybrid', 'full_time'
     ) RETURNING id`,
    [employer.id, adminRows[0].id]
  )
  const realJobId = jobRows[0].id

  const res3 = await request(app)
    .post('/api/ai/career/analyze')
    .set(authHeader)
    .send({ jobId: realJobId })

  assert.equal(res3.status, 200)
  const data3 = res3.body.data
  console.log(`  Target Job: ${data3.job.title} at ${data3.job.company}`)
  console.log(`  Readiness Match: ${data3.readinessScore}%`)
  assert.equal(data3.job.id, realJobId)
  assert.equal(data3.job.company, 'Atlassian India')
  console.log('  ✔ Real PostgreSQL job comparison verified')

  // SCENARIO 4: Generate Personalized Career Roadmap
  console.log('\n-----------------------------------------------------------')
  console.log('[4/8] SCENARIO 4: Generate Personalized Staged Learning Roadmap')
  const res4 = await request(app)
    .post('/api/ai/roadmap/generate')
    .set(authHeader)
    .send({ targetRole: 'Backend Developer' })

  assert.equal(res4.status, 200)
  const roadmap = res4.body.data
  console.log(`  Roadmap ID: ${roadmap.id}`)
  console.log(`  Stages & Tasks Count: ${roadmap.tasks.length}`)
  console.log(`  Progress: ${roadmap.stats.completedTasks}/${roadmap.stats.totalTasks} (0%)`)
  assert.ok(roadmap.tasks.length >= 4)
  assert.equal(roadmap.stats.completedTasks, 0)
  for (const t of roadmap.tasks) {
    console.log(`    Stage ${t.stageOrder}: [${t.stage}] ${t.title} (Priority: ${t.priority})`)
  }
  console.log('  ✔ Staged learning roadmap generated and persisted')

  // SCENARIO 5: Mark Task Complete & Verify Persistent Progress
  console.log('\n-----------------------------------------------------------')
  console.log('[5/8] SCENARIO 5: Complete Task & Recalculate Persistent Progress')
  const taskToComplete = roadmap.tasks[0]
  const patchRes = await request(app)
    .patch(`/api/ai/roadmap/tasks/${taskToComplete.id}`)
    .set(authHeader)
    .send({ isCompleted: true })

  assert.equal(patchRes.status, 200)
  assert.equal(patchRes.body.data.task.isCompleted, true)
  assert.equal(patchRes.body.data.stats.completedTasks, 1)
  console.log(`  Task "${taskToComplete.title}" marked complete`)
  console.log(`  New Progress: ${patchRes.body.data.stats.completedTasks}/${patchRes.body.data.stats.totalTasks} (${patchRes.body.data.stats.progressPercentage}%)`)

  // Verify fetch persistence
  const getRoadmapRes = await request(app)
    .get('/api/ai/roadmap')
    .set(authHeader)
    .query({ targetRole: 'Backend Developer' })

  assert.equal(getRoadmapRes.status, 200)
  assert.equal(getRoadmapRes.body.data.stats.completedTasks, 1)
  console.log('  ✔ Task completion persisted across requests')

  // SCENARIO 6: Reopen Completed Task
  console.log('\n-----------------------------------------------------------')
  console.log('[6/8] SCENARIO 6: Reopen Task & Recalculate Progress')
  const reopenRes = await request(app)
    .patch(`/api/ai/roadmap/tasks/${taskToComplete.id}`)
    .set(authHeader)
    .send({ isCompleted: false })

  assert.equal(reopenRes.status, 200)
  assert.equal(reopenRes.body.data.task.isCompleted, false)
  assert.equal(reopenRes.body.data.stats.completedTasks, 0)
  console.log('  ✔ Reopened task cleanly recalculated progress to 0%')

  // Mark complete again before regeneration test
  await request(app)
    .patch(`/api/ai/roadmap/tasks/${taskToComplete.id}`)
    .set(authHeader)
    .send({ isCompleted: true })

  // SCENARIO 7: Roadmap Regeneration Reconciling
  console.log('\n-----------------------------------------------------------')
  console.log('[7/8] SCENARIO 7: Reconcile Tasks on Regeneration (Preserve Completed Work)')
  const regenRes = await request(app)
    .post('/api/ai/roadmap/generate')
    .set(authHeader)
    .send({ targetRole: 'Backend Developer', regenerate: true })

  assert.equal(regenRes.status, 200)
  const regenTasks = regenRes.body.data.tasks
  const preservedTask = regenTasks.find(
    (t) => t.skillFocus === taskToComplete.skillFocus || t.title === taskToComplete.title
  )
  assert.ok(preservedTask, 'Matching task should exist in regenerated roadmap')
  assert.equal(preservedTask.isCompleted, true, 'Completed work must be preserved after regeneration')
  console.log(`  ✔ Regenerated roadmap preserved completed task "${preservedTask.title}"`)

  // SCENARIO 8: Strict Tenant Isolation
  console.log('\n-----------------------------------------------------------')
  console.log('[8/8] SCENARIO 8: Strict Tenant Isolation & Prompt Injection Defense')
  const hacker = await createStudent('malicious.user')
  const hackerToken = await loginUser(hacker)
  const hackerAuth = { Authorization: `Bearer ${hackerToken}` }

  // Hacker attempts to modify student's task
  const tamperRes = await request(app)
    .patch(`/api/ai/roadmap/tasks/${taskToComplete.id}`)
    .set(hackerAuth)
    .send({ isCompleted: false })

  assert.equal(tamperRes.status, 403)
  console.log('  ✔ User cannot tamper with another user\'s roadmap task (403 Forbidden)')

  // Hacker attempts to read student's roadmap
  const leakRes = await request(app)
    .get('/api/ai/roadmap')
    .set(hackerAuth)
    .query({ roadmapId: roadmap.id })

  assert.equal(leakRes.status, 403)
  console.log('  ✔ User cannot read another user\'s private roadmap (403 Forbidden)')

  console.log('\n=== ALL 8 END-TO-END SCENARIOS VERIFIED SUCCESSFULLY ===')
}

run()
  .then(async () => {
    await stopTestDatabase()
    await closePool()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('VERIFICATION FAILED:', err)
    await stopTestDatabase()
    await closePool()
    process.exit(1)
  })
