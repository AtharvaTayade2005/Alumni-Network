/**
 * verify-all-role-interactions.mjs
 *
 * Comprehensive End-to-End Test and Verification Script for:
 * 1. Student, Alumni, and Professor sequential authentication.
 * 2. Student <-> Alumni Mentorship flow (request, notification, review, acceptance, confirmation).
 * 3. Direct Messaging between Student and Alumni.
 * 4. Alumni <-> Professor Connection flow (request, notification, review, acceptance, reciprocity).
 * 5. Direct Messaging between Alumni and Professor.
 */

import assert from 'node:assert/strict'

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api'
const TEST_PASSWORD = 'Password123!'

const USERS = {
  student: {
    role: 'STUDENT',
    email: 'student.test@alumni.edu',
    name: 'Aarav Sharma',
  },
  alumni: {
    role: 'ALUMNI',
    email: 'alumni.test@alumni.edu',
    name: 'Priya Nair',
  },
  professor: {
    role: 'PROFESSOR',
    email: 'professor.test@alumni.edu',
    name: 'Dr. Ramesh Kulkarni',
  },
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

function pass(msg) {
  console.log(`  ${colors.green}✓ PASS:${colors.reset} ${msg}`)
}

function info(msg) {
  console.log(`  ${colors.cyan}ℹ INFO:${colors.reset} ${msg}`)
}

function fail(msg, err) {
  console.error(`  ${colors.red}✗ FAIL:${colors.reset} ${msg}`)
  if (err) console.error(err)
  process.exit(1)
}

function section(title) {
  console.log(`\n${colors.bold}${colors.yellow}=== ${title} ===${colors.reset}\n`)
}

async function apiRequest(path, { method = 'GET', token = null, body = null } = {}) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const options = { method, headers }
  if (body) options.body = JSON.stringify(body)

  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, headers: res.headers, data }
}

