import * as messageService from '../services/messageService.js'
import { roomName } from './index.js'

/**
 * Websocket message handling.
 *
 * Sockets are cheap to connect and easy to drive, so the rules here mirror the
 * HTTP routes rather than trusting the client:
 *
 *   1. The recipient comes from the authenticated socket, never from the payload.
 *   2. The same privacy check the HTTP route uses decides whether a message may
 *      be sent at all, so the socket is not a way around somebody's settings.
 *   3. Every message-shaped event is rate limited per socket, on a sliding window
 *      rather than a fixed one. The socket is refused rather than merely slowed,
 *      because an unauthenticated peer on the same server should not pay for one
 *      client misbehaving, and a fixed window would let a client send a whole
 *      burst at the boundary.
 *   4. Bodies are length-checked here and again by the column constraint.
 *
 * The socket is an accelerator, not the source of truth: anything it delivers
 * could have been delivered by a GET instead, so a client that misses an event
 * recovers by re-reading the thread.
 */

const LIMITS = {
  send: { max: 30, windowMs: 60_000 },
  typing: { max: 60, windowMs: 10_000 },
  read: { max: 60, windowMs: 10_000 },
}

/**
 * A sliding window per event, held on the socket rather than in shared memory so
 * two processes behind a load balancer each rate limit their own connections.
 */
function allow(socket, event, { max, windowMs }) {
  const now = Date.now()
  const key = `rate:${event}`
  const hits = (socket.data[key] ?? []).filter((at) => now - at < windowMs)
  if (hits.length >= max) {
    socket.data[key] = hits
    return false
  }
  hits.push(now)
  socket.data[key] = hits
  return true
}

/** Rejects with a plain object so a handler cannot accidentally leak a stack. */
function refuse(ack, error) {
  return ack?.({ ok: false, error })
}

export function registerMessageHandlers(socket, io) {
  socket.on('message:send', async (payload, ack) => {
    try {
      if (!allow(socket, 'send', LIMITS.send)) {
        socket.emit('message:error', { error: 'Too many messages, slow down' })
        return refuse(ack, 'Too many messages, slow down')
      }

      const recipientId = payload?.recipientId
      const body = String(payload?.body ?? '').trim()

      if (!recipientId || recipientId === socket.user.id) {
        return refuse(ack, 'Invalid recipient')
      }
      if (!body || body.length > 5000) {
        return refuse(ack, 'Message must be 1-5000 characters')
      }

      const allowed = await messageService.assertConversationMember(
        socket.user.id, recipientId,
      )
      if (!allowed) {
        return refuse(ack, 'You cannot message this person')
      }

      const message = await messageService.sendMessage({
        senderId: socket.user.id,
        recipientId,
        body,
        clientMessageId: payload?.clientMessageId ?? null,
      })

      // Pushed on the per-user rooms only. Every socket joins its own user room
      // on connection, so each participant gets exactly one copy whether or not
      // they also joined the conversation room.
      //
      // `conversationId` is the Phase 5 thread when the message belongs to one, and
      // falls back to the Phase 1 room name so an old client still has something
      // to file the message under.
      const envelope = {
        ...message,
        conversationId: message.conversationId ?? roomName(socket.user.id, recipientId),
      }
      for (const id of new Set([socket.user.id, recipientId])) {
        io.to(`user:${id}`).emit('message:new', envelope)
      }

      return ack?.({ ok: true, message: envelope })
    } catch {
      socket.emit('message:error', { error: 'Failed to send message' })
      return refuse(ack, 'Failed to send message')
    }
  })

  socket.on('message:read', async (payload) => {
    try {
      if (!allow(socket, 'read', LIMITS.read)) return
      const peerId = payload?.peerId
      if (!peerId || peerId === socket.user.id) return

      // Membership before mutation: an unpaired socket must not be able to make
      // the server write read receipts by guessing ids.
      if (!await messageService.assertConversationMember(socket.user.id, peerId)) return

      const count = await messageService.markRead(socket.user.id, peerId)
      if (count > 0) {
        socket.to(roomName(socket.user.id, peerId)).emit('message:read', {
          by: socket.user.id,
          at: new Date().toISOString(),
        })
      }
    } catch {
      // A failed read receipt is not worth telling the client about: the thread
      // view re-reads state on the next page load anyway.
    }
  })

  socket.on('typing', async (payload) => {
    try {
      if (!allow(socket, 'typing', LIMITS.typing)) return
      const peerId = payload?.recipientId
      if (!peerId || peerId === socket.user.id) return
      if (!await messageService.assertConversationMember(socket.user.id, peerId)) return

      socket.to(roomName(socket.user.id, peerId)).emit('typing', {
        userId: socket.user.id,
        isTyping: Boolean(payload.isTyping),
      })
    } catch {
      // Typing indicators are best-effort and never worth an error reply.
    }
  })
}
