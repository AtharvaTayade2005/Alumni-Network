import { z } from 'zod'

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(3000, 'Message cannot exceed 3000 characters'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']).default('user'),
        text: z.string().max(3000),
      })
    )
    .optional()
    .default([]),
})

export const searchSchema = z.object({
  query: z.string().trim().min(1, 'Search query cannot be empty').max(500, 'Search query cannot exceed 500 characters'),
  type: z.preprocess(
    (val) => (typeof val === 'string' ? val.toUpperCase() : val),
    z.enum(['ALL', 'PEOPLE', 'JOBS', 'EVENTS'])
  ).optional().default('ALL'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

export const resumeAnalyzeSchema = z.object({
  resumeText: z.string().trim().min(20, 'Resume text must be at least 20 characters').max(50000, 'Resume text exceeds maximum limit'),
  targetRole: z.string().trim().max(100).optional().default('Software Engineer'),
})

export const careerAnalyzeSchema = z.object({
  targetRole: z.string().trim().min(2, 'Target role is required').max(100),
  currentSkills: z.array(z.string().trim().max(50)).optional().default([]),
})
