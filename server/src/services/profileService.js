import * as profileModel from '../models/profileModel.js'
import * as userModel from '../models/userModel.js'
import * as privacyService from './privacyService.js'
import { forbidden, notFound } from '../utils/errors.js'
import { toApiStatus } from './verificationService.js'

/**
 * Profile assembly with privacy applied.
 *
 * This is the only path that produces a profile for someone other than its
 * owner. Controllers call it so that the redaction rules in privacyService cannot
 * be bypassed by reaching for the model directly.
 */

const ALUMNI_SHAPE = `
  ap.user_id, ap.graduation_year, ap.degree, ap.major, ap.department,
  ap.university, ap.current_company, ap.job_title, ap.current_position,
  ap.industry, ap.location, ap.city, ap.region, ap.country,
  ap.bio, ap.profile_photo, ap.is_open_to_mentor, ap.mentorship_capacity,
  ap.verification_status, ap.verified_at, ap.created_at, ap.updated_at
`

const STUDENT_SHAPE = `
  sp.user_id, sp.degree, sp.major, sp.department, sp.graduation_year,
  sp.expected_graduation, sp.university, sp.location, sp.city, sp.region,
  sp.country, sp.bio, sp.profile_photo, sp.career_interests, sp.year_of_study,
  sp.resume_file_id, sp.resume_filename,
  sp.verification_status, sp.created_at, sp.updated_at
`

/**
 * Adds the camelCase aliases the Phase 2 API is specified in, while leaving the
 * stored column names in place.
 *
 * Both are returned deliberately: the mentorship, jobs and connection modules
 * read the snake_case columns, and clients written before Phase 2 already expect
 * them, so removing them would be a breaking change. The aliases are the
 * documented Phase 2 shape.
 *
 * Aliases are only added when the underlying key is actually present. Redaction
 * removes withheld keys, and defaulting a missing key back to `null` here would
 * silently undo that and leak the fact that a field exists.
 */
/**
 * Copies a stored column onto its camelCase response name, but only when the
 * column actually carries a value.
 *
 * Redaction deletes withheld keys outright. Defaulting a missing key back to
 * `null` here would silently undo that redaction and leak that a field exists,
 * so an absent key must stay absent.
 */
function alias(out, from, to) {
  if (from !== undefined) out[to] = from
}

/**
 * The stored resume, as an authorized path.
 *
 * The path grants nothing on its own: reading the file re-checks permission and answers
 * 404 to anybody else, so naming it here tells a client where to ask without telling a
 * stranger anything. The raw column is removed on the way out, because a column name in
 * a response is a contract and this one is a storage detail.
 */
function withResumeAlias(out, row) {
  if (!row.resume_file_id) {
    delete out.resume_file_id
    return out
  }
  out.resume = {
    id: row.resume_file_id,
    filename: row.resume_filename,
    downloadPath: `/api/files/${row.resume_file_id}/download`,
  }
  delete out.resume_file_id
  return out
}

function withSpecAliases(row) {
  if (!row) return null
  const out = { ...row }
  if (row.major !== undefined || row.department !== undefined) {
    out.major = row.major ?? row.department
  }
  if (row.job_title !== undefined) out.jobTitle = row.job_title
  else if (row.current_position !== undefined) out.jobTitle = row.current_position
  alias(out, row.graduation_year, 'graduationYear')
  alias(out, row.current_company, 'currentCompany')
  alias(out, row.is_open_to_mentor, 'mentorshipAvailable')
  alias(out, row.mentorship_capacity, 'mentorshipCapacity')
  alias(out, row.show_on_map, 'showOnMap')
  for (const key of ['university', 'location', 'profile_photo']) {
    alias(out, row[key], key === 'profile_photo' ? 'profilePhoto' : key)
  }
  return withResumeAlias(out, row)
}

function studentWithSpecAliases(row) {
  if (!row) return null
  const out = { ...row }
  if (row.major !== undefined || row.department !== undefined) {
    out.major = row.major ?? row.department
  }
  if (row.graduation_year !== undefined) out.graduationYear = row.graduation_year
  else if (row.expected_graduation !== undefined) out.graduationYear = row.expected_graduation
  alias(out, row.year_of_study, 'yearOfStudy')
  alias(out, row.career_interests, 'careerInterests')
  // Named for what the column actually means. A student's
  // `is_open_to_mentorship` records willingness to *be* mentored; exposing it as
  // `mentorshipAvailable`, the same alias alumni use for "I will mentor", invited
  // clients to read a student as a prospective mentor. `openToMentorship` keeps the
  // two visibly distinct.
  alias(out, row.is_open_to_mentorship, 'openToMentorship')
  for (const key of ['university', 'location', 'profile_photo']) {
    alias(out, row[key], key === 'profile_photo' ? 'profilePhoto' : key)
  }
  return withResumeAlias(out, row)
}

