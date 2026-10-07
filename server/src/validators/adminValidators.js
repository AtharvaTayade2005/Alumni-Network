import { z } from 'zod'
import { ROLES } from '../middleware/rbac.js'

const SELF_SERVICE_ROLES = [ROLES.ALUMNI, ROLES.STUDENT]

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  role: z.enum([ROLES.ADMIN, ROLES.ALUMNI, ROLES.STUDENT, ROLES.MODERATOR]).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const userIdParamSchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
}).strict()

export const updateUserRoleSchema = z.object({
  role: z.enum([ROLES.ADMIN, ROLES.ALUMNI, ROLES.STUDENT, ROLES.MODERATOR]),
}).strict()

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const auditLogsQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  targetType: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export { SELF_SERVICE_ROLES }