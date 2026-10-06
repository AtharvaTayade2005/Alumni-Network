import { query } from '../config/database.js'
import * as conversationModel from '../models/conversationModel.js'
import * as notificationService from '../services/notificationService.js'

const ONLINE_WINDOW = '2 minutes'

export async function assertConversationMember(userId, peerId) {
  if (!userId || !peerId || userId === peerId) return false

  const { rows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM users WHERE id = $1 AND is_active AND NOT is_suspended) AS peer_exists,
       (SELECT allow_messages_from FROM privacy_settings WHERE user_id = $1) AS peer_setting`,
    [peerId],
  )
  if (!rows[0]?.peer_exists) return false

  const policy = rows[0].peer_setting ?? 'connections'
  if (policy === 'nobody') return false
  if (policy === 'everyone') return true

  const { rows: conn } = await query(
    `SELECT 1 FROM connections
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1))`,
    [userId, peerId],
  )
  return conn.length > 0
}

/**
 * Sends a message.
 *
 * Two callers reach this: the Phase 1 route, which passes only sender and
 * recipient, and the Phase 5 conversation route, which passes a conversation it
 * has already checked membership of. A legacy send attaches to an existing
 * thread for the same pair when there is one, so old and new clients do not fork a
 * conversation into two, but it does not open one: that would mean creating a
 * thread for a pair who have never spoken.
 *
 * `clientMessageId` makes a client's retry safe. Without it every retry is a new
 * row, which is how a timed-out request ends up posted twice.
 */
export async function sendMessage({ senderId, recipientId, body, conversationId = null, clientMessageId = null }) {
  const conversation = conversationId
    ?? (await findDirectConversation(senderId, recipientId))

  const message = conversation
    ? await conversationModel.appendMessage(
      { conversationId: conversation, senderId, recipientId, body, clientMessageId },
    )
    : await insertLegacyMessage({ senderId, recipientId, body })

  await notificationService.notify({
    userId: recipientId,
    actorId: senderId,
    type: 'new_message',
    title: 'New message',
    body: body.slice(0, 140),
    link: '/messages',
    // The notification is raised here rather than in each caller so the legacy
    // route, the conversations route and the websocket all tell the recipient
    // exactly once, whichever way the message arrived. The thread id rides along
    // so the client can jump straight to it instead of guessing from the link.
    metadata: { conversationId: message.conversation_id ?? null },
  })

  return formatMessage(message, senderId)
}

/** The existing thread for a pair, or null. Does not create one. */
async function findDirectConversation(senderId, recipientId) {
  const { rows } = await query(
    'SELECT id FROM conversations WHERE direct_key = $1',
    [conversationModel.directKey(senderId, recipientId)],
  )
  return rows[0]?.id ?? null
}

async function insertLegacyMessage({ senderId, recipientId, body }) {
  const { rows } = await query(
    `INSERT INTO messages (sender_id, recipient_id, body)
     VALUES ($1,$2,$3) RETURNING *`,
    [senderId, recipientId, body],
  )
  return rows[0]
}

export function formatMessage(row, viewerId) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    // The Phase 5 thread this belongs to, when there is one. A Phase 1 send to
    // somebody who has never spoken has no conversation, and the client decides
    // where to file it.
    conversationId: row.conversation_id ?? null,
    body: row.body,
    createdAt: row.created_at,
    isRead: row.read_at ? true : row.sender_id === viewerId,
  }
}

export async function listConversations(userId) {
  const { rows } = await query(
    `WITH peer_ids AS (
       SELECT DISTINCT
         CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS peer_id
       FROM messages
       WHERE sender_id = $1 OR recipient_id = $1
     ),
     ranked AS (
       SELECT m.*,
         CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS peer_id,
         ROW_NUMBER() OVER (
           PARTITION BY CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
           ORDER BY m.created_at DESC
         ) AS rn
       FROM messages m
       WHERE m.sender_id = $1 OR m.recipient_id = $1
     )
     SELECT p.peer_id,
            u.first_name, u.last_name, u.avatar_url, u.is_active, u.is_suspended,
            r.body AS last_body, r.created_at AS last_at,
            (SELECT COUNT(*)::int
             FROM messages m2
             WHERE m2.sender_id = p.peer_id
               AND m2.recipient_id = $1
               AND NOT EXISTS (
                 SELECT 1 FROM message_read_status rs
                 WHERE rs.message_id = m2.id AND rs.user_id = $1)) AS unread_count,
            EXISTS (SELECT 1 FROM user_presence pr
                    WHERE pr.user_id = p.peer_id
                      AND pr.last_seen_at > NOW() - INTERVAL '2 minutes') AS online
     FROM peer_ids p
     JOIN users u ON u.id = p.peer_id
     LEFT JOIN ranked r ON r.peer_id = p.peer_id AND r.rn = 1
     ORDER BY r.created_at DESC NULLS LAST`,
    [userId],
  )

  return rows.map((r) => ({
    peerId: r.peer_id,
    name: `${r.first_name} ${r.last_name}`,
    avatarUrl: r.avatar_url,
    isOnline: r.online && r.is_active && !r.is_suspended,
    lastMessage: r.last_body,
    lastMessageAt: r.last_at,
    unreadCount: r.unread_count,
  }))
}

export async function listMessages(userId, peerId, { limit = 50, before }) {
  const params = [userId, peerId]
  let beforeClause = ''
  if (before) {
    params.push(before)
    beforeClause = `AND m.created_at < (SELECT created_at FROM messages WHERE id = $${params.length})`
  }
  params.push(limit)

  const { rows } = await query(
    `SELECT m.* FROM messages m
     WHERE ((m.sender_id = $1 AND m.recipient_id = $2)
        OR (m.sender_id = $2 AND m.recipient_id = $1))
       ${beforeClause}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params,
  )

  const messages = rows.reverse().map((r) => formatMessage(r, userId))
  await markRead(userId, peerId)
  return messages
}

export async function markRead(userId, peerId) {
  const { rows } = await query(
    `INSERT INTO message_read_status (message_id, user_id, read_at)
     SELECT m.id, $1, NOW()
     FROM messages m
     WHERE m.sender_id = $2
       AND m.recipient_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM message_read_status rs
         WHERE rs.message_id = m.id AND rs.user_id = $1)
     ON CONFLICT (message_id, user_id) DO NOTHING
     RETURNING message_id`,
    [userId, peerId],
  )
  return rows.length
}

export async function markConversationRead(userId, peerId) {
  return markRead(userId, peerId)
}

export async function searchMessages(userId, term, limit = 20) {
  const { rows } = await query(
    `SELECT m.*, u.first_name, u.last_name
     FROM messages m
     JOIN users u ON u.id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
     WHERE (m.sender_id = $1 OR m.recipient_id = $1)
       AND m.body ILIKE '%' || $2 || '%'
     ORDER BY m.created_at DESC LIMIT $3`,
    [userId, term, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    with: `${r.first_name} ${r.last_name}`,
    body: r.body,
    createdAt: r.created_at,
  }))
}

export async function setOnline(userId, online) {
  if (online) {
    await query(
      `INSERT INTO user_presence (user_id, last_seen_at) VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_seen_at = NOW()`,
      [userId],
    )
  } else {
    await query(
      'UPDATE user_presence SET last_seen_at = NOW() WHERE user_id = $1', [userId],
    )
  }
}

export async function isOnline(userId) {
  const { rows } = await query(
    `SELECT last_seen_at FROM user_presence
     WHERE user_id = $1 AND last_seen_at > NOW() - $2::INTERVAL`,
    [userId, ONLINE_WINDOW],
  )
  return rows.length > 0
}
