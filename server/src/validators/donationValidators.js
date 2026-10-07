import { z } from 'zod'
import { donationSchema } from './communityValidators.js'

/**
 * Donation endpoints. The payment intent creation is a write to the donation
 * ledger and the provider, so it runs under the general write rate limit; the
 * Stripe webhook is the only unauthenticated donation route and it carries the
 * whole read because the signature check must see the raw body.
 */
export const createDonationSchema = donationSchema
  .extend({
    idempotencyKey: z.string().trim().min(8, 'An idempotency key has at least 8 characters')
      .max(120).optional(),
  })
  .strict()

export const confirmDonationSchema = z.object({
  providerReference: z.string().trim().min(1).max(190).optional(),
  transactionId: z.string().trim().min(1).max(190).optional(),
  donationId: z.string().uuid().optional(),
}).strict().refine((data) => data.providerReference || data.transactionId, {
  message: 'Either providerReference or transactionId is required',
})

export const donationIdParamSchema = z.object({
  id: z.string().uuid('Donation id must be a UUID'),
}).strict()

export const listDonationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()