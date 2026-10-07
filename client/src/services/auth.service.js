import { db, DEMO_PRESET_USERS } from '../data/index.js'
import { ROLES } from '../utils/roles.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const authService = {
  async getSession() {
    await delay()
    const storedUserId = localStorage.getItem('alumni_active_user_id')
    const users = db.get('users')
    let user = users.find((u) => u.id === storedUserId)
    if (!user) {
      // Default to Student persona (Riya Shah)
      user = DEMO_PRESET_USERS[ROLES.STUDENT]
      localStorage.setItem('alumni_active_user_id', user.id)
    }
    return { data: user }
  },

  async switchDemoUser(userIdOrRole) {
    await delay()
    const users = db.get('users')
    let user = users.find((u) => u.id === userIdOrRole)
    if (!user && DEMO_PRESET_USERS[userIdOrRole]) {
      user = DEMO_PRESET_USERS[userIdOrRole]
    }
    if (!user) {
      user = users[0]
    }
    localStorage.setItem('alumni_active_user_id', user.id)
    return { data: user }
  },

  async getDemoUsers() {
    await delay()
    return { data: db.get('users') }
  },

  async login(credentials) {
    await delay(120)
    const users = db.get('users')
    const user = users.find((u) => u.email.toLowerCase() === credentials.email?.toLowerCase())
    if (!user) {
      // If not found, return demo student
      const fallback = users[0]
      localStorage.setItem('alumni_active_user_id', fallback.id)
      return { data: { user: fallback, accessToken: 'mock_jwt_token' } }
    }
    localStorage.setItem('alumni_active_user_id', user.id)
    return { data: { user, accessToken: 'mock_jwt_token' } }
  },

  async register(payload) {
    await delay(150)
    const newUser = {
      id: `u_${Date.now()}`,
      name: `${payload.firstName} ${payload.lastName}`.trim() || 'New Member',
      email: payload.email,
      roles: [payload.role || ROLES.STUDENT],
      role: payload.role || ROLES.STUDENT,
      headline: `${payload.role || 'Student'} at Vidyalankar Institute of Technology`,
      department: payload.department || 'General',
      graduationYear: Number(payload.graduationYear) || 2026,
      verified: payload.role === ROLES.ALUMNI ? false : true,
      isEmailVerified: true,
      city: 'Mumbai',
      country: 'India',
      memberSince: 'Just now',
    }
    db.insert('users', newUser)
    localStorage.setItem('alumni_active_user_id', newUser.id)
    return { data: { user: newUser, accessToken: 'mock_jwt_token' } }
  },

  async logout() {
    await delay()
    localStorage.removeItem('alumni_active_user_id')
    return { message: 'Logged out successfully' }
  },

  async me() {
    return this.getSession()
  },
}
