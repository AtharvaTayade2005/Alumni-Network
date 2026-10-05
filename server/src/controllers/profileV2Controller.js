import { query } from '../config/database.js'
import * as profileService from '../services/profileService.js'
import * as profileModel from '../models/profileModel.js'
import * as storageService from '../services/storageService.js'
import * as verificationService from '../services/verificationService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendCreated, sendSuccess } from '../utils/response.js'
import { badRequest, notFound } from '../utils/errors.js'

/**
 * Phase 2 profile endpoints.
 *
 * Two rules hold across every handler here:
 *
 *   * A caller may only ever write their own profile. No update route accepts a
 *     user id, so there is no identifier for a caller to tamper with.
 *   * Reading someone else's profile goes through profileService, which applies
 *     privacy before the response is built.
 *
 * Writes are split in two because migration 009 added the specification-named
 * columns (university, location, profile_photo) alongside the 001 columns. The
 * model helpers handle the original columns; the added ones are written
 * directly, and a database trigger keeps `major`/`job_title` in step with
 * `department`/`current_position`.
 */

/** Resolves which profile table a user actually has. */
async function resolveTable(userId) {
  if (await profileModel.findAlumniProfileByUserId(userId)) return 'alumni_profiles'
  if (await profileModel.findStudentProfileByUserId(userId)) return 'student_profiles'
  return null
}

