import * as verificationService from '../services/verificationService.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import * as auditService from '../services/auditService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { getQuery } from '../middleware/validate.js'
import { sendSuccess } from '../utils/response.js'

/**
 * Administrator endpoints for alumni verification.
 *
 * Every route in this file is mounted behind `requireRole(ADMIN)` in
 * adminRoutes.js, so the handlers do not repeat the role check. Each decision is
 * written to the audit log as well as the verification history: the history
 * explains the alumni record, the audit log explains administrator conduct.
 */

export const listPending = asyncHandler(async (req, res) => {
  const { page, limit, search } = getQuery(req)
  const { rows, total } = await verificationService.listPending({
    limit,
    offset: (page - 1) * limit,
    search,
  })

  sendSuccess(res, rows.map((r) => ({
    userId: r.user_id,
    name: `${r.first_name} ${r.last_name}`,
    email: r.email,
    graduationYear: r.graduation_year,
    degree: r.degree,
    major: r.major ?? r.department,
    university: r.university,
    studentIdNumber: r.student_id_number,
    submittedAt: r.created_at,
    reviewCount: r.review_count,
    status: 'PENDING',
  })), {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
})

export const getDetail = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const { profile, history, education } =
    await verificationService.getReviewDetail(userId)

  sendSuccess(res, {
    userId: profile.user_id,
    name: `${profile.first_name} ${profile.last_name}`,
    email: profile.email,
    accountStatus: profile.account_status,
    isEmailVerified: profile.is_email_verified,
    graduationYear: profile.graduation_year,
    degree: profile.degree,
    major: profile.major ?? profile.department,
    university: profile.university,
    studentIdNumber: profile.student_id_number,
    submittedAt: profile.submitted_at,
    status: verificationService.toApiStatus(profile.verification_status),
    reviewer: profile.verified_by,
    reviewedAt: profile.verified_at,
    notes: profile.verification_notes,
    education,
    supportingRecords: {
      education: profile.education_count,
      experience: profile.experience_count,
    },
    history,
  })
})

export const verify = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const result = await verificationService.decide({
    userId,
    status: 'VERIFIED',
    reviewerId: req.user.id,
    reason: req.body?.reason ?? req.body?.notes ?? null,
  })

  if (!result.alreadyVerified) {
    await auditService.record({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.ALUMNI_VERIFIED,
      entityType: 'alumni_profile',
      entityId: userId,
      metadata: { previousStatus: 'pending', newStatus: 'verified' },
    })
  }

  sendSuccess(res, {
    userId: result.user_id,
    status: verificationService.toApiStatus(result.verification_status),
    alreadyVerified: Boolean(result.alreadyVerified),
    reviewer: result.verified_by,
    reviewedAt: result.verified_at,
  }, {
    message: result.alreadyVerified
      ? 'This alumni profile is already VERIFIED; no further action required.'
      : 'Alumni profile verified',
  })
})

export const reject = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const reason = req.body?.reason ?? req.body?.notes ?? 'Rejected by administrator'
  const result = await verificationService.decide({
    userId,
    status: 'REJECTED',
    reviewerId: req.user.id,
    reason,
  })

  if (!result.alreadyRejected) {
    await auditService.record({
      actorId: req.user.id,
      action: AUDIT_ACTIONS.ALUMNI_REJECTED,
      entityType: 'alumni_profile',
      entityId: userId,
      metadata: { previousStatus: 'pending', newStatus: 'rejected', reason },
    })
  }

  sendSuccess(res, {
    userId: result.user_id,
    status: verificationService.toApiStatus(result.verification_status),
    alreadyRejected: Boolean(result.alreadyRejected),
    reviewer: result.verified_by,
    reviewedAt: result.verified_at,
    reason: result.verification_notes,
  }, {
    message: result.alreadyRejected
      ? 'This alumni profile is already REJECTED; no further action required.'
      : 'Alumni profile rejected',
  })
})

/** A member may withdraw and resubmit their own verification request. */
export const resubmit = asyncHandler(async (req, res) => {
  const result = await verificationService.submitForReview(req.user.id)
  sendSuccess(res, {
    status: verificationService.toApiStatus(result.verification_status),
  }, { message: 'Submitted for review' })
})

export const myHistory = asyncHandler(async (req, res) => {
  const history = await verificationService.listHistory(req.user.id)
  sendSuccess(res, history)
})

export default {
  listPending, getDetail, verify, reject, resubmit, myHistory,
}