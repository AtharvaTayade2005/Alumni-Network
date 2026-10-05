/**
 * Live smoke test against a running server. Not part of `npm test`: that suite
 * boots its own database and app. This script only talks to whatever is already
 * listening, so it can be pointed at a deployed environment too.
 *
 *   node scripts/smoke.js [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:5000/api'

let failures = 0

function check(label, condition, detail) {
  const mark = condition ? 'PASS' : 'FAIL'
  if (!condition) failures += 1
  console.log(`${mark}  ${label}${detail ? ` -> ${detail}` : ''}`)
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, body: json }
}

const health = await call('/health')
check('health returns 200', health.status === 200, health.status)
check('database connected', health.body?.data?.checks?.database === 'connected')

const login = await call('/auth/login', {
  method: 'POST',
  body: { email: 'admin@alumni.local', password: 'DevPassw0rd!' },
})
check('seeded admin can sign in', login.status === 200, login.status)
const adminToken = login.body?.data?.accessToken
check('an access token is issued', Boolean(adminToken))
check('account status is reported',
  login.body?.data?.user?.accountStatus === 'ACTIVE',
  login.body?.data?.user?.accountStatus)

const me = await call('/auth/me', { token: adminToken })
check('me returns the caller', me.body?.data?.user?.email === 'admin@alumni.local')
check('me omits the password hash', !JSON.stringify(me.body).includes('password_hash'))

const anonymous = await call('/admin/users')
check('admin route rejects anonymous with 401', anonymous.status === 401, anonymous.status)
check('error envelope carries a code', anonymous.body?.error?.code === 'UNAUTHENTICATED')

const forbidden = await call('/admin/users', {
  headers: { 'x-user-role': 'ADMIN' },
})
check('forged role header does not grant access', forbidden.status === 401, forbidden.status)

const students = await call('/auth/login', {
  method: 'POST',
  body: { email: 'student@alumni.local', password: 'DevPassw0rd!' },
})
check('seeded student can sign in', students.status === 200, students.status)

const denied = await call('/admin/users', { token: students.body?.data?.accessToken })
check('student gets 403 on an admin route', denied.status === 403, denied.status)
check('error envelope carries FORBIDDEN', denied.body?.error?.code === 'FORBIDDEN')

const listed = await call('/admin/users?limit=5', { token: adminToken })
check('admin may list users', listed.status === 200, listed.status)
check('pagination metadata present', typeof listed.body?.meta?.total === 'number')
check('no password hashes leak', !JSON.stringify(listed.body).includes('password_hash'))

const badRole = await call('/auth/register', {
  method: 'POST',
  body: {
    firstName: 'Smoke', lastName: 'Admin', email: 'smoke.admin@example.edu',
    password: 'Str0ngPass!23', role: 'ADMIN', graduationYear: 2015, acceptTerms: true,
  },
})
check('self-registration as ADMIN is rejected', badRole.status === 422, badRole.status)

const weak = await call('/auth/register', {
  method: 'POST',
  body: {
    firstName: 'Weak', lastName: 'Pass', email: 'smoke.weak@example.edu',
    password: 'password', role: 'STUDENT', yearOfStudy: 2, acceptTerms: true,
  },
})
check('weak password is rejected', weak.status === 422, weak.status)

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exitCode = failures === 0 ? 0 : 1