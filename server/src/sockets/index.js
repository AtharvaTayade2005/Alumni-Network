import { Server } from 'socket.io'
import config from '../config/env.js'
import logger from '../utils/logger.js'
import { authenticateSocket } from '../middleware/auth.js'
import { registerMessageHandlers } from './messageHandlers.js'
import { assertConversationMember } from '../services/messageService.js'

let io = null

// Presence is opt-in, so the room is only populated by clients that asked to be
// seen. Without this, being online would be disclosed to every connected socket.
const PRESENCE_ROOM = 'presence:visible'
const MAX_CONVERSATION_ROOMS = 50
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// How many of a member's sockets are currently showing their presence. Presence
// is per connection, but online is per person: three tabs is still one person, and
// the person is still online until the last tab closes. Without this a member
// flickers offline every time they rearranged their windows.
const visibleConnections = new Map()

function visibilityChanged(socket, joined) {
  const userId = socket.user.id
  const before = visibleConnections.get(userId) ?? 0
  const after = joined ? before + 1 : Math.max(0, before - 1)
  visibleConnections.set(userId, after)
  return { before, after }
}

function allowJoin(socket) {
  const joined = socket.data.conversationRooms ?? 0
  if (joined >= MAX_CONVERSATION_ROOMS) return false
  socket.data.conversationRooms = joined + 1
  return true
}

export function initialiseRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
    path: '/socket.io',
    maxHttpBufferSize: 1e6,
  })

  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`)

    logger.debug('socket connected', { userId: socket.user.id })

    registerMessageHandlers(socket, io)

    // Joining a thread is the client's choice, but it is not free: each room is
    // held in memory for as long as somebody is in it. A client that wants to see
    // presence opts in explicitly, and a socket cannot accumulate rooms without
    // bound.
    socket.on('presence:subscribe', (ack) => {
      showPresence(socket)
      return ack?.({ ok: true })
    })

    socket.on('conversation:join', async (payload, ack) => {
      if (!allowJoin(socket)) {
        return ack?.({ ok: false, error: 'Too many conversations open' })
      }

      const peerId = payload?.peerId
      if (!UUID_PATTERN.test(String(peerId ?? ''))) {
        return ack?.({ ok: false, error: 'peerId is required' })
      }

      const allowed = await assertConversationMember(socket.user.id, peerId)
      if (!allowed) return ack?.({ ok: false, error: 'not authorised' })

      const room = roomName(socket.user.id, peerId)
      socket.join(room)
      return ack?.({ ok: true, room })
    })

    socket.on('conversation:leave', (payload) => {
      const peerId = payload?.peerId
      if (!UUID_PATTERN.test(String(peerId ?? ''))) return
      socket.leave(roomName(socket.user.id, peerId))
    })

    socket.on('disconnect', (reason) => {
      hidePresence(socket)
      logger.debug('socket disconnected', { userId: socket.user.id, reason })
    })
  })

  return io
}

/**
 * Shows the member as online to the people who asked to see it.
 *
 * Idempotent per socket: a client that subscribes and then announces itself is
 * one member online, not two, or they would be announced coming online twice and
 * going offline twice.
 */
function showPresence(socket) {
  if (socket.data.presenceVisible) return
  socket.data.presenceVisible = true
  socket.join(PRESENCE_ROOM)
  const { before, after } = visibilityChanged(socket, true)
  if (before === 0) socket.to(PRESENCE_ROOM).emit('user:online', { userId: socket.user.id })
  return after
}

/**
 * Takes the member back out of the presence room.
 *
 * Only a socket that was ever in the room can be taken out of it, so a client
 * that never subscribed is never announced as going offline: nobody was told it
 * was online in the first place.
 */
function hidePresence(socket) {
  if (!socket.data.presenceVisible) return
  socket.data.presenceVisible = false
  socket.leave(PRESENCE_ROOM)
  const { after } = visibilityChanged(socket, false)
  if (after === 0) socket.to(PRESENCE_ROOM).emit('user:offline', { userId: socket.user.id })
  return after
}

export function getRealtime() {
  return io
}

export function roomName(userA, userB) {
  return `dm:${[userA, userB].sort().join(':')}`
}

export async function emitToUsers(userIds, event, payload) {
  if (!io) return
  for (const id of new Set(userIds)) {
    io.to(`user:${id}`).emit(event, payload)
  }
}
