import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol')

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Email is required')
  .max(255)
  .email('Enter a valid email address')

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(80, 'Must be at most 80 characters')

export const uuidSchema = z.string().uuid('Must be a valid identifier')
export const idParamSchema = z.object({ id: uuidSchema })

export const optionalText = (max = 2000) => z.string().trim().max(max).optional().nullable()

export const yearSchema = z.coerce
  .number()
  .int()
  .min(1950, 'Year looks too early')
  .max(new Date().getFullYear() + 10, 'Year looks too far in the future')

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ROLE_VALUES = ['ALUMNI', 'STUDENT', 'PROFESSOR', 'FACULTY']

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(ROLE_VALUES),
  graduationYear: yearSchema.optional(),
  degree: z.string().trim().max(150).optional(),
  department: z.string().trim().max(150).optional(),
  studentIdNumber: z.string().trim().max(60).optional(),
  yearOfStudy: z.coerce.number().int().min(1).max(6).optional(),
  acceptTerms: z.literal(true, { message: 'You must accept the terms to register' }),
}).superRefine((data, ctx) => {
  if (data.role === 'ALUMNI' && !data.graduationYear) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['graduationYear'],
      message: 'Graduation year is required for alumni accounts',
    })
  }
  if ((data.role === 'ALUMNI' || data.role === 'PROFESSOR' || data.role === 'FACULTY') && data.yearOfStudy !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['yearOfStudy'],
      message: 'Year of study applies to student accounts only',
    })
  }
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Reset token is required'),
  password: passwordSchema,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must differ from the current password',
  path: ['newPassword'],
})

export const verifyEmailSchema = z.object({ token: z.string().min(20) })

export const oauthCallbackSchema = z.object({
  code: z.string().min(4),
  state: z.string().min(4),
})