/** Writes the columns that migration 009 added, skipping absent keys. */
async function writeAddedColumns(userId, table, columns) {
  const entries = Object.entries(columns).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  const sets = entries.map(([k], i) => `${k} = $${i + 2}`)
  await query(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE user_id = $1`,
    [userId, ...entries.map(([, v]) => v)],
  )
}

const ADDED_COLUMNS = (body) => ({
  university: body.university,
  location: body.location,
  profile_photo: body.profilePhoto,
})

/**
 * Maps the request body onto the 001 column-oriented model payload.
 *
 * Both spellings are accepted for the renamed fields: `jobTitle`/`major` are the
 * Phase 2 names, `currentPosition`/`department` are what the mentorship, jobs and
 * connection modules use and what existing clients send.
 */
function alumniPayload(body) {
  const payload = {}
  const set = (key, value) => {
    if (value !== undefined) payload[key] = value
  }
  set('graduationYear', body.graduationYear)
  set('degree', body.degree)
  set('department', body.major ?? body.department)
  set('currentCompany', body.currentCompany)
  set('currentPosition', body.jobTitle ?? body.currentPosition)
  set('industry', body.industry)
  set('city', body.city)
  set('region', body.region)
  set('country', body.country)
  set('bio', body.bio)
  set('isOpenToMentor', body.mentorshipAvailable)
  set('mentorshipCapacity', body.mentorshipCapacity)
  set('showOnMap', body.showOnMap)
  return payload
}

function studentPayload(body) {
  const payload = {}
  const set = (key, value) => {
    if (value !== undefined) payload[key] = value
  }
  set('degree', body.degree)
  set('department', body.major ?? body.department)
  set('expectedGraduation', body.graduationYear ?? body.expectedGraduation)
  set('yearOfStudy', body.yearOfStudy)
  set('careerInterests', body.careerInterests)
  set('bio', body.bio)
  set('isOpenToMentorship', body.mentorshipAvailable)
  return payload
}

/** Skills and privacy preferences are profile-wide, so both paths apply them. */
async function applyCommon(userId, body) {
  if (body.skills) await profileModel.syncSkills(userId, body.skills)
  if (body.privacy) await profileModel.updatePrivacySettings(userId, body.privacy)
}

// ---------------------------------------------------------------- profiles/me

export const getMyProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileService.getOwnProfile(req.user.id))
})

/**
 * PUT /api/profiles/me - the combined endpoint. Dispatches on which profile the
 * caller has, so a member does not need to remember which route to use.
 */
export const putMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const body = req.body

  const table = await resolveTable(userId)
  if (!table) throw notFound('Profile')

  if (table === 'alumni_profiles') {
    await profileModel.upsertAlumniProfile(userId, alumniPayload(body))
  } else {
    await profileModel.upsertStudentProfile(userId, studentPayload(body))
  }
  await writeAddedColumns(userId, table, ADDED_COLUMNS(body))
  await applyCommon(userId, body)

  sendSuccess(res, await profileService.getOwnProfile(userId), {
    message: 'Profile updated',
  })
})

/** PATCH behaves identically; both verbs accept a partial body. */
export const patchMyProfile = putMyProfile

// ------------------------------------------------------------------- /alumni

export const putAlumniProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id
  if (!await profileModel.findAlumniProfileByUserId(userId)) {
    throw badRequest('No alumni profile exists for this account')
  }

  await profileModel.upsertAlumniProfile(userId, alumniPayload(req.body))
  await writeAddedColumns(userId, 'alumni_profiles', ADDED_COLUMNS(req.body))
  await applyCommon(userId, req.body)

  sendSuccess(res, await profileService.getOwnProfile(userId), {
    message: 'Alumni profile updated',
  })
})

export const getAlumniById = asyncHandler(async (req, res) => {
  const profile = await profileService.getProfileForViewer(req.params.userId, req.user)
  if (!profile.alumni) throw notFound('Alumni profile')
  sendSuccess(res, profile)
})

// ----------------------------------------------------------------- /students

export const putStudentProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id
  if (!await profileModel.findStudentProfileByUserId(userId)) {
    throw badRequest('No student profile exists for this account')
  }

  await profileModel.upsertStudentProfile(userId, studentPayload(req.body))
  await writeAddedColumns(userId, 'student_profiles', ADDED_COLUMNS(req.body))
  await applyCommon(userId, req.body)

  sendSuccess(res, await profileService.getOwnProfile(userId), {
    message: 'Student profile updated',
  })
})

export const getStudentById = asyncHandler(async (req, res) => {
  const profile = await profileService.getProfileForViewer(req.params.userId, req.user)
  if (!profile.student) throw notFound('Student profile')
  sendSuccess(res, profile)
})

// ------------------------------------------------------------ profile by id

export const getProfileById = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileService.getProfileForViewer(req.params.userId, req.user))
})

// --------------------------------------------------------------------- photo

export const uploadPhoto = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const table = await resolveTable(userId)
  if (!table) throw notFound('Profile')

  // Validation happens inside storePhoto, before anything touches disk.
  const stored = await storageService.storePhoto(userId, req.file)
  await writeAddedColumns(userId, table, { profile_photo: stored.url })

  sendCreated(res, {
    profilePhoto: stored.url,
    contentType: stored.contentType,
    size: stored.size,
  }, 'Profile photo updated')
})

export const deletePhoto = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const table = await resolveTable(userId)
  if (!table) throw notFound('Profile')

  const { rows } = await query(
    `SELECT profile_photo FROM ${table} WHERE user_id = $1`, [userId],
  )
  const current = rows[0]?.profile_photo

  await writeAddedColumns(userId, table, { profile_photo: null })
  if (current) await storageService.removePhoto(current.split('/').pop())

  sendSuccess(res, null, { message: 'Profile photo removed' })
})

// ------------------------------------------------------------------- privacy

export const getPrivacy = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.ensurePrivacySettings(req.user.id))
})

export const updatePrivacy = asyncHandler(async (req, res) => {
  sendSuccess(res,
    await profileModel.updatePrivacySettings(req.user.id, req.body),
    { message: 'Privacy settings updated' })
})

// --------------------------------------------------- education / experience

export const listEducation = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.listEducation(req.user.id))
})

export const addEducation = asyncHandler(async (req, res) => {
  const entry = await profileModel.addEducation(req.user.id, req.body)
  // `field` is the specification's name for `field_of_study`.
  if (req.body.fieldOfStudy !== undefined) {
    await query('UPDATE education SET field = $2 WHERE id = $1',
      [entry.id, req.body.fieldOfStudy])
  }
  sendCreated(res, { ...entry, field: entry.field ?? req.body.fieldOfStudy ?? null },
    'Education added')
})

export const deleteEducation = asyncHandler(async (req, res) => {
  await profileModel.deleteEducation(req.user.id, req.params.id)
  sendSuccess(res, null, { message: 'Education removed' })
})

export const listExperience = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.listExperience(req.user.id))
})

export const addExperience = asyncHandler(async (req, res) => {
  sendCreated(res, await profileModel.addExperience(req.user.id, req.body),
    'Experience added')
})

export const deleteExperience = asyncHandler(async (req, res) => {
  await profileModel.deleteExperience(req.user.id, req.params.id)
  sendSuccess(res, null, { message: 'Experience removed' })
})

// -------------------------------------------------------- social / skills

export const listSocialLinks = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.listSocialLinks(req.user.id))
})

export const upsertSocialLink = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.upsertSocialLink(req.user.id, req.body),
    { message: 'Social link saved' })
})

export const deleteSocialLink = asyncHandler(async (req, res) => {
  await profileModel.deleteSocialLink(req.user.id, req.params.id)
  sendSuccess(res, null, { message: 'Social link removed' })
})

export const listSkills = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.listSkills(req.query))
})

export const getSkills = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.getSkillsForUser(req.params.userId))
})

export const setSkills = asyncHandler(async (req, res) => {
  sendSuccess(res, await profileModel.syncSkills(req.user.id, req.body.skills),
    { message: 'Skills updated' })
})

// ------------------------------------------------------------- verification

export const submitVerification = asyncHandler(async (req, res) => {
  const result = await verificationService.submitForReview(req.user.id)
  sendSuccess(res, {
    status: verificationService.toApiStatus(result.verification_status),
  }, { message: 'Submitted for review' })
})

export const verificationHistory = asyncHandler(async (req, res) => {
  sendSuccess(res, await verificationService.listHistory(req.user.id))
})

export default {
  getMyProfile, putMyProfile, patchMyProfile,
  putAlumniProfile, getAlumniById,
  putStudentProfile, getStudentById,
  getProfileById, uploadPhoto, deletePhoto,
  getPrivacy, updatePrivacy,
  listEducation, addEducation, deleteEducation,
  listExperience, addExperience, deleteExperience,
  listSocialLinks, upsertSocialLink, deleteSocialLink,
  listSkills, getSkills, setSkills,
  submitVerification, verificationHistory,
}