import config from '../config/env.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import { withTransaction } from '../config/database.js'
import * as userModel from '../models/userModel.js'
import * as tokenModel from '../models/tokenModel.js'
import * as profileModel from '../models/profileModel.js'
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js'
import { badRequest, conflict, forbidden, unauthorized, notFound } from '../utils/errors.js'
import * as auditService from './auditService.js'
import * as mailService from './mailService.js'

const REFRESH_COOKIE = 'refresh_token'
const CSRF_COOKIE = 'csrf_token'

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}

/**
 * Mirrors the sync_user_account_status trigger. Used only as a fallback for
 * queries that do not select the account_status column; the database remains the
 * authority and this keeps the two definitions visibly in step.
 */
function accountStatusFor(user) {
  if (user.is_suspended) return 'SUSPENDED'
  if (!user.is_active) return 'INACTIVE'
  if (!user.is_email_verified) return 'PENDING_VERIFICATION'
  return 'ACTIVE'
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`,
    avatarUrl: user.avatar_url,
    phone: user.phone,
    roles: user.roles ?? [],
isEmailVerified: user.is_email_verified,
    isActive: user.is_active,
    isSuspended: user.is_suspended,
      // Lifecycle state maintained by the 008 migration. The booleans above
      // remain the stored detail that older modules read; this is the single
      // value callers should branch on.
      accountStatus: user.account_status ?? accountStatusFor(user),
      lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  }
}

export async function register(payload, context = {}) {
  if (await userModel.emailExists(payload.email)) {
    throw conflict('An account with this email already exists')
  }

  const passwordHash = await hashPassword(payload.password)
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [payload.email, passwordHash, payload.firstName, payload.lastName],
    )
    const userId = rows[0].id

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE LOWER(name) = LOWER($2)`,
      [userId, payload.role],
    )

    if (payload.role === 'ALUMNI') {
      await client.query(
        `INSERT INTO alumni_profiles (user_id, graduation_year, degree, department,
           student_id_number)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, payload.graduationYear, payload.degree ?? null,
          payload.department ?? null, payload.studentIdNumber ?? null],
      )
    } else if (payload.role === 'PROFESSOR' || payload.role === 'FACULTY') {
      await client.query(
        `INSERT INTO alumni_profiles (user_id, degree, department, current_position,
           is_open_to_mentor, verification_status)
         VALUES ($1,$2,$3,$4,TRUE,'verified')`,
        [userId, payload.degree ?? 'Ph.D.', payload.department ?? 'Faculty', 'Faculty Advisor'],
      )
    } else {
      await client.query(
        `INSERT INTO student_profiles (user_id, degree, department, year_of_study,
           student_id_number)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, payload.degree ?? 'Undeclared', payload.department ?? null,
          payload.yearOfStudy ?? null, payload.studentIdNumber ?? null],
      )
    }

    await client.query('INSERT INTO privacy_settings (user_id) VALUES ($1)', [userId])
    await client.query(
      'INSERT INTO notification_preferences (user_id) VALUES ($1)', [userId],
    )
    return userId
  })

  const user = await userModel.findById(result)
  const verifyToken = generateToken()
  await mailService.queueVerificationEmail(user.email, verifyToken)

  await auditService.record({
    actorId: result,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    entityType: 'user',
    entityId: result,
    metadata: { role: payload.role },
    context,
  })

  return {
    user: publicUser(user),
    message: 'Account created. Check your email to verify your address.',
  }
}

export async function login({ email, password }, context = {}) {
  const user = await userModel.findByEmail(email)

  if (!user) {
    await auditService.record({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: null,
      metadata: { email, reason: 'no_such_user' },
      context,
    })
    // Same message and comparable timing whether the email or password is wrong.
    await verifyPassword(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin')
    throw unauthorized('Invalid email or password')
  }

  if (user.is_suspended) {
    throw forbidden('This account has been suspended. Contact the administration.')
  }
  if (!user.is_active) {
    throw forbidden('This account has been deactivated.')
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw forbidden('Account temporarily locked after repeated failed sign-in attempts')
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    await userModel.recordFailedLogin(user.id)
    await auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'bad_password' },
      context,
    })
    throw unauthorized('Invalid email or password')
  }

  await userModel.resetFailedLogins(user.id)
  await userModel.updateLastLogin(user.id)

  const session = await issueSession(user, context)

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    entityType: 'user',
    entityId: user.id,
    context,
  })

  return { user: publicUser(user), ...session }
}

/**
 * Creates the access token, refresh token and CSRF token for a user. Shared by
 * the password and OAuth sign-in paths so both produce identical sessions.
 */
