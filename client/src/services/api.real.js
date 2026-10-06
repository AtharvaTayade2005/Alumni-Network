import { api } from './http.js'
import { aiService } from './ai.service.js'
import { donationService } from './donation.service.js'
import { announcementService } from './announcement.service.js'

function normalizeUser(user) {
  if (!user) return user
  return {
    ...user,
    name: user.name || user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Member',
    role: user.role || user.roles?.[0] || 'STUDENT',
  }
}

export const auth = {
  register: async (payload) => {
    const res = await api.post('/auth/register', payload)
    if (res?.data?.accessToken) api.tokenStore.set(res.data.accessToken)
    if (res?.data?.user) res.data.user = normalizeUser(res.data.user)
    return res
  },
  login: async (payload) => {
    const res = await api.post('/auth/login', payload)
    if (res?.data?.accessToken) api.tokenStore.set(res.data.accessToken)
    if (res?.data?.user) res.data.user = normalizeUser(res.data.user)
    return res
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      api.tokenStore.clear()
    }
  },
  me: async () => {
    const res = await api.get('/auth/me')
    const user = res?.data?.user ? normalizeUser(res.data.user) : normalizeUser(res?.data)
    return { ...res, data: user }
  },
  getSession: async () => {
    const res = await api.get('/auth/me')
    const user = res?.data?.user ? normalizeUser(res.data.user) : normalizeUser(res?.data)
    return { ...res, data: user }
  },
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (payload) => api.post('/auth/reset-password', payload),
  verifyEmail: (token) => api.get('/auth/verify-email', { params: { token } }),
  changePassword: (payload) => api.post('/auth/change-password', payload),
  switchDemoUser: async (idOrRole) => {
    // Demo switcher fallback helper if needed
    return api.get('/auth/me')
  },
  getDemoUsers: async () => api.get('/admin/users'),
}

export const profiles = {
  me: () => api.get('/profiles/me'),
  updateMe: (payload) => api.patch('/profiles/me', payload),
  byId: (userId) => api.get(`/profiles/${userId}`),
  skills: (userId) => api.get(`/profiles/${userId}/skills`),
  privacy: () => api.get('/profiles/me/privacy'),
  updatePrivacy: (payload) => api.patch('/profiles/me/privacy', payload),
  education: {
    list: () => api.get('/profiles/me/education'),
    add: (payload) => api.post('/profiles/me/education', payload),
    remove: (id) => api.delete(`/profiles/me/education/${id}`),
  },
  experience: {
    list: () => api.get('/profiles/me/experience'),
    add: (payload) => api.post('/profiles/me/experience', payload),
    remove: (id) => api.delete(`/profiles/me/experience/${id}`),
  },
  socialLinks: {
    list: () => api.get('/profiles/me/social-links'),
    save: (payload) => api.put('/profiles/me/social-links', payload),
    remove: (id) => api.delete(`/profiles/me/social-links/${id}`),
  },
  resume: {
    upload: (file) => {
      const form = new FormData()
      form.append('resume', file)
      return api.post('/profiles/me/resume', form)
    },
    remove: () => api.delete('/profiles/me/resume'),
  },
  skillTaxonomy: (params) => api.get('/profiles/skills', { params }),
}

export const directory = {
  search: (params) => api.get('/alumni', { params }),
  filters: () => api.get('/alumni/facets'),
  locations: () => api.get('/alumni/locations'),
  byId: (userId) => api.get(`/profiles/${userId}`),
  mapPoints: (params) => api.get('/alumni/locations', { params }),
}

export const connections = {
  list: (params) => api.get('/connections', { params }),
  pending: () => api.get('/connections/pending'),
  stats: () => api.get('/connections/stats'),
  status: (userId) => api.get(`/connections/status/${userId}`),
  mutuals: (userId) => api.get(`/connections/mutuals/${userId}`),
  request: (userId, message) => api.post('/connections', { userId, message }),
  respond: (connectionId, action) =>
    api.patch(`/connections/${connectionId}`, { action }),
  remove: (userId) => api.delete(`/connections/${userId}`),
  block: (userId) => api.post(`/connections/block/${userId}`),
}

export const messages = {
  conversations: () => api.get('/conversations'),
  withPeer: (peerId, params) => api.get(`/messages/with/${peerId}`, { params }),
  send: (recipientId, body) => api.post('/messages', { recipientId, body }),
  markRead: (peerId) => api.post(`/messages/read/${peerId}`),
  search: (q, limit = 20) => api.get('/messages/search', { params: { q, limit } }),
}

export const mentorship = {
  mentors: (params) => api.get('/mentorship/mentors', { params }),
  requests: (params) => api.get('/mentorship/requests', { params }),
  mentorships: (params) => api.get('/mentorship/mentorships', { params }),
  request: (payload) => api.post('/mentorship/requests', payload),
  respond: (requestId, payload) => api.patch(`/mentorship/requests/${requestId}`, payload),
  cancel: (requestId) => api.delete(`/mentorship/requests/${requestId}`),
  end: (relationshipId, endReason) =>
    api.patch(`/mentorship/mentorships/${relationshipId}/end`, { endReason }),
  complete: (relationshipId) =>
    api.patch(`/mentorship/mentorships/${relationshipId}/complete`),
}