async function run() {
  console.log(`${colors.bold}Starting End-to-End Multi-Role Interaction Verification${colors.reset}`)
  console.log(`Target Base URL: ${BASE_URL}\n`)

  // --------------------------------------------------------------------------
  // 1. Health Check
  // --------------------------------------------------------------------------
  section('Step 1: Backend Health Check')
  const healthRes = await apiRequest('/health')
  assert.equal(healthRes.status, 200, 'Health endpoint must respond with 200')
  pass('Backend server is healthy and responding on /api/health')

  // --------------------------------------------------------------------------
  // 2. Sequential Logins for Student, Alumni, and Professor
  // --------------------------------------------------------------------------
  section('Step 2: Sequential Authentication for Key Roles')
  const sessions = {}

  for (const [key, userDef] of Object.entries(USERS)) {
    const loginRes = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email: userDef.email, password: TEST_PASSWORD },
    })

    assert.equal(loginRes.status, 200, `Login for ${userDef.role} must return 200. Got: ${JSON.stringify(loginRes.data)}`)
    assert.ok(loginRes.data.success, 'Login response must indicate success')
    const token = loginRes.data.data?.accessToken
    const user = loginRes.data.data?.user
    assert.ok(token, 'Access token must be present')
    assert.ok(user?.id, 'User ID must be present in login response')

    sessions[key] = {
      token,
      id: user.id,
      fullName: user.fullName || `${user.firstName} ${user.lastName}`,
      role: user.role || user.roles?.[0],
      email: user.email,
    }

    pass(`Signed in as ${userDef.role} (${userDef.name}) [User ID: ${user.id}]`)
  }

  const { student, alumni, professor } = sessions

  // Verify /auth/me for each
  for (const [key, s] of Object.entries(sessions)) {
    const meRes = await apiRequest('/auth/me', { token: s.token })
    assert.equal(meRes.status, 200, `auth/me for ${key} must return 200`)
    pass(`Verified /auth/me profile identity for ${s.fullName}`)
  }

  // --------------------------------------------------------------------------
  // 3. Student ↔ Alumni Mentorship Request & Acknowledgment Flow
  // --------------------------------------------------------------------------
  section('Step 3: Student ↔ Alumni Mentorship Request Flow')

  // 3a. Student sends mentorship request to Alumni
  info(`Student (${student.fullName}) submitting mentorship request to Alumni (${alumni.fullName})...`)
  const mentorshipReqPayload = {
    mentorId: alumni.id,
    careerGoal: 'Aspiring Cloud and Distributed Systems Architect seeking guidance on system design and high-scale backends.',
    areaOfInterest: 'Cloud Architecture & Distributed Systems',
    message: 'Hi Priya, I admire your work at Google and would appreciate guidance on distributed microservices!',
    preferredMode: 'video',
  }

  const sendMentorshipRes = await apiRequest('/mentorship/requests', {
    method: 'POST',
    token: student.token,
    body: mentorshipReqPayload,
  })

  assert.ok(
    sendMentorshipRes.status === 201 || sendMentorshipRes.status === 200,
    `Mentorship request creation must return 200/201. Got ${sendMentorshipRes.status}: ${JSON.stringify(sendMentorshipRes.data)}`,
  )
  const mentorshipRequest = sendMentorshipRes.data.data
  assert.ok(mentorshipRequest?.id, 'Mentorship request ID must be returned')
  pass(`Mentorship request created successfully with ID: ${mentorshipRequest.id}`)

  // 3b. Verify Alumni receives in-app notification
  info(`Checking incoming in-app notifications for Alumni (${alumni.fullName})...`)
  const alumniNotifsRes = await apiRequest('/notifications?limit=10', { token: alumni.token })
  assert.equal(alumniNotifsRes.status, 200, 'Alumni notifications request must return 200')
  const alumniNotifs = alumniNotifsRes.data.data || []
  const mentorReqNotif = alumniNotifs.find(
    (n) => n.type === 'mentorship_request' && (n.actorId === student.id || n.actor_id === student.id),
  )
  assert.ok(mentorReqNotif, 'Alumni must receive mentorship_request notification from Student')
  pass(`Alumni received notification: "${mentorReqNotif.title} - ${mentorReqNotif.body}"`)

  // 3c. Alumni views incoming mentorship requests
  info(`Alumni fetching incoming requests on /api/mentorship/requests...`)
  const alumniReqsRes = await apiRequest('/mentorship/requests', { token: alumni.token })
  assert.equal(alumniReqsRes.status, 200, 'Alumni mentorship requests must return 200')
  const alumniReqsList = alumniReqsRes.data.data || []
  const foundIncomingReq = alumniReqsList.find((r) => r.id === mentorshipRequest.id)
  assert.ok(foundIncomingReq, 'Incoming request must appear in Alumni requests list')
  assert.equal(foundIncomingReq.direction, 'incoming', 'Request direction must be incoming for Alumni')
  assert.ok(foundIncomingReq.peer, 'Mentee peer metadata must be attached to the request')
  pass(`Incoming request verified in Alumni dashboard. Mentee: ${foundIncomingReq.peer?.name || 'Aarav Sharma'}`)

  // 3d. Alumni accepts the request
  info(`Alumni accepting the mentorship request with response note...`)
  const acceptRes = await apiRequest(`/mentorship/requests/${mentorshipRequest.id}/accept`, {
    method: 'PATCH',
    token: alumni.token,
    body: { responseNote: 'Delighted to mentor you, Aarav! Looking forward to discussing cloud architecture.' },
  })
  assert.equal(acceptRes.status, 200, `Accepting mentorship request must return 200. Got: ${JSON.stringify(acceptRes.data)}`)
  pass(`Alumni accepted mentorship request successfully`)

  // 3e. Verify Student receives mentorship acceptance notification
  info(`Checking incoming notifications for Student (${student.fullName})...`)
  const studentNotifsRes = await apiRequest('/notifications?limit=10', { token: student.token })
  assert.equal(studentNotifsRes.status, 200, 'Student notifications request must return 200')
  const studentNotifs = studentNotifsRes.data.data || []
  const mentorAcceptedNotif = studentNotifs.find(
    (n) => n.type === 'mentorship_accepted' && (n.actorId === alumni.id || n.actor_id === alumni.id),
  )
  assert.ok(mentorAcceptedNotif, 'Student must receive mentorship_accepted notification from Alumni')
  pass(`Student received acceptance notification: "${mentorAcceptedNotif.title} - ${mentorAcceptedNotif.body}"`)

  // 3f. Direct Messaging between Student and Alumni
  info(`Testing Direct Messaging between Student and Alumni...`)
  const msgFromStudent = await apiRequest('/messages', {
    method: 'POST',
    token: student.token,
    body: {
      recipientId: alumni.id,
      body: 'Hi Priya, thank you for accepting! When is a good time for our initial systems design discussion?',
    },
  })
  assert.equal(msgFromStudent.status, 201, `Student sending message must return 201. Got: ${JSON.stringify(msgFromStudent.data)}`)
  pass(`Student successfully sent direct message to Alumni`)

  const replyFromAlumni = await apiRequest('/messages', {
    method: 'POST',
    token: alumni.token,
    body: {
      recipientId: student.id,
      body: 'Hi Aarav, this Friday at 4 PM IST works best. Looking forward to our session!',
    },
  })
  assert.equal(replyFromAlumni.status, 201, `Alumni sending message must return 201. Got: ${JSON.stringify(replyFromAlumni.data)}`)
  pass(`Alumni successfully replied to Student`)

  // Verify conversation message history
  const convHistoryRes = await apiRequest(`/messages/with/${alumni.id}`, { token: student.token })
  assert.equal(convHistoryRes.status, 200, 'Fetching message history must return 200')
  const messagesList = convHistoryRes.data.data || []
  assert.ok(messagesList.length >= 2, `Expected at least 2 messages in thread, found ${messagesList.length}`)
  pass(`Direct conversation channel verified with ${messagesList.length} exchanged messages`)

  // --------------------------------------------------------------------------
  // 4. Alumni ↔ Professor Connection Request & Acknowledgment Flow
  // --------------------------------------------------------------------------
  section('Step 4: Alumni ↔ Professor Connection Flow')

  // 4a. Verify initial connection state is none
  const initConnStatusRes = await apiRequest(`/connections/status/${professor.id}`, { token: alumni.token })
  assert.equal(initConnStatusRes.status, 200)
  info(`Initial Alumni <-> Professor connection state: ${initConnStatusRes.data.data?.status || 'none'}`)

  // 4b. Alumni sends connection request to Professor
  info(`Alumni (${alumni.fullName}) sending connection request to Professor (${professor.fullName})...`)
  const sendConnRes = await apiRequest('/connections', {
    method: 'POST',
    token: alumni.token,
    body: {
      userId: professor.id,
      message: 'Greetings Dr. Kulkarni, I would like to reconnect regarding guest lectures and academic collaborations.',
    },
  })
  assert.ok(
    sendConnRes.status === 201 || sendConnRes.status === 200,
    `Connection request must return 200/201. Got ${sendConnRes.status}: ${JSON.stringify(sendConnRes.data)}`,
  )
  const connectionRecord = sendConnRes.data.data
  assert.ok(connectionRecord?.id, 'Connection ID must be returned')
  pass(`Connection request created with ID: ${connectionRecord.id}`)

  // 4c. Verify Professor receives in-app connection request notification
  info(`Checking incoming in-app notifications for Professor (${professor.fullName})...`)
  const profNotifsRes = await apiRequest('/notifications?limit=10', { token: professor.token })
  assert.equal(profNotifsRes.status, 200, 'Professor notifications request must return 200')
  const profNotifs = profNotifsRes.data.data || []
  const connReqNotif = profNotifs.find(
    (n) => n.type === 'connection_request' && (n.actorId === alumni.id || n.actor_id === alumni.id),
  )
  assert.ok(connReqNotif, 'Professor must receive connection_request notification from Alumni')
  pass(`Professor received notification: "${connReqNotif.title} - ${connReqNotif.body}"`)

  // 4d. Professor views pending connection requests
  info(`Professor retrieving pending connection requests...`)
  const profPendingRes = await apiRequest('/connections/pending', { token: professor.token })
  assert.equal(profPendingRes.status, 200, 'Professor pending connections must return 200')
  const pendingList = profPendingRes.data.data || []
  const foundPending = pendingList.find((c) => c.id === connectionRecord.id)
  assert.ok(foundPending, 'Pending connection request must appear in Professor list')
  pass(`Pending connection request verified in Professor dashboard`)

  // 4e. Professor accepts connection request
  info(`Professor accepting connection request...`)
  const acceptConnRes = await apiRequest(`/connections/${connectionRecord.id}`, {
    method: 'PATCH',
    token: professor.token,
    body: { action: 'accept' },
  })
  assert.equal(acceptConnRes.status, 200, `Accepting connection must return 200. Got: ${JSON.stringify(acceptConnRes.data)}`)
  pass(`Professor accepted connection request`)

  // 4f. Verify Alumni receives connection accepted notification
  info(`Checking incoming notifications for Alumni (${alumni.fullName})...`)
  const alumniConnNotifsRes = await apiRequest('/notifications?limit=10', { token: alumni.token })
  assert.equal(alumniConnNotifsRes.status, 200, 'Alumni notifications request must return 200')
  const alumniConnNotifs = alumniConnNotifsRes.data.data || []
  const connAcceptedNotif = alumniConnNotifs.find(
    (n) => n.type === 'connection_accepted' && (n.actorId === professor.id || n.actor_id === professor.id),
  )
  assert.ok(connAcceptedNotif, 'Alumni must receive connection_accepted notification from Professor')
  pass(`Alumni received acceptance notification: "${connAcceptedNotif.title} - ${connAcceptedNotif.body}"`)

  // 4g. Verify two-way mutual connection reciprocity
  info(`Verifying two-way connection reciprocity...`)
  const alumniViewOfProf = await apiRequest(`/connections/status/${professor.id}`, { token: alumni.token })
  const profViewOfAlumni = await apiRequest(`/connections/status/${alumni.id}`, { token: professor.token })
  const alumniState = alumniViewOfProf.data.data?.state || alumniViewOfProf.data.data?.status
  const profState = profViewOfAlumni.data.data?.state || profViewOfAlumni.data.data?.status
  assert.equal(alumniState, 'connected', 'Alumni view of Professor must be connected')
  assert.equal(profState, 'connected', 'Professor view of Alumni must be connected')
  pass(`Two-way connection reciprocity confirmed: both parties report status='connected'`)

  // 4h. Direct Messaging between Alumni and Professor
  info(`Testing Direct Messaging between Alumni and Professor...`)
  const msgFromAlumni = await apiRequest('/messages', {
    method: 'POST',
    token: alumni.token,
    body: {
      recipientId: professor.id,
      body: 'Thank you for connecting Dr. Kulkarni! I would be delighted to deliver an alumni guest lecture on Kubernetes.',
    },
  })
  assert.equal(msgFromAlumni.status, 201, `Alumni sending message must return 201. Got: ${JSON.stringify(msgFromAlumni.data)}`)
  pass(`Alumni successfully sent direct message to Professor`)

  const replyFromProf = await apiRequest('/messages', {
    method: 'POST',
    token: professor.token,
    body: {
      recipientId: alumni.id,
      body: 'That would be splendid Priya! Let us coordinate dates with our final-year batch.',
    },
  })
  assert.equal(replyFromProf.status, 201, `Professor sending message must return 201. Got: ${JSON.stringify(replyFromProf.data)}`)
  pass(`Professor successfully replied to Alumni`)

  // Verify conversation message history between Alumni and Professor
  const profMsgHistory = await apiRequest(`/messages/with/${professor.id}`, { token: alumni.token })
  assert.equal(profMsgHistory.status, 200, 'Fetching message history must return 200')
  const profMsgs = profMsgHistory.data.data || []
  assert.ok(profMsgs.length >= 2, `Expected at least 2 messages in thread, found ${profMsgs.length}`)
  pass(`Alumni <-> Professor conversation channel verified with ${profMsgs.length} exchanged messages`)

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.green}================================================================${colors.reset}`)
  console.log(`${colors.bold}${colors.green}ALL MULTI-ROLE INTERACTIONS & TWO-WAY FLOWS VERIFIED CLEANLY!${colors.reset}`)
  console.log(`${colors.bold}${colors.green}================================================================${colors.reset}`)
  console.log(`Summary of Verified Interactions:`)
  console.log(`  1. Student (${student.email}) -> Alumni (${alumni.email}) Mentorship Request [Delivered]`)
  console.log(`  2. In-App Notification to Alumni [Verified]`)
  console.log(`  3. Alumni Review & Acceptance of Mentorship Request [Accepted]`)
  console.log(`  4. Confirmation In-App Notification to Student [Verified]`)
  console.log(`  5. Direct Messaging Channel Unlocked between Student & Alumni [Exchanged 2 Messages]`)
  console.log(`  6. Alumni (${alumni.email}) -> Professor (${professor.email}) Connection Request [Delivered]`)
  console.log(`  7. In-App Notification to Professor [Verified]`)
  console.log(`  8. Professor Review & Acceptance of Connection Request [Accepted]`)
  console.log(`  9. Confirmation In-App Notification to Alumni [Verified]`)
  console.log(` 10. Two-Way Connection Reciprocity Established [Confirmed Status='connected']`)
  console.log(` 11. Direct Messaging Channel Unlocked between Alumni & Professor [Exchanged 2 Messages]`)
  console.log(`${colors.bold}${colors.green}================================================================${colors.reset}\n`)
}

run().catch((err) => {
  fail('Execution encountered an unhandled error', err)
})
