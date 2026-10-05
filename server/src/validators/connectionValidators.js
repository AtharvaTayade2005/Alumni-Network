import { z } from 'zod'

import { optionalText, uuidSchema } from './authValidators.js'

/**
 * Connection request validation.
 *
 * State filters are declared as uppercase enums because that is the documented
 * contract, but the service accepts the lowercase spelling too and normalises it,
 * so existing callers sending `status=accepted` keep working.
 */

export const listConnectionsSchema = z.object({
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED', 'pending', 'accepted',
    'rejected', 'blocked']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const pendingSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const connectSchema = z.object({
  userId: uuidSchema,
  message: optionalText(500),
})

export const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
})

/** A peer id in the path: status, mutuals, block and unblock all use this. */
export const userParamSchema = z.object({
  userId: uuidSchema,
})

/** A connection row id, as used by accept, reject and delete. */
export const connectionParamSchema = z.object({
  connectionId: uuidSchema,
})

export const idParamSchema = z.object({
  id: uuidSchema,
})
