import { z } from 'zod'
import { emailSchema, nameSchema, optionalText, uuidSchema } from './authValidators.js'

const coordinate = z.coerce.number().min(-90).max(90).nullable().optional()
const longitude = z.coerce.number().min(-180).max(180).nullable().optional()

export const privacySettingsSchema = z.object({
  showEmail: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  showEmployer: z.boolean().optional(),
  showSocialLinks: z.boolean().optional(),
  showProfileInDirectory: z.boolean().optional(),
  showMentorshipAvailability: z.boolean().optional(),
  allowConnectionRequests: z.boolean().optional(),
  allowMessagesFrom: z.enum(['everyone', 'connections', 'nobody']).optional(),
})

export const updateUserSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).optional().nullable()
    .or(z.literal('').transform(() => null)),
  email: emailSchema.optional(),
})

export const alumniProfileSchema = z.object({
  graduationYear: z.coerce.number().int().min(1950).max(new Date().getFullYear()),
  degree: z.string().trim().max(150).optional().nullable(),
  department: z.string().trim().max(150).optional().nullable(),
  currentCompany: z.string().trim().max(150).optional().nullable(),
  currentPosition: z.string().trim().max(150).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  bio: optionalText(2000),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  latitude: coordinate,
  longitude,
  isOpenToMentor: z.boolean().optional(),
  mentorshipCapacity: z.coerce.number().int().min(0).max(10).optional(),
  showOnMap: z.boolean().optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
}).refine(
  (data) => (data.latitude == null) === (data.longitude == null),
  { message: 'Latitude and longitude must be provided together', path: ['latitude'] },
)

export const studentProfileSchema = z.object({
  degree: z.string().trim().min(2).max(150),
  department: z.string().trim().max(150).optional().nullable(),
  yearOfStudy: z.coerce.number().int().min(1).max(6),
  expectedGraduation: z.coerce.number().int().min(new Date().getFullYear())
    .max(new Date().getFullYear() + 10).optional().nullable(),
  careerInterests: optionalText(1500),
  bio: optionalText(2000),
  isOpenToMentorship: z.boolean().optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
})

export const educationSchema = z.object({
  institution: z.string().trim().min(2).max(200),
  degree: z.string().trim().max(150).optional().nullable(),
  fieldOfStudy: z.string().trim().max(150).optional().nullable(),
  startYear: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 10).optional().nullable(),
  endYear: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 10).optional().nullable(),
  grade: z.string().trim().max(20).optional().nullable(),
  description: optionalText(1000),
}).refine(
  (data) => !data.startYear || !data.endYear || data.endYear >= data.startYear,
  { message: 'End year must be after the start year', path: ['endYear'] },
)

export const experienceSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  companyId: uuidSchema.optional().nullable(),
  title: z.string().trim().min(2).max(150),
  location: z.string().trim().max(150).optional().nullable(),
  description: optionalText(2000),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship',
    'freelance', 'volunteer', 'self_employed']).optional().nullable(),
  isCurrent: z.boolean().default(false),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
}).refine(
  // A current role has no end date; clearing it keeps the record consistent
  // with the experience_current_no_end_check constraint added in migration 009.
  (data) => !data.isCurrent || !data.endDate,
  { message: 'A current role cannot have an end date', path: ['endDate'] },
).refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: 'End date must be after the start date', path: ['endDate'] },
)

/**
 * A URL must be absolute and use http(s).
 *
 * Zod's `.url()` accepts `javascript:` and `data:` because they are technically
 * valid URLs, so the protocol is checked explicitly. Stored links are rendered
 * as hrefs by clients, which makes an accepted `javascript:` value a stored XSS
 * vector.
 */
export const httpUrlSchema = z.string().trim().max(500)
  .url('Enter a valid URL')
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Only http and https URLs are allowed')

export const socialLinkSchema = z.object({
  platform: z.enum(['linkedin', 'github', 'portfolio', 'twitter', 'website', 'other']),
  url: httpUrlSchema,
  isPrimary: z.boolean().default(false),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

export const userParamSchema = z.object({
  userId: z.string().uuid(),
})

export const skillSearchSchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/**
 * A single PATCH /profiles/me endpoint serves both member types, so the
 * accepted body is the union of the user, alumni and student fields. Every
 * field is optional; the service layer applies partial updates.
 *
 * Both the Phase 2 camelCase names (jobTitle, major) and the 001 column names
 * (currentPosition, department) are accepted, because the mentorship, jobs and
 * connection modules still speak the latter and clients were written against it.
 */
export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).optional().nullable(),

  graduationYear: z.coerce.number().int().min(1950)
    .max(new Date().getFullYear() + 10).optional().nullable(),
  degree: z.string().trim().max(150).optional().nullable(),
  department: z.string().trim().max(150).optional().nullable(),
  major: z.string().trim().max(150).optional().nullable(),
  university: z.string().trim().max(200).optional().nullable(),
  currentCompany: z.string().trim().max(150).optional().nullable(),
  currentPosition: z.string().trim().max(150).optional().nullable(),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),

  yearOfStudy: z.coerce.number().int().min(1).max(10).optional().nullable(),
  expectedGraduation: z.coerce.number().int().min(1950)
    .max(new Date().getFullYear() + 15).optional().nullable(),
  careerInterests: optionalText(1500),
  isOpenToMentorship: z.boolean().optional(),

  bio: optionalText(2000),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  latitude: coordinate,
  longitude,
  isOpenToMentor: z.boolean().optional(),
  mentorshipCapacity: z.coerce.number().int().min(0).max(10).optional(),
  showOnMap: z.boolean().optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
}).refine(
  (data) => (data.latitude == null) === (data.longitude == null),
  { message: 'Latitude and longitude must be provided together', path: ['latitude'] },
)

