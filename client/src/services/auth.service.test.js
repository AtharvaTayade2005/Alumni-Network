import { describe, it, expect, beforeEach } from 'vitest'
import { authService } from './auth.service.js'
import { ROLES } from '../utils/roles.js'

// Simple mock for browser localStorage in Node test runner
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
}

describe('Client Vitest: Authentication Service Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('TC-CLIENT-01: getSession retrieves default Student persona when unauthenticated', async () => {
    const res = await authService.getSession()
    expect(res.data).toBeDefined()
    expect(res.data.roles).toContain(ROLES.STUDENT)
    expect(localStorage.getItem('alumni_active_user_id')).toBe(res.data.id)
  })

  it('TC-CLIENT-02: login stores active user id and returns accessToken', async () => {
    const res = await authService.login({ email: 'riya.student@vit.edu', password: 'AnyPassword123!' })
    expect(res.data).toBeDefined()
    expect(res.data.accessToken).toBe('mock_jwt_token')
    expect(localStorage.getItem('alumni_active_user_id')).toBe(res.data.user.id)
  })

  it('TC-CLIENT-03: register adds new student user and establishes active session', async () => {
    const payload = {
      firstName: 'Aarav',
      lastName: 'Patel',
      email: 'aarav.patel@vit.edu',
      role: ROLES.STUDENT,
      department: 'Computer Engineering',
      graduationYear: 2026,
    }

    const res = await authService.register(payload)
    expect(res.data.user.name).toBe('Aarav Patel')
    expect(res.data.user.role).toBe(ROLES.STUDENT)
    expect(res.data.user.verified).toBe(true)
    expect(localStorage.getItem('alumni_active_user_id')).toBe(res.data.user.id)
  })

  it('TC-CLIENT-04: register sets verified=false for alumni accounts pending verification', async () => {
    const payload = {
      firstName: 'Vikram',
      lastName: 'Malhotra',
      email: 'vikram.alum@example.com',
      role: ROLES.ALUMNI,
      department: 'Electronics',
      graduationYear: 2019,
    }

    const res = await authService.register(payload)
    expect(res.data.user.role).toBe(ROLES.ALUMNI)
    expect(res.data.user.verified).toBe(false)
  })

  it('TC-CLIENT-05: logout removes active user session from localStorage', async () => {
    localStorage.setItem('alumni_active_user_id', 'some_user_123')
    const res = await authService.logout()
    expect(res.message).toBe('Logged out successfully')
    expect(localStorage.getItem('alumni_active_user_id')).toBeNull()
  })

  it('TC-CLIENT-06: switchDemoUser switches active persona to ALUMNI', async () => {
    const res = await authService.switchDemoUser(ROLES.ALUMNI)
    expect(res.data).toBeDefined()
    expect(res.data.roles).toContain(ROLES.ALUMNI)
    expect(localStorage.getItem('alumni_active_user_id')).toBe(res.data.id)
  })
})
