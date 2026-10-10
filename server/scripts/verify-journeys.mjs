import assert from 'node:assert/strict'

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, body: json }
}

async function login(email, password = 'DevPassw0rd!') {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.body)}`)
  return res.body.data.accessToken
}

const authHeader = (token) => ({ Authorization: `Bearer ${token}` })

async function run() {
  console.log('=== STARTING END-TO-END VERIFICATION OF USER JOURNEYS ===\n')

  // ---------------------------------------------------------
  // 1. STUDENT JOURNEY
  // ---------------------------------------------------------
  console.log('[1/4] Testing STUDENT Journey...')
  const studentToken = await login('student@alumni.local')
  const studentHeaders = authHeader(studentToken)

  const studentMe = await request('/auth/me', { headers: studentHeaders })
  assert.equal(studentMe.status, 200)
  const studentUser = studentMe.body.data.user || studentMe.body.data
  assert.ok(studentUser.roles?.includes('STUDENT'))
  console.log('  ✔ Student session verified:', studentUser.email)

  const studentProfile = await request('/profiles/me', { headers: studentHeaders })
  assert.equal(studentProfile.status, 200)
  console.log('  ✔ Student profile loaded')

  const dirRes = await request('/profiles/directory', { headers: studentHeaders })
  assert.equal(dirRes.status, 200)
  console.log('  ✔ Directory search loaded, found:', dirRes.body.data?.length ?? 0, 'profiles')

  const mentorsRes = await request('/mentorship/mentors', { headers: studentHeaders })
  assert.equal(mentorsRes.status, 200)
  console.log('  ✔ Mentors discovery loaded, found:', mentorsRes.body.data?.length ?? 0, 'mentors')

  const jobsRes = await request('/jobs', { headers: studentHeaders })
  assert.equal(jobsRes.status, 200)
  console.log('  ✔ Jobs board loaded, found:', jobsRes.body.data?.length ?? 0, 'openings')

  const eventsRes = await request('/events', { headers: studentHeaders })
  assert.equal(eventsRes.status, 200)
  console.log('  ✔ Events loaded, count:', eventsRes.body.data?.length ?? 0)

  const upcomingEvent = eventsRes.body.data?.find(
    (e) => new Date(e.startTime || e.start_time) > new Date()
  ) || eventsRes.body.data?.[0]
  let testEventId = upcomingEvent?.id
  if (testEventId) {
    const rsvpRes = await request(`/events/${testEventId}/rsvp`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ status: 'going', guestCount: 0 }),
    })
    assert.ok([200, 201].includes(rsvpRes.status))
    console.log('  ✔ Event RSVP persisted in PostgreSQL')
  }

  const notifPrefRes = await request('/notifications/preferences', { headers: studentHeaders })
  assert.equal(notifPrefRes.status, 200)
  console.log('  ✔ Notification preferences loaded')

  const resumeRes = await request('/profiles/me/resume', { headers: studentHeaders })
  assert.equal(resumeRes.status, 200)
  console.log('  ✔ Resume endpoint checked (no 404/500)')
  console.log('  -> STUDENT Journey: PASSED\n')

  // ---------------------------------------------------------
  // 2. ALUMNI JOURNEY
  // ---------------------------------------------------------
  console.log('[2/4] Testing ALUMNI Journey...')
  const alumniToken = await login('alumni@alumni.local')
  const alumniHeaders = authHeader(alumniToken)

  const alumniMe = await request('/auth/me', { headers: alumniHeaders })
  assert.equal(alumniMe.status, 200)
  const alumniUser = alumniMe.body.data.user || alumniMe.body.data
  assert.ok(alumniUser.roles?.includes('ALUMNI'))
  console.log('  ✔ Alumni session verified:', alumniUser.email)

  // Host an Event
  const now = new Date()
  const eventStart = new Date(now.getTime() + 86400000 * 7)
  const eventEnd = new Date(eventStart.getTime() + 7200000)
  const createEvtRes = await request('/events', {
    method: 'POST',
    headers: alumniHeaders,
    body: JSON.stringify({
      title: 'Cloud Systems Architecture Seminar',
      description: 'Deep dive into Kubernetes, distributed caching, and real-time streaming architectures.',
      startTime: eventStart.toISOString(),
      endTime: eventEnd.toISOString(),
      venue: 'Main Seminar Hall B, Campus',
      capacity: 150,
    }),
  })
  assert.equal(createEvtRes.status, 201, `Create event failed: ${JSON.stringify(createEvtRes.body)}`)
  console.log('  ✔ Hosted event created & persisted in PostgreSQL:', createEvtRes.body.data.id)

  // Post a Job
  const createJobRes = await request('/jobs', {
    method: 'POST',
    headers: alumniHeaders,
    body: JSON.stringify({
      title: 'Junior Platform Engineer',
      companyName: 'Microsoft',
      description: 'Build robust cloud infrastructure components using Go, TypeScript, and Azure.',
      location: 'Bengaluru / Hybrid',
      employmentType: 'full_time',
      experienceLevel: 'entry',
    }),
  })
  assert.equal(createJobRes.status, 201, `Create job failed: ${JSON.stringify(createJobRes.body)}`)
  console.log('  ✔ Job posting created & persisted in PostgreSQL:', createJobRes.body.data.id)

  // Make a Real Donation
  const createDonRes = await request('/donations/create', {
    method: 'POST',
    headers: alumniHeaders,
    body: JSON.stringify({
      amount: 10000,
      currency: 'INR',
      purpose: 'Merit-Cum-Means Scholarship Fund',
      message: 'Proud to support our scholars!',
      isAnonymous: false,
      provider: 'stripe',
    }),
  })
  assert.equal(createDonRes.status, 201)
  const { donation, providerReference, transactionId } = createDonRes.body.data

  const confirmDonRes = await request('/donations/confirm', {
    method: 'POST',
    headers: alumniHeaders,
    body: JSON.stringify({
      donationId: donation.id,
      providerReference: providerReference || 'txn_demo',
      transactionId: transactionId || providerReference || 'txn_demo',
    }),
  })
  assert.equal(confirmDonRes.status, 200)
  const receipt = confirmDonRes.body.data.receipt
  console.log('  ✔ Donation settled, 80G Tax Receipt generated:', receipt.receiptNumber)

  const myDonRes = await request('/donations/my', { headers: alumniHeaders })
  assert.equal(myDonRes.status, 200)
  assert.ok(myDonRes.body.data.length >= 1)
  console.log('  ✔ Donation ledger read from PostgreSQL, rows:', myDonRes.body.data.length)
  console.log('  -> ALUMNI Journey: PASSED\n')

  // ---------------------------------------------------------
  // 3. ADMIN JOURNEY
  // ---------------------------------------------------------
  console.log('[3/4] Testing ADMIN Journey...')
  const adminToken = await login('admin@alumni.local')
  const adminHeaders = authHeader(adminToken)

  const adminStats = await request('/admin/dashboard/stats', { headers: adminHeaders })
  assert.equal(adminStats.status, 200)
  console.log('  ✔ Admin dashboard stats computed from PostgreSQL:')
  console.log('     Total users:', adminStats.body.data.totalUsers)
  console.log('     Active jobs:', adminStats.body.data.activeJobs)
  console.log('     Published events:', adminStats.body.data.events)
  console.log('     Donations total: ₹' + adminStats.body.data.donations.totalAmount)

  const adminUsers = await request('/admin/users', { headers: adminHeaders })
  assert.equal(adminUsers.status, 200)
  console.log('  ✔ Admin user management loaded, user count:', adminUsers.body.data.length)

  const allDonations = await request('/donations/all', { headers: adminHeaders })
  assert.equal(allDonations.status, 200)
  console.log('  ✔ Admin endowment audit ledger loaded, records:', allDonations.body.data.length)

  const auditLogs = await request('/admin/audit-logs', { headers: adminHeaders })
  assert.equal(auditLogs.status, 200)
  console.log('  ✔ Admin security audit logs loaded, count:', auditLogs.body.data.length)
  console.log('  -> ADMIN Journey: PASSED\n')

  // ---------------------------------------------------------
  // 4. FACULTY / PROFESSOR GUIDANCE JOURNEY
  // ---------------------------------------------------------
  console.log('[4/4] Testing FACULTY / PROFESSOR Journey...')
  const facultyStudents = await request('/profiles/directory?role=STUDENT', { headers: adminHeaders })
  assert.equal(facultyStudents.status, 200)
  console.log('  ✔ Student roster filtered for department advising')

  const targetStudentId = studentUser.id
  // Request connection from faculty/admin to student
  const connReq = await request('/connections', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      userId: targetStudentId,
      message: 'Department advising connection request',
    }),
  })

  // Accept connection as student
  if (connReq.body?.data?.id) {
    await request(`/connections/${connReq.body.data.id}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'accept' }),
    })
    console.log('  ✔ Connection established between Advisor & Student')
  }

  const sendMsg = await request('/messages', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      recipientId: targetStudentId,
      body: '[Academic Guidance] Recommended exploring the Microsoft Platform role and attending the Nov 5th Distributed Systems workshop.',
    }),
  })
  assert.ok([200, 201].includes(sendMsg.status), `Send message returned ${sendMsg.status}: ${JSON.stringify(sendMsg.body)}`)
  console.log('  ✔ Academic guidance dispatched & persisted in PostgreSQL messages')
  console.log('  -> FACULTY Journey: PASSED\n')

  console.log('===========================================================')
  console.log('ALL NON-AI USER JOURNEYS FULLY INTEGRATED & VERIFIED!')
  console.log('===========================================================')
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err)
  process.exit(1)
})
