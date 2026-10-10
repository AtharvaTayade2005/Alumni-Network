import { db } from '../data/index.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const adminService = {
  async getDashboardMetrics() {
    await delay()
    const analytics = db.store.analytics || {}
    const users = db.get('users')
    const jobs = db.get('jobs')
    const activeMentorships = db.get('activeMentorships')
    const events = db.get('events')
    const donations = db.get('donations')

    const pendingVerifications = users.filter((u) => u.roles?.includes('ALUMNI') && !u.verified).length
    const pendingJobs = jobs.filter((j) => j.moderationStatus === 'pending').length
    const totalDonationsAmount = donations.reduce((sum, d) => sum + (d.amount || 0), 0)

    return {
      data: {
        totalUsers: users.length,
        alumniCount: users.filter((u) => u.roles?.includes('ALUMNI')).length,
        studentCount: users.filter((u) => u.roles?.includes('STUDENT')).length,
        professorCount: users.filter((u) => u.roles?.includes('PROFESSOR')).length,
        pendingVerifications,
        activeJobs: jobs.filter((j) => j.status === 'active').length,
        pendingJobs,
        activeMentorships: activeMentorships.filter((m) => m.status === 'active').length,
        upcomingEvents: events.filter((e) => e.status === 'published').length,
        totalDonations: totalDonationsAmount,
        userGrowth: analytics.userGrowth || [],
        departmentBreakdown: analytics.departmentBreakdown || [],
        topHiringCompanies: analytics.topHiringCompanies || [],
      },
    }
  },

  async getUsers(params = {}) {
    await delay()
    let users = db.get('users')

    if (params.role && params.role !== 'all') {
      users = users.filter((u) => u.roles?.includes(params.role))
    }

    if (params.status && params.status !== 'all') {
      if (params.status === 'verified') users = users.filter((u) => u.verified)
      if (params.status === 'unverified') users = users.filter((u) => !u.verified)
    }

    if (params.search) {
      const q = params.search.toLowerCase()
      users = users.filter((u) => (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      ))
    }

    return {
      data: users,
      meta: { total: users.length },
    }
  },

  async verifyAlumni(userId, approved, notes) {
    await delay(100)
    db.update('users', (u) => u.id === userId, (u) => ({
      ...u,
      verified: approved,
    }))

    db.update('alumni', (a) => a.userId === userId, (a) => ({
      ...a,
      verified: approved,
      verificationStatus: approved ? 'verified' : 'rejected',
    }))

    // Audit log entry
    db.insert('auditLogs', {
      id: `log_${Date.now()}`,
      userId: 'u_admin_1',
      userName: 'Administrator',
      userRole: 'ADMIN',
      action: approved ? 'VERIFY_ALUMNI' : 'REJECT_ALUMNI_VERIFICATION',
      resource: `Alumni User (${userId})`,
      resourceId: userId,
      status: approved ? 'SUCCESS' : 'REJECTED',
      ipAddress: '192.168.1.104',
      timestamp: new Date().toISOString(),
      details: notes || (approved ? 'Alumni credentials approved.' : 'Alumni credentials rejected.'),
    })

    return { message: `Alumni ${approved ? 'verified successfully' : 'verification rejected'}` }
  },

  async updateUserRole(userId, newRole) {
    await delay(80)
    db.update('users', (u) => u.id === userId, (u) => ({
      ...u,
      role: newRole,
      roles: [newRole],
    }))

    db.insert('auditLogs', {
      id: `log_${Date.now()}`,
      userId: 'u_admin_1',
      userName: 'Administrator',
      userRole: 'ADMIN',
      action: 'UPDATE_USER_ROLE',
      resource: `User (${userId})`,
      resourceId: userId,
      status: 'SUCCESS',
      ipAddress: '192.168.1.104',
      timestamp: new Date().toISOString(),
      details: `Changed user primary role to ${newRole}.`,
    })

    return { message: `User role updated to ${newRole}` }
  },

  async moderateJob(jobId, action) {
    await delay(80) // action: 'approve' | 'reject' | 'flag' | 'close'
    const statusMap = {
      approve: { status: 'active', moderationStatus: 'approved' },
      reject: { status: 'rejected', moderationStatus: 'rejected' },
      flag: { status: 'flagged', moderationStatus: 'flagged' },
      close: { status: 'closed', moderationStatus: 'approved' },
    }

    const updates = statusMap[action] || statusMap.approve
    db.update('jobs', (j) => j.id === jobId, (j) => ({
      ...j,
      ...updates,
    }))

    db.insert('auditLogs', {
      id: `log_${Date.now()}`,
      userId: 'u_admin_1',
      userName: 'Administrator',
      userRole: 'ADMIN',
      action: `JOB_${action.toUpperCase()}`,
      resource: `Job (${jobId})`,
      resourceId: jobId,
      status: 'SUCCESS',
      ipAddress: '192.168.1.104',
      timestamp: new Date().toISOString(),
      details: `Job status transitioned to ${updates.status}.`,
    })

    return { message: `Job ${action}d successfully` }
  },

  async getAuditLogs(params = {}) {
    await delay()
    let logs = db.get('auditLogs')

    if (params.action && params.action !== 'all') {
      logs = logs.filter((l) => l.action.includes(params.action))
    }

    return {
      data: logs,
      meta: { total: logs.length },
    }
  },
}