export async function issueSession(user, context = {}) {
  const refreshToken = generateToken(48)
  const expiresAt = await tokenModel.createRefreshToken({
    userId: user.id,
    token: refreshToken,
    userAgent: context.userAgent,
    ip: context.ip,
  })

  const { signAccessToken } = await import('../middleware/auth.js')
  const accessToken = signAccessToken(user)
  const csrfToken = generateToken(16)

  return {
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt,
    csrfToken,
  }
}

export function setSessionCookies(res, session) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions())
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    ...cookieOptions(),
    path: '/',
    httpOnly: false,
  })
}

export function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
  res.clearCookie(CSRF_COOKIE, { path: '/' })
}

export async function refresh(rawToken) {
  if (!rawToken) throw unauthorized('Refresh token is missing')

  const stored = await tokenModel.findRefreshToken(rawToken)
  if (!stored) throw unauthorized('Session is no longer valid, please sign in again')

  const user = await userModel.findById(stored.user_id)
  if (!user) throw unauthorized('Account no longer exists')
  if (user.is_suspended || !user.is_active) throw forbidden('Account is not active')

  const nextToken = generateToken(48)
  await tokenModel.rotateRefreshToken(rawToken, { userId: user.id, token: nextToken })

  const { signAccessToken } = await import('../middleware/auth.js')
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: nextToken,
    refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    csrfToken: generateToken(16),
  }
}

export async function logout(rawToken, context = {}) {
  if (rawToken) {
    const stored = await tokenModel.findRefreshToken(rawToken)
    await tokenModel.revokeRefreshToken(rawToken)
    if (stored) {
      await auditService.record({
        actorId: stored.user_id,
        action: AUDIT_ACTIONS.AUTH_LOGOUT,
        entityType: 'user',
        entityId: stored.user_id,
        context,
      })
    }
  }
  return { message: 'Signed out successfully' }
}

export async function requestPasswordReset(email, context = {}) {
  const user = await userModel.findByEmail(email)
  if (!user) {
    // Do not disclose whether the address is registered.
    return { message: 'If that email is registered, a reset link has been sent' }
  }

  const token = generateToken()
  const { query } = await import('../config/database.js')
  await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [user.id])
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' hours')::INTERVAL)`,
    [user.id, hashToken(token), config.tokens.passwordResetHours],
  )

  await mailService.queuePasswordResetEmail(user.email, token)
  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
    entityType: 'user',
    entityId: user.id,
    context,
  })

  return { message: 'If that email is registered, a reset link has been sent' }
}

export async function resetPassword({ token, password }, context = {}) {
  const { query } = await import('../config/database.js')
  const { rows } = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)],
  )
  const record = rows[0]
  if (!record) throw badRequest('This reset link is invalid or has expired')

  const passwordHash = await hashPassword(password)
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id],
    )
    await client.query(
      'UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1',
      [record.user_id, passwordHash],
    )
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [record.user_id],
    )
  })

  await auditService.record({
    actorId: record.user_id,
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET,
    entityType: 'user',
    entityId: record.user_id,
    context,
  })

  return { message: 'Password updated. You can now sign in.' }
}

export async function verifyEmail(token, context = {}) {
  const { query } = await import('../config/database.js')
  const { rows } = await query(
    `SELECT * FROM email_verification_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [hashToken(token)],
  )
  const record = rows[0]
  if (!record) throw badRequest('This verification link is invalid or has expired')

  await withTransaction(async (client) => {
    await client.query(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [record.id],
    )
    await client.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [record.user_id])
  })

  await userModel.setEmailVerified(record.user_id, true)
  await auditService.record({
    actorId: record.user_id,
    action: AUDIT_ACTIONS.AUTH_EMAIL_VERIFIED,
    entityType: 'user',
    entityId: record.user_id,
    context,
  })

  return { message: 'Email verified successfully' }
}

export async function changePassword(userId, { currentPassword, newPassword }, context = {}) {
  const user = await userModel.findById(userId)
  const withSecret = await userModel.findByEmail(user.email)

  const valid = await verifyPassword(currentPassword, withSecret.password_hash)
  if (!valid) throw badRequest('Current password is incorrect')

  const passwordHash = await hashPassword(newPassword)
  await userModel.updatePasswordHash(userId, passwordHash)
  await tokenModel.revokeAllForUser(userId)

  await auditService.record({
    actorId: userId,
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
    entityType: 'user',
    entityId: userId,
    context,
  })

  return { message: 'Password updated. Please sign in again on other devices.' }
}

export async function getMe(userId) {
  const user = await userModel.findById(userId)
  if (!user) throw notFound('User')
  const profile = await profileModel.getProfileBundle(userId)
  return { user: publicUser(user), profile }
}

export { publicUser }