export const directorySearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  graduationYear: z.coerce.number().int().min(1950).max(2200).optional(),
  graduationYearFrom: z.coerce.number().int().min(1950).max(2200).optional(),
  graduationYearTo: z.coerce.number().int().min(1950).max(2200).optional(),
  degree: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  location: z.string().trim().max(150).optional(),
  company: z.string().trim().max(150).optional(),
  industry: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  skills: z.string().trim().max(300).optional(),
  openToMentor: z.coerce.boolean().optional(),
  hasLocation: z.coerce.boolean().optional(),
  verifiedOnly: z.coerce.boolean().default(false),
  role: z.enum(['ALUMNI', 'STUDENT']).optional(),
  sort: z.enum(['name', 'recent', 'graduation_year', 'relevance'])
    .default('relevance'),
  order: z.enum(['asc', 'desc']).default('asc'),
})

export const mapSchema = z.object({
  country: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
})

export const mentorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  skill: z.string().trim().max(100).optional(),
  availableOnly: z.enum(['true', 'false']).default('true'),
})

// =========================================================
// Phase 2: profile write, verification and directory
// =========================================================

const graduationYear = z.coerce.number().int().min(1950).max(2200)

/**
 * PUT /api/profiles/me and PUT /api/alumni/me.
 *
 * Every field is optional so the endpoint behaves as a partial update, matching
 * the existing PATCH /profiles/me. Fields are also constrained to null rather
 * than merely omitted, which is how a member clears a value.
 */
export const putAlumniProfileSchema = z.object({
  graduationYear: graduationYear.optional().nullable(),
  degree: z.string().trim().max(150).optional().nullable(),
  major: z.string().trim().max(150).optional().nullable(),
  university: z.string().trim().max(200).optional().nullable(),
  currentCompany: z.string().trim().max(150).optional().nullable(),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  bio: optionalText(2000),
  profilePhoto: httpUrlSchema.optional().nullable(),
  mentorshipAvailable: z.boolean().optional(),
  mentorshipCapacity: z.coerce.number().int().min(0).max(10).optional(),
  showOnMap: z.boolean().optional(),
  privacy: privacySettingsSchema.optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' },
)

export const putStudentProfileSchema = z.object({
  degree: z.string().trim().max(150).optional().nullable(),
  major: z.string().trim().max(150).optional().nullable(),
  graduationYear: graduationYear.optional().nullable(),
  university: z.string().trim().max(200).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  bio: optionalText(2000),
  careerInterests: optionalText(1500),
  profilePhoto: httpUrlSchema.optional().nullable(),
  yearOfStudy: z.coerce.number().int().min(1).max(10).optional().nullable(),
  // A student may say whether they want to be mentored. `mentorshipAvailable` is
  // not accepted here: that name means "I will mentor" on an alumni profile, and
  // only a verified alumnus may set it.
  openToMentorship: z.boolean().optional(),
  privacy: privacySettingsSchema.optional(),
  skills: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update' },
)

/**
 * Admin verification decision. Verifying accepts an optional note; rejecting
 * requires a reason, which is a separate schema so the requirement is enforced
 * on the reject route rather than by a conditional refine.
 */
export const verifySchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
})

export const rejectReasonSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required to reject a verification')
    .max(1000),
})

export const verificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
})

/**
 * GET /api/alumni. Each parameter maps to an indexed column; `sort` is an
 * allow-list so it cannot be used to inject SQL through ORDER BY.
 */
export const alumniDirectorySchema = z.object({
  search: z.string().trim().max(120).optional(),
  graduationYear: graduationYear.optional(),
  graduationYearFrom: graduationYear.optional(),
  graduationYearTo: graduationYear.optional(),
  major: z.string().trim().max(150).optional(),
  location: z.string().trim().max(150).optional(),
  employer: z.string().trim().max(150).optional(),
  industry: z.string().trim().max(120).optional(),
  skills: z.string().trim().max(300).optional(),
  openToMentor: z.coerce.boolean().optional(),
  verifiedOnly: z.coerce.boolean().default(false),
  hasLocation: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['relevance', 'name', 'recent', 'graduation_year', 'company', 'industry'])
    .default('relevance'),
  order: z.enum(['asc', 'desc']).default('asc'),
})

export const facetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
})
