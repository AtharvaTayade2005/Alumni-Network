import { z } from 'zod'
import { ROLES } from '../middleware/rbac.js'

const SELF_SERVICE_ROLES = [ROLES.ALUMNI, ROLES.STUDENT]

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  role: z.enum([ROLES.ADMIN, ROLES.ALUMNI, ROLES.STUDENT, ROLES.MODERATOR]).optional(),
  // Mirrors the account_status enum. PENDING_VERIFICATION is included so an
  // administrator can find accounts that still need to confirm an address.
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const userIdParamSchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
}).strict()

export { SELF_SERVICE_ROLES }