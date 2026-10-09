/**
 * End-to-End Verification Script for Authentication and Demo Data.
 * Tests actual running HTTP endpoints on http://localhost:5000.
 */
import assert from 'node:assert/strict'

const BASE_URL = 'http://localhost:5000/api'
const DEMO_PASSWORD = 'Demo@Portal2026!'

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const res = await fetch(url, { ...options, headers })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, headers: res.headers, body: json }
}

async function run() {
  console.log('--- Starting End-to-End Authentication & Demo Verification ---\n')

  // 1. Health check
  console.log('1. Checking API Health...')
  const health = await request('/health')
  assert.equal(health.status, 200, 'Health check must return 200')
  assert.equal(health.body.success, true)
  console.log('   ✓ Health check passed\n')

  // 2. Demo User Logins for All Roles
  const rolesToTest = [
    { role: 'ADMIN', email: 'admin.demo@alumniportal.test' },
    { role: 'ALUMNI', email: 'alumni.demo@alumniportal.test' },
    { role: 'STUDENT', email: 'student.demo@alumniportal.test' },
    { role: 'PROFESSOR', email: 'prof.kulkarni@alumniportal.test' },
  ]

  const tokens = {}

  for (const { role, email } of rolesToTest) {
    console.log(`2. Testing Login for ${role} (${email})...`)
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    })
    assert.equal(res.status, 200, `Login for ${role} must return 200. Got: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.success, true)
    assert.ok(res.body.data.accessToken, 'Access token must be returned')
    assert.equal(res.body.data.user.email.toLowerCase(), email.toLowerCase())
    tokens[role] = res.body.data.accessToken
    console.log(`   ✓ Successfully signed in as ${role} (${res.body.data.user.fullName})`)
  }
  console.log()

  // 3. Test Invalid Credentials
  console.log('3. Testing Invalid Password...')
  const badPass = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin.demo@alumniportal.test', password: 'WrongPassword999!' }),
  })
  assert.equal(badPass.status, 401, 'Invalid password must return 401')
  assert.equal(badPass.body.success, false)
  console.log('   ✓ Invalid password rejected with 401\n')

  console.log('4. Testing Nonexistent Email...')
  const badEmail = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nobody.exists@nowhere.test', password: DEMO_PASSWORD }),
  })
  assert.equal(badEmail.status, 401, 'Nonexistent email must return 401')
  assert.equal(badEmail.body.success, false)
  console.log('   ✓ Nonexistent email rejected with 401\n')

  // 5. Test Protected Route: /auth/me for each role
  console.log('5. Testing Protected /auth/me for Alumni...')
  const meAlumni = await request('/auth/me', {
    headers: { Authorization: `Bearer ${tokens.ALUMNI}` },
  })
  assert.equal(meAlumni.status, 200)
  assert.equal(meAlumni.body.success, true)
  assert.equal(meAlumni.body.data.user.email, 'alumni.demo@alumniportal.test')
  console.log('   ✓ Alumni identity verified\n')

  // 6. Test Jobs Listing
  console.log('6. Testing Jobs Feed (/jobs)...')
  const jobsRes = await request('/jobs', {
    headers: { Authorization: `Bearer ${tokens.STUDENT}` },
  })
  assert.equal(jobsRes.status, 200)
  const jobList = jobsRes.body.data?.items || jobsRes.body.data || []
  assert.ok(jobList.length >= 8, `Expected at least 8 jobs, found ${jobList.length}`)
  console.log(`   ✓ Found ${jobList.length} jobs in system\n`)

  // 7. Test Events Listing
  console.log('7. Testing Events Feed (/events)...')
  const eventsRes = await request('/events', {
    headers: { Authorization: `Bearer ${tokens.ALUMNI}` },
  })
  assert.equal(eventsRes.status, 200)
  const eventList = eventsRes.body.data?.items || eventsRes.body.data || []
  assert.ok(eventList.length >= 4, `Expected at least 4 events, found ${eventList.length}`)
  console.log(`   ✓ Found ${eventList.length} events in system\n`)

  // 8. Test Forgot Password
  console.log('8. Testing Forgot Password (/auth/forgot-password)...')
  const forgotRes = await request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: 'alumni.demo@alumniportal.test' }),
  })
  assert.equal(forgotRes.status, 200)
  assert.equal(forgotRes.body.success, true)
  console.log('   ✓ Forgot password email accepted cleanly\n')

  // 9. Test Verify Email with invalid token
  console.log('9. Testing Verify Email with invalid token...')
  const verifyRes = await request('/auth/verify-email?token=invalid-sample-token-value-here')
  assert.equal(verifyRes.status, 400)
  assert.equal(verifyRes.body.success, false)
  console.log('   ✓ Invalid verification token properly rejected with 400\n')

  console.log('========================================================')
  console.log('ALL END-TO-END DEMO & AUTHENTICATION SCENARIOS VERIFIED!')
  console.log('========================================================')
}

run().catch((err) => {
  console.error('E2E Verification Failed:', err)
  process.exit(1)
})