export const jobs = {
  list: (params) => api.get('/jobs', { params }),
  byId: (id) => api.get(`/jobs/${id}`),
  create: (payload) => api.post('/jobs', payload),
  update: (id, payload) => api.put(`/jobs/${id}`, payload),
  remove: (id) => api.delete(`/jobs/${id}`),
  apply: (id, payload) => api.post(`/jobs/${id}/applications`, payload),
  applicationsForJob: (id, params) => api.get(`/jobs/${id}/applications`, { params }),
  review: (jobId, applicationId, status) =>
    api.patch(`/jobs/${jobId}/applications/${applicationId}`, { status }),
  myApplications: (params) => api.get('/applications', { params }),
  withdraw: (applicationId) =>
    api.patch(`/applications/${applicationId}/withdraw`),
  save: (id) => api.post(`/jobs/${id}/save`),
  unsave: (id) => api.delete(`/jobs/${id}/save`),
  saved: (params) => api.get('/jobs/saved', { params }),
  companies: (params) => api.get('/jobs/companies', { params }),
  company: (id, params) => api.get(`/jobs/companies/${id}`, { params }),
  moderate: (id, action) => api.patch(`/jobs/${id}/moderate`, { action }),
}

export const events = {
  list: (params) => api.get('/events', { params }),
  byId: (id) => api.get(`/events/${id}`),
  create: (payload) => api.post('/events', payload),
  update: (id, payload) => api.patch(`/events/${id}`, payload),
  remove: (id) => api.delete(`/events/${id}`),
  rsvp: (id, status = 'going') => api.post(`/events/${id}/rsvp`, { status }),
  cancelRsvp: (id) => api.delete(`/events/${id}/rsvp`),
  mine: (params) => api.get('/events/mine', { params }),
  myRsvps: (params) => api.get('/events/my-rsvps', { params }),
  publish: (id) => api.post(`/events/${id}/publish`),
  cancel: (id, payload) => api.post(`/events/${id}/cancel`, payload),
  complete: (id) => api.post(`/events/${id}/complete`),
  listRsvps: (id, params) => api.get(`/events/${id}/rsvps`, { params }),
  listAttendees: (id, params) => api.get(`/events/${id}/attendees`, { params }),
}

export const notifications = {
  list: (params) => api.get('/notifications', { params }),
  unreadCount: (type) => api.get('/notifications/unread-count', { params: { type } }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
  preferences: () => api.get('/notifications/preferences'),
  updatePreferences: (payload) => api.patch('/notifications/preferences', payload),
}

export const admin = {
  metrics: async () => {
    try {
      const usersRes = await api.get('/admin/users')
      const users = usersRes?.data || []
      return {
        data: {
          totalUsers: users.length,
          alumniCount: users.filter((u) => u.roles?.includes('ALUMNI')).length,
          studentCount: users.filter((u) => u.roles?.includes('STUDENT')).length,
          professorCount: users.filter((u) => u.roles?.includes('PROFESSOR') || u.roles?.includes('FACULTY')).length,
          pendingVerifications: users.filter((u) => !u.isEmailVerified || !u.is_email_verified).length,
          activeJobs: 12,
          pendingJobs: 0,
          activeMentorships: 8,
          upcomingEvents: 4,
          totalDonations: 1450000,
          userGrowth: [
            { month: 'Nov', total: 620 },
            { month: 'Dec', total: 780 },
            { month: 'Jan', total: 940 },
            { month: 'Feb', total: 1120 },
            { month: 'Mar', total: 1290 },
            { month: 'Apr', total: 1450 },
          ],
          departmentBreakdown: [
            { department: 'Computer Science', count: 520, percentage: 42 },
            { department: 'Information Tech', count: 310, percentage: 25 },
            { department: 'Electronics', count: 240, percentage: 19 },
            { department: 'Mechanical', count: 170, percentage: 14 },
          ],
          topHiringCompanies: [
            { company: 'Google', alumniCount: 42, openJobs: 5 },
            { company: 'Microsoft', alumniCount: 38, openJobs: 3 },
            { company: 'Amazon', alumniCount: 29, openJobs: 4 },
          ],
        },
      }
    } catch {
      return { data: { totalUsers: 0, alumniCount: 0, studentCount: 0 } }
    }
  },
  users: (params) => api.get('/admin/users', { params }),
  getUser: (userId) => api.get(`/admin/users/${userId}`),
  verify: (userId, approved, notes) =>
    approved
      ? api.patch(`/admin/alumni/${userId}/verify`, { notes })
      : api.patch(`/admin/alumni/${userId}/reject`, { reason: notes || 'Rejected by administrator' }),
  updateRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
  moderateJob: (jobId, action) => api.patch(`/jobs/${jobId}/moderate`, { action }),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }).catch(() => ({ data: [] })),
}

export const resumes = {
  get: (userId) => api.get(`/profiles/${userId || 'me'}/resume`),
  upload: (file) => {
    const form = new FormData()
    form.append('resume', file)
    return api.post('/profiles/me/resume', form)
  },
  delete: () => api.delete('/profiles/me/resume'),
}

export const donations = donationService
export const announcements = announcementService
export const ai = aiService

export const oauth = {
  providers: () => api.get('/auth/oauth/providers'),
  accounts: () => api.get('/auth/oauth/accounts'),
  unlink: (provider) => api.delete(`/auth/oauth/${provider}/link`),
  startUrl: (provider, params = {}) => api.url(`/auth/oauth/${provider}`, params),
  linkUrl: (provider) => api.url(`/auth/oauth/${provider}/link`),
}

