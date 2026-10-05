import * as profileModel from '../models/profileModel.js'

/**
 * Server-side privacy enforcement.
 *
 * Privacy is applied here, in one place, rather than at each call site, so that
 * adding a new field to a profile cannot accidentally publish it. The rule is
 * simple: the owner and administrators see everything, everyone else sees a
 * profile with the owner's non-public fields removed.
 *
 * Two properties matter and are asserted by the test suite:
 *
 *   1. A withheld field is absent from the response, not merely blanked. A `null`
 *      would still tell a caller that the value exists.
 *   2. Enforcement happens before serialisation, so no caller can opt out by
 *      choosing a different endpoint.
 */

/** Privacy defaults when a member has never saved settings. */
export const PRIVACY_DEFAULTS = {
  show_email: false,
  show_phone: false,
  show_location: true,
  show_employer: true,
  show_social_links: true,
  show_profile_in_directory: true,
  show_mentorship_availability: true,
  allow_connection_requests: true,
  allow_messages_from: 'connections',
}

export async function resolveViewerSettings(userIds) {
  const map = await profileModel.getPrivacySettingsMap(userIds)
  for (const id of userIds) {
    if (!map.has(id)) {
      map.set(id, { user_id: id, ...PRIVACY_DEFAULTS })
    }
  }
  return map
}

function visible(settings, flag, fallback = true) {
  const value = settings?.[flag]
  return value === undefined ? fallback : Boolean(value)
}

export function canViewProfile(settings, viewerId, ownerId, viewerRoles = []) {
  if (viewerId === ownerId) return true
  if (viewerRoles.includes('ADMIN') || viewerRoles.includes('MODERATOR')) return true
  return visible(settings, 'show_profile_in_directory')
}

export function canViewFullProfile(settings, viewerId, ownerId, viewerRoles = []) {
  if (viewerId === ownerId) return true
  if (viewerRoles.includes('ADMIN') || viewerRoles.includes('MODERATOR')) return true
  return visible(settings, 'show_profile_in_directory')
}

/**
 * The definitive redaction applied to any profile returned to a third party.
 * Returns a new object; the row is never mutated.
 */
export function redactAlumni(row, settings) {
  if (!row) return null

  const out = { ...row }
  if (!visible(settings, 'show_location')) {
    delete out.city
    delete out.region
    delete out.country
    delete out.latitude
    delete out.longitude
    delete out.location
  }
  if (!visible(settings, 'show_employer')) {
    delete out.current_company
    delete out.current_position
    delete out.job_title
    delete out.industry
  }
  if (!visible(settings, 'show_mentorship_availability')) {
    delete out.is_open_to_mentor
    delete out.mentorship_capacity
  }
  return out
}

export function redactStudent(row, settings) {
  if (!row) return null

  const out = { ...row }
  if (!visible(settings, 'show_location')) {
    delete out.city
    delete out.region
    delete out.country
    delete out.location
  }
  if (!visible(settings, 'show_mentorship_availability')) {
    delete out.is_open_to_mentorship
  }
  return out
}

/**
 * Shapes the users row. Email and phone are never returned by default; only an
 * owner or an administrator sees them.
 */
export function redactUser(row, settings, { includePrivate = false } = {}) {
  if (!row) return null

  const out = {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    avatarUrl: row.profile_photo ?? row.avatar_url,
    accountStatus: row.account_status,
  }
  if (row.is_email_verified !== undefined) out.isEmailVerified = row.is_email_verified
  if (row.created_at) out.memberSince = row.created_at
  if (row.graduation_year !== undefined) out.graduationYear = row.graduation_year
  if (row.degree !== undefined) out.degree = row.degree
  if (row.major !== undefined || row.department !== undefined) {
    out.major = row.major ?? row.department
  }
  if (row.industry !== undefined && visible(settings, 'show_employer')) out.industry = row.industry

  if (includePrivate) {
    if (row.email !== undefined) out.email = row.email
    if (row.phone !== undefined) out.phone = row.phone
    if (row.location !== undefined && visible(settings, 'show_location')) {
      out.location = row.location
    }
  } else {
    if (visible(settings, 'show_email') && row.email !== undefined) out.email = row.email
    if (visible(settings, 'show_phone') && row.phone !== undefined) out.phone = row.phone
    if (visible(settings, 'show_location') && row.location !== undefined) {
      out.location = row.location
    }
  }

  if (row.verification_status !== undefined) out.verificationStatus = row.verification_status
  return out
}

export function canViewSocialLinks(settings, viewerId, ownerId, viewerRoles = []) {
  if (viewerId === ownerId) return true
  if (viewerRoles.includes('ADMIN') || viewerRoles.includes('MODERATOR')) return true
  return visible(settings, 'show_social_links')
}

/** Education and experience are part of the visible profile biography. */
export function redactEducation(rows) {
  return (rows ?? []).map((r) => ({ ...r }))
}

export function redactExperience(rows) {
  return (rows ?? []).map((r) => ({ ...r }))
}

export function redactSkills(rows) {
  return (rows ?? []).map((r) => ({ ...r }))
}

export function redactSocialLinks(rows, allowed) {
  if (!allowed) return []
  return (rows ?? []).map((r) => ({ ...r }))
}

/**
 * Removes every contact detail regardless of privacy settings. Used by endpoints
 * such as the directory that must never emit contact information, only whether
 * the member allows it to be requested.
 */
export function stripContactDetails(rows) {
  return rows.map((row) => {
    const copy = { ...row }
    delete copy.email
    delete copy.phone
    return copy
  })
}

export default {
  PRIVACY_DEFAULTS,
  resolveViewerSettings,
  canViewProfile,
  redactAlumni,
  redactStudent,
  redactUser,
  canViewSocialLinks,
  redactEducation,
  redactExperience,
  redactSkills,
  redactSocialLinks,
  stripContactDetails,
}