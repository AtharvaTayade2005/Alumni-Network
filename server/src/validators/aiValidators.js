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
  resumeText: z
    .string()
    .trim()
    .min(20, 'Resume text must be at least 20 characters')
    .max(50000, 'Resume text exceeds maximum limit')
    .optional(),
  targetRole: z.string().trim().max(100).optional(),
  jobId: z.string().uuid('Invalid job ID format').optional().nullable(),
  useStoredResume: z
    .preprocess((val) => val === true || val === 'true' || val === 1 || val === '1', z.boolean())
    .optional(),
  resumeId: z.string().uuid('Invalid resume file ID format').optional().nullable(),
})

export const careerAnalyzeSchema = z
  .object({
    targetRole: z.string().trim().min(2, 'Target role is required').max(100).optional(),
    jobId: z.string().uuid('Invalid job ID format').optional().nullable(),
    currentSkills: z.array(z.string().trim().max(50)).optional().default([]),
  })
  .refine((data) => Boolean(data.targetRole || data.jobId), {
    message: 'Target role or job ID is required',
    path: ['targetRole'],
  })

export const roadmapGenerateSchema = z
  .object({
    targetRole: z.string().trim().min(2, 'Target role is required').max(100).optional(),
    jobId: z.string().uuid('Invalid job ID format').optional().nullable(),
    regenerate: z.boolean().optional().default(false),
  })
  .refine((data) => Boolean(data.targetRole || data.jobId), {
    message: 'Target role or job ID is required',
    path: ['targetRole'],
  })


export const roadmapTaskUpdateSchema = z.object({
  isCompleted: z.boolean({ required_error: 'isCompleted status is required' }),
})

export const taskIdParamSchema = z.object({
  taskId: z.string().uuid('Invalid roadmap task ID format'),
})

export const readinessQuerySchema = z.object({
  targetRole: z.string().trim().max(100).optional(),
  jobId: z.string().uuid('Invalid job ID format').optional().nullable(),
})

export const roadmapQuerySchema = z.object({
  roadmapId: z.string().uuid('Invalid roadmap ID format').optional().nullable(),
  targetRole: z.string().trim().max(100).optional(),
  jobId: z.string().uuid('Invalid job ID format').optional().nullable(),
})

export const resourcesQuerySchema = z.object({
  targetRole: z.string().trim().max(100).optional(),
})