/**
 * Loads one profile and redacts it for the viewer.
 *
 * `viewer` is `req.user` from the authentication middleware. When the viewer is
 * the owner, nothing is withheld.
 */
export async function getProfileForViewer(targetUserId, viewer) {
  const viewerId = viewer?.id
  const viewerRoles = viewer?.roles ?? []

  const user = await userModel.findById(targetUserId)
  if (!user) throw notFound('User')

  const settingsMap = await privacyService.resolveViewerSettings([targetUserId])
  const settings = settingsMap.get(targetUserId)
  const isSelf = viewerId === targetUserId
  const isPrivileged = isSelf || viewerRoles.includes('ADMIN')
    || viewerRoles.includes('MODERATOR')

  const [alumni, student] = await Promise.all([
    profileModel.findAlumniProfileByUserId(targetUserId),
    profileModel.findStudentProfileByUserId(targetUserId),
  ])

  if (!alumni && !student) throw notFound('Profile')

  if (!isPrivileged && !privacyService.canViewProfile(settings, viewerId, targetUserId, viewerRoles)) {
    // The profile is not listed publicly. It is reported as absent rather than
    // forbidden so the response does not confirm the account exists.
    throw notFound('Profile')
  }

  const [education, experience, skills, socialLinks] = await Promise.all([
    profileModel.listEducation(targetUserId),
    profileModel.listExperience(targetUserId),
    profileModel.getSkillsForUser(targetUserId),
    profileModel.listSocialLinks(targetUserId),
  ])

  const showLinks = privacyService.canViewSocialLinks(
    settings, viewerId, targetUserId, viewerRoles,
  )

  return {
    user: privacyService.redactUser(user, settings, { includePrivate: isPrivileged }),
    alumni: alumni
      ? {
        ...withSpecAliases(privacyService.redactAlumni(alumni, settings)),
        mentorshipAvailable: alumni.is_open_to_mentor,
        verificationStatus: toApiStatus(alumni.verification_status),
        verified: alumni.verification_status === 'verified',
      }
      : null,
    student: student
      ? {
        ...withSpecAliases(privacyService.redactStudent(student, settings)),
        verificationStatus: toApiStatus(student.verification_status),
      }
      : null,
    education: privacyService.redactEducation(education),
    experience: privacyService.redactExperience(experience),
    skills: privacyService.redactSkills(skills),
    socialLinks: privacyService.redactSocialLinks(socialLinks, showLinks),
    privacy: isSelf ? settings : null,
    viewer: { isSelf, canSeeSocialLinks: showLinks },
  }
}

/** The caller's own profile, with privacy settings included and nothing redacted. */
export async function getOwnProfile(userId) {
  const bundle = await profileModel.getProfileBundle(userId)
  const user = await userModel.findById(userId)

  return {
    user: privacyService.redactUser(user, bundle.privacy, { includePrivate: true }),
    alumni: bundle.alumni
      ? {
        ...withSpecAliases(bundle.alumni),
        mentorshipAvailable: bundle.alumni.is_open_to_mentor,
        verificationStatus: toApiStatus(bundle.alumni.verification_status),
        verified: bundle.alumni.verification_status === 'verified',
      }
      : null,
    student: bundle.student
      ? {
        ...studentWithSpecAliases(bundle.student),
        verificationStatus: toApiStatus(bundle.student.verification_status),
      }
      : null,
    education: bundle.education,
    experience: bundle.experience,
    socialLinks: bundle.socialLinks,
    skills: bundle.skills,
    privacy: bundle.privacy,
    viewer: { isSelf: true, canSeeSocialLinks: true },
  }
}

/**
 * Rejects an update that would change another member's profile. Kept as its own
 * function so the ownership rule is stated once and tested directly.
 */
export function assertOwnsProfile(viewerId, ownerId) {
  if (viewerId !== ownerId) {
    throw forbidden('You may only edit your own profile')
  }
}

/** Alumni-only routes must refuse students, and vice versa. */
export function assertRole(user, roles, message) {
  const held = user?.roles ?? []
  if (!roles.some((r) => held.includes(r))) throw forbidden(message)
}

export { ALUMNI_SHAPE, STUDENT_SHAPE }
