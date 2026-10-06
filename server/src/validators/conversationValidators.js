import { z } from 'zod'

const uuid = z.string().uuid()

export const openConversationSchema = z.object({
  peerId: uuid,
})

export const conversationParamSchema = z.object({
  conversationId: uuid,
})

export const messageParamSchema = z.object({
  messageId: uuid,
})

export const postMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  // Optional, but a client that supplies one gets a safe retry. A client that
  // does not simply gets a new message every time it sends.
  clientMessageId: z.string().trim().min(1).max(100).optional(),
})

export const markConversationReadSchema = z.object({
  upTo: uuid.optional(),
})

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: uuid.optional(),
})

export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})