import * as reportModel from '../models/reportModel.js'
import * as userService from './userService.js'
import * as auditService from './auditService.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import { badRequest, notFound } from '../utils/errors.js'

export async function createReport(user, payload, context = {}) {
  const { targetType, targetId, reason, details, description } = payload

  // Validate target exists
  const exists = await reportModel.verifyTargetExists(targetType, targetId)
  if (!exists) {
    throw notFound(`${targetType.charAt(0).toUpperCase() + targetType.slice(1)} to report`)
  }

  const report = await reportModel.createReport(user.id, {
    targetType,
    targetId,
    reason,
    description: description ?? details,
  })

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.REPORT_SUBMITTED,
    entityType: targetType,
    entityId: targetId,
    metadata: { reportId: report.id, reason },
    context,
  })

  return report
}

export async function listReports({ status, targetType, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const result = await reportModel.listReports({ status, targetType, limit, offset })
  return {
    reports: result.reports,
    meta: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit) || 1,
    },
  }
}

export async function getReport(id) {
  const report = await reportModel.findReportById(id)
  if (!report) throw notFound('Report')
  return report
}

export async function reviewReport(adminUser, id, patch, context = {}) {
  const existing = await reportModel.findReportById(id)
  if (!existing) throw notFound('Report')

  const validStatuses = [
    reportModel.REPORT_STATUS.UNDER_REVIEW,
    reportModel.REPORT_STATUS.RESOLVED,
    reportModel.REPORT_STATUS.DISMISSED,
  ]
  const status = patch.status?.toUpperCase()
  if (status && !validStatuses.includes(status)) {
    throw badRequest(`Invalid status: ${patch.status}`)
  }

  const updated = await reportModel.updateReport(id, {
    status: status ?? existing.status,
    reviewedBy: adminUser.id,
    reviewedAt: new Date(),
    description: patch.description ?? existing.description,
  })

  await auditService.record({
    actorId: adminUser.id,
    action: AUDIT_ACTIONS.REPORT_REVIEWED,
    entityType: 'report',
    entityId: id,
    metadata: { status: updated.status },
    context,
  })

  return updated
}

export async function executeModeration(adminUser, payload, context = {}) {
  const { action, targetType, targetId, reason, metadata } = payload

  // Validate target exists
  const exists = await reportModel.verifyTargetExists(targetType, targetId)
  if (!exists) {
    throw notFound(`${targetType.charAt(0).toUpperCase() + targetType.slice(1)} to moderate`)
  }

  const modAction = await reportModel.createModerationAction(adminUser.id, {
    action,
    targetType,
    targetId,
    reason,
    metadata,
  })

  // Side-effects based on action
  let auditAction = AUDIT_ACTIONS.CONTENT_HIDDEN
  if (action === 'hide') {
    if (['job', 'event', 'message', 'company'].includes(targetType)) {
      await reportModel.setContentModeration(targetType, targetId, adminUser.id, reason)
    }
    auditAction = AUDIT_ACTIONS.CONTENT_HIDDEN
  } else if (action === 'restore') {
    if (['job', 'event', 'message', 'company'].includes(targetType)) {
      await reportModel.removeContentModeration(targetType, targetId)
    }
    auditAction = AUDIT_ACTIONS.CONTENT_RESTORED
  } else if (action === 'remove') {
    auditAction = AUDIT_ACTIONS.CONTENT_REMOVED
  } else if (action === 'suspend' && targetType === 'user') {
    await userService.suspendUser(adminUser.id, targetId, { reason }, context)
    auditAction = AUDIT_ACTIONS.USER_SUSPENDED
  } else if (action === 'reactivate' && targetType === 'user') {
    await userService.reactivateUser(adminUser.id, targetId, context)
    auditAction = AUDIT_ACTIONS.USER_REACTIVATED
  } else if (action === 'dismiss_report' || action === 'resolve_report') {
    const reportStatus = action === 'dismiss_report'
      ? reportModel.REPORT_STATUS.DISMISSED
      : reportModel.REPORT_STATUS.RESOLVED
    if (targetType === 'report') {
      await reportModel.updateReport(targetId, {
        status: reportStatus,
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
      })
    }
    auditAction = AUDIT_ACTIONS.REPORT_REVIEWED
  }

  await auditService.record({
    actorId: adminUser.id,
    action: auditAction,
    entityType: targetType,
    entityId: targetId,
    metadata: { moderationId: modAction.id, action, reason },
    context,
  })

  return {
    moderationId: modAction.id,
    action,
    targetType,
    targetId,
    reason,
  }
}
