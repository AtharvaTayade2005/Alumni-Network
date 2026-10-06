import * as conversationModel from '../models/conversationModel.js'
import * as messageService from './messageService.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'
import { emitToUsers } from '../sockets/index.js'

/**
 * Conversations.
 *
 * This is the service layer over the Phase 5 conversation tables. It owns three
 * decisions the model deliberately does not:
 *
 *   1. Who is allowed to open, read and write in a thread. Membership is checked
 *      here, never inferred from a request body.
 *   2. The privacy policy that governs messaging. The Phase 1 rule still decides
 *      whether a message may be sent at all, so opening a thread cannot be used to
 *      get round somebody's "nobody" setting.
 *   3. What gets pushed over the websocket. Pushing happens after the database
 *      has committed, so a client never sees a message that failed to save.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(value, label = 'id') {
  if (!UUID.test(String(value ?? ''))) throw badRequest(`Invalid ${label}`)
  return value
}

/**
 * Opens a thread with somebody, or returns the existing one.
 *
 * Allowed under exactly the same conditions as sending a message: the recipient
 * has to exist, be active, and be willing to be messaged. Otherwise "start a
 * conversation" would be a way to test who has blocked messaging from everyone.
 */
export async function openDirectConversation(userId, peerId) {
  assertUuid(userId, 'userId')
  assertUuid(peerId, 'peerId')
  if (userId === peerId) throw badRequest('You cannot start a conversation with yourself')

  const allowed = await messageService.assertConversationMember(userId, peerId)
  if (!allowed) throw forbidden('You cannot message this person')

  const conversation = await conversationModel.findOrCreateDirectConversation(userId, peerId)
  const view = await conversationModel.findConversationFor(userId, conversation.id)
  return view ?? { id: conversation.id, type: conversation.type, createdAt: conversation.created_at }
}

export async function listConversations(userId, paging = {}) {
  return conversationModel.listConversationsFor(userId, paging)
}

/** One thread, or a 404 that does not disclose whether it exists. */
export async function getConversation(userId, conversationId) {
  assertUuid(conversationId, 'conversationId')
  const conversation = await conversationModel.findConversationFor(userId, conversationId)
  if (!conversation) throw notFound('Conversation')
  return conversation
}

export async function listMessages(userId, conversationId, paging = {}) {
  await getConversation(userId, conversationId)
  const rows = await conversationModel.listMessages(conversationId, userId, paging)
  return rows.map((row) => ({
    ...messageService.formatMessage(row, userId),
    conversationId,
    readByPeer: Boolean(row.read_by_peer),
  }))
}

/**
 * Posts a message into a thread.
 *
 * The recipient is read from the thread's membership, never from the request, so
 * a client cannot post into somebody else's conversation by naming a different
 * peer. The Phase 1 privacy check runs again here rather than trusting that the
 * caller opened the thread at a moment when the policy allowed it.
 */
export async function sendMessage(userId, conversationId, { body, clientMessageId = null }) {
  assertUuid(conversationId, 'conversationId')
  const conversation = await getConversation(userId, conversationId)
  const recipientId = conversation.peerId

  const allowed = await messageService.assertConversationMember(userId, recipientId)
  if (!allowed) throw forbidden('You cannot message this person')

  const message = await messageService.sendMessage({
    senderId: userId,
    recipientId,
    body,
    conversationId,
    clientMessageId,
  })

  // The notification is raised inside messageService.sendMessage, not here: it
  // has to happen for the legacy route and the websocket too, and raising it in
  // both places meant every message sent through a conversation told the
  // recipient twice.

  // Emitted after the commit so both sides only ever see a stored message. The
  // push goes to the per-user rooms, which every socket joins on connection, so a
  // client gets exactly one copy whether or not it joined the thread's room.
  // A retry that matched an existing clientMessageId pushes again; clients
  // de-duplicate on the id they already hold.
  const payload = { ...message, conversationId }
  await emitToUsers([userId, recipientId], 'message:new', payload)

  return { ...message, conversationId }
}

/**
 * Marks a thread read for the caller, and tells them where the cursor ended up.
 *
 * `upTo` is resolved to a timestamp here rather than in the model, so a message
 * from another thread cannot be used as this thread's cursor, and so the receipts
 * and the cursor can be bounded by the same instant.
 */
export async function markRead(userId, conversationId, { upTo = null } = {}) {
  await getConversation(userId, conversationId)

  let upToAt = null
  let upToId = null
  if (upTo) {
    assertUuid(upTo, 'upTo')
    const found = await conversationModel.findMessageTime(conversationId, upTo)
    if (!found) throw notFound('Message in this conversation')
    upToAt = found.created_at
    upToId = found.id
  }

  await conversationModel.markMessagesRead(conversationId, userId, { upToAt })
  const position = conversationModel.formatReadPosition(
    await conversationModel.markRead(conversationId, userId, { upToAt, upToId }),
  )
  emitToUsers([userId], 'conversation:read', { conversationId, ...position })
  return position
}

export async function unreadCount(userId) {
  return conversationModel.unreadCount(userId)
}

/** Soft-deletes a message the caller sent. The row stays so receipts still line up. */
export async function deleteMessage(userId, messageId) {
  assertUuid(messageId, 'messageId')
  const deleted = await conversationModel.deleteMessage(messageId, userId)
  if (!deleted) throw notFound('Message')
  return { id: deleted.id, deletedAt: deleted.deleted_at }
}