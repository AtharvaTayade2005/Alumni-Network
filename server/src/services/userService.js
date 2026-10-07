import { query } from '../config/database.js'
import * as userRepository from '../repositories/userRepository.js'
import * as userModel from '../models/userModel.js'
import * as tokenModel from '../models/tokenModel.js'
import * as auditService from './auditService.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'
import { ROLES } from '../middleware/rbac.js'

/**
 * User management rules and administration operations.
 */
export async function listUsers({ search, role, status, page, limit }) {
  const offset = (page - 1) * limit
  const { rows, total } = await userRepository.listUsers({
    search, role, status, limit, offset,
  })

  return {
    users: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export async function getUser(userId) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')
  return { user }
}

export async function activateUser(adminId, userId, context = {}) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')

  await userModel.setActive(userId, true)
  await userModel.setSuspended(userId, false, null)

  await auditService.record({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_REACTIVATED,
    entityType: 'user',
    entityId: userId,
    context,
  })

  return getUser(userId)
}

export async function deactivateUser(adminId, userId, context = {}) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')

  if (user.roles?.includes(ROLES.ADMIN)) {
    const activeAdmins = await userRepository.countActiveAdmins(userId)
    if (activeAdmins < 1) throw forbidden('Cannot deactivate the last remaining administrator')
  }

  await userModel.setActive(userId, false)
  await tokenModel.revokeAllForUser(userId)

  await auditService.record({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_DEACTIVATED,
    entityType: 'user',
    entityId: userId,
    context,
  })

  return getUser(userId)
}

export async function suspendUser(adminId, userId, { reason } = {}, context = {}) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')

  if (user.roles?.includes(ROLES.ADMIN)) {
    throw forbidden('Cannot suspend an administrator account')
  }

  await userModel.setSuspended(userId, true, reason ?? 'Suspended by administrator')
  await tokenModel.revokeAllForUser(userId)

  await auditService.record({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_SUSPENDED,
    entityType: 'user',
    entityId: userId,
    metadata: { reason },
    context,
  })

  return getUser(userId)
}

export async function reactivateUser(adminId, userId, context = {}) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')

  await userModel.setSuspended(userId, false, null)
  await userModel.setActive(userId, true)

  await auditService.record({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_REACTIVATED,
    entityType: 'user',
    entityId: userId,
    context,
  })

  return getUser(userId)
}

export async function updateUserRole(adminId, userId, { role }, context = {}) {
  const roleName = String(role).toUpperCase()
  if (!Object.values(ROLES).includes(roleName)) {
    throw badRequest(`Invalid role: ${role}`)
  }

  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')

  if (user.roles?.includes(ROLES.ADMIN) && roleName !== ROLES.ADMIN) {
    const activeAdmins = await userRepository.countActiveAdmins(userId)
    if (activeAdmins < 1) throw forbidden('Cannot demote the last remaining administrator')
  }

  await userModel.setPrimaryRole(userId, roleName)

  await auditService.record({
    actorId: adminId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'user',
    entityId: userId,
    metadata: { oldRoles: user.roles, newRole: roleName },
    context,
  })

  return getUser(userId)
}

export async function getDashboardStats() {
  const [
    userStats,
    roleStats,
    verificationStats,
    jobStats,
    appStats,
    eventStats,
    rsvpStats,
    mentorshipStats,
    donationStats,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE is_active AND NOT is_suspended)::int AS active
           FROM users`),
    query(`SELECT r.name, COUNT(ur.user_id)::int AS count
           FROM roles r
           LEFT JOIN user_roles ur ON ur.role_id = r.id
           GROUP BY r.name`),
    query(`SELECT COUNT(*)::int AS pending FROM alumni_profiles WHERE verification_status = 'PENDING'`),
    query(`SELECT COUNT(*)::int AS active FROM jobs WHERE status = 'published'`),
    query(`SELECT COUNT(*)::int AS total FROM job_applications`),
    query(`SELECT COUNT(*)::int AS published FROM events WHERE status = 'published'`),
    query(`SELECT COUNT(*)::int AS going FROM event_rsvps WHERE status = 'going'`),
    query(`SELECT COUNT(*)::int AS active FROM mentorship_relationships WHERE status = 'ACTIVE'`),
    query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS amount
           FROM donations WHERE status = 'SUCCESS'`),
  ])

  const rolesMap = {}
  for (const row of roleStats.rows) {
    rolesMap[row.name] = row.count
  }

  return {
    totalUsers: userStats.rows[0]?.total ?? 0,
    activeUsers: userStats.rows[0]?.active ?? 0,
    totalAlumni: rolesMap[ROLES.ALUMNI] ?? 0,
    totalStudents: rolesMap[ROLES.STUDENT] ?? 0,
    pendingVerification: verificationStats.rows[0]?.pending ?? 0,
    activeJobs: jobStats.rows[0]?.active ?? 0,
    applications: appStats.rows[0]?.total ?? 0,
    events: eventStats.rows[0]?.published ?? 0,
    rsvps: rsvpStats.rows[0]?.going ?? 0,
    mentorshipRelationships: mentorshipStats.rows[0]?.active ?? 0,
    donations: {
      count: donationStats.rows[0]?.count ?? 0,
      totalAmount: Number(donationStats.rows[0]?.amount ?? 0),
    },
  }
}