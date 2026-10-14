import { seedRolesInteractions } from '../src/scripts/seed-roles-interactions.js'
import { closePool } from '../src/config/database.js'

async function run() {
  try {
    // 1. Reset interactions to clean state
    await seedRolesInteractions()

    // 2. Login as student
    const sRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student.test@alumni.edu', password: 'Password123!' })
    })
    const sData = await sRes.json()
    const studentToken = sData.data.accessToken

    // 3. Login as alumni
    const aRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alumni.test@alumni.edu', password: 'Password123!' })
    })
    const aData = await aRes.json()
    const alumniToken = aData.data.accessToken
    const alumniId = aData.data.user.id

    console.log('Testing Variant A: standard camelCase payload...')
    const resA = await fetch('http://localhost:5000/api/mentorship/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studentToken
      },
      body: JSON.stringify({
        mentorId: alumniId,
        careerGoal: 'I want to build a career in distributed systems and cloud architecture at scale.',
        areaOfInterest: 'Distributed Systems',
        preferredMode: 'video',
        message: 'Looking forward to learning from your experience at Google!'
      })
    })
    const dataA = await resA.json()
    console.log('Variant A status:', resA.status, 'success:', dataA.success, 'reqId:', dataA.data?.id)

    // Cancel request A to test Variant B
    await fetch('http://localhost:5000/api/mentorship/requests/' + dataA.data.id + '/cancel', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + studentToken }
    })

    console.log('Testing Variant B: snake_case with topics array & frequency...')
    const resB = await fetch('http://localhost:5000/api/mentorship/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studentToken
      },
      body: JSON.stringify({
        mentor_id: alumniId,
        career_goal: 'Preparing for tech lead systems design interviews in 2027.',
        topics: ['Distributed Systems', 'Cloud Architecture'],
        preferred_frequency: 'monthly',
        notes: 'Excited to connect with you!'
      })
    })
    const dataB = await resB.json()
    console.log('Variant B status:', resB.status, 'success:', dataB.success, 'reqId:', dataB.data?.id)

    // Cancel request B to test Variant C
    await fetch('http://localhost:5000/api/mentorship/requests/' + dataB.data.id + '/cancel', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + studentToken }
    })

    console.log('Testing Variant C: goal/objective aliases...')
    const resC = await fetch('http://localhost:5000/api/mentorship', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studentToken
      },
      body: JSON.stringify({
        mentorId: alumniId,
        goal: 'I am aiming to become a principal systems engineer in big tech.',
        frequency: 'monthly',
        mode: 'in_person'
      })
    })
    const dataC = await resC.json()
    console.log('Variant C status:', resC.status, 'success:', dataC.success, 'reqId:', dataC.data?.id)

    // Check alumni incoming requests
    const checkRes = await fetch('http://localhost:5000/api/mentorship/requests?status=pending', {
      headers: { 'Authorization': 'Bearer ' + alumniToken }
    })
    const checkData = await checkRes.json()
    console.log('Alumni pending requests count:', checkData.data?.length)

    // Test error formatting with short career goal
    console.log('Testing error response details on invalid short goal...')
    const errRes = await fetch('http://localhost:5000/api/mentorship', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studentToken
      },
      body: JSON.stringify({
        mentorId: alumniId,
        goal: 'short'
      })
    })
    const errData = await errRes.json()
    console.log('Error status:', errRes.status)
    console.log('Error issues:', errData.errors)
    const clientFormattedError = errData.errors?.map(e => `${e.path || e.param || e.field}: ${e.msg || e.message}`).join(', ')
    console.log('Client-formatted error string:', clientFormattedError)

    await closePool()
    process.exit(0)
  } catch (err) {
    console.error('Test error:', err)
    await closePool()
    process.exit(1)
  }
}

run()
