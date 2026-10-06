import { query, withTransaction } from '../config/database.js'

/**
 * Conversations.
 *
 * A conversation is a thread between two people. Phase 1 derived "who am I
 * talking to" from the message table on every request; this module makes the
 * thread a row of its own, so a thread can be opened before it has any messages,
 * carries its own read position, and can be joined by a socket.
 *
 * The Phase 1 columns stay the source of truth for who a message was sent to:
 * sender_id and recipient_id are what every existing query already reads, and
 * conversation_id is the grouping on top. Both are written together, so a direct
 * conversation can never claim a member who is not a sender or a recipient.
 */

/** The stable name for a pair, lowest id first, so the unique index can use it. */
export function directKey(userA, userB) {
  return [userA, userB].sort().join(':')
}

/**
 * Opens a direct conversation, or returns the one that already exists.
 *
 * Creating is idempotent because the client retries: a client that times out
 * asking to message somebody must not end up with two threads to the same person.
 * The unique index on direct_key resolves the race, and the loser re-reads the
 * winner's row instead of failing.
 */
export async function findOrCreateDirectConversation(userId, peerId) {
  const key = directKey(userId, peerId)
  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO conversations (type, direct_key)
       VALUES ('direct', $1)
       ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL DO UPDATE SET direct_key = EXCLUDED.direct_key
       RETURNING *`,
      [key],
    )
    const conversation = rows[0]

    for (const member of [userId, peerId]) {
      await db.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conversation.id, member],
      )
    }

    return conversation
  })
}

/** The caller's threads, most recently active first, with the peer inlined. */
export async function listConversationsFor(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT c.id, c.type, c.created_at, c.last_message_at,
            peer.user_id AS peer_id, p.last_read_at,
            u.first_name, u.last_name, u.avatar_url, u.is_active, u.is_suspended,
            (SELECT m.body FROM messages m
              WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
              ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT COUNT(*)::int FROM messages m
              WHERE m.conversation_id = c.id
                AND m.sender_id <> $1
                AND m.deleted_at IS NULL
                AND m.created_at > COALESCE(p.last_read_at, '-infinity'::timestamptz)) AS unread_count
       FROM conversations c
       JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = $1
       JOIN conversation_participants peer
         ON peer.conversation_id = c.id AND peer.user_id <> $1
       JOIN users u ON u.id = peer.user_id
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return rows.map(formatConversationSummary)
}

/** One thread as the caller sees it, or null when they are not a member. */
export async function findConversationFor(userId, conversationId) {
  const { rows } = await query(
    `SELECT c.id, c.type, c.created_at, c.last_message_at,
            peer.user_id AS peer_id, p.last_read_at, p.last_read_message_id,
            u.first_name, u.last_name, u.avatar_url, u.is_active, u.is_suspended
       FROM conversations c
       JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = $1
       JOIN conversation_participants peer
         ON peer.conversation_id = c.id AND peer.user_id <> $1
       JOIN users u ON u.id = peer.user_id
      WHERE c.id = $2`,
    [userId, conversationId],
  )
  if (!rows[0]) return null
  return formatConversationSummary(rows[0])
}

/** Whether the caller is a member of the thread. Used by every mutation. */
export async function isParticipant(conversationId, userId, db = { query }) {
  const { rows } = await db.query(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  )
  return rows.length > 0
}

/**
 * The messages in a thread, newest first.
 *
 * Paging backwards from the newest message is what a chat view asks for: the top
 * of the thread is the only part anybody opens, and `before` is a message id
 * rather than an offset so a message arriving mid-scroll cannot shift the window.
 */
export async function listMessages(conversationId, viewerId, { limit = 50, before = null } = {}) {
  const { rows } = await query(
    `SELECT m.*,
            EXISTS (SELECT 1 FROM message_read_status rs
                     WHERE rs.message_id = m.id AND rs.user_id <> $1) AS read_by_peer
       FROM messages m
      WHERE m.conversation_id = $2
        AND m.deleted_at IS NULL
        AND ($3::uuid IS NULL OR m.created_at < (
              SELECT created_at FROM messages WHERE id = $3))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $4`,
    [viewerId, conversationId, before, limit],
  )
  return rows
}

/**
 * Records a message in a thread.
 *
 * `clientMessageId` makes a retry safe: a client that never saw the answer sends
 * the same id again and gets the original row back instead of a second copy. The
 * dedupe is on (sender, client id), so two different people may use the same id.
 *
 * The message and the thread's `last_message_at` are written in one transaction.
 * They are two statements that have to agree — a message saved into a thread that
 * does not know about it sorts nowhere, and a thread ordered by a timestamp no
 * message carries — so a caller that gets an error from here knows neither half
 * landed. The update takes GREATEST so two people talking at once cannot walk the
 * thread's position backwards.
 *
 * `read_by_peer` in the listing counts anybody but the reader: the reader's own
 * receipts are what `isRead` already answers, and a sender watching their message
 * turn to "read" needs the other person's receipt.
 */
export async function appendMessage({ conversationId, senderId, recipientId, body, clientMessageId = null }, db = null) {
  const write = async (conn) => {
    const { rows } = await conn.query(
      `INSERT INTO messages (conversation_id, sender_id, recipient_id, body, client_message_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (sender_id, client_message_id) WHERE client_message_id IS NOT NULL
         DO UPDATE SET body = messages.body
       RETURNING *`,
      [conversationId, senderId, recipientId, body, clientMessageId],
    )
    const message = rows[0]

    await conn.query(
      `UPDATE conversations
          SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
              updated_at = NOW()
        WHERE id = $1`,
      [conversationId, message.created_at],
    )

    return message
  }

  return db ? write(db) : withTransaction(write)
}

/** When a message was sent, if it belongs to this thread. Null otherwise. */
export async function findMessageTime(conversationId, messageId, db = { query }) {
  const { rows } = await db.query(
    'SELECT id, created_at FROM messages WHERE id = $2 AND conversation_id = $1 AND deleted_at IS NULL',
    [conversationId, messageId],
  )
  return rows[0] ?? null
}

/**
 * Moves the caller's read position, and never backwards.
 *
 * Reading is a cursor, not a flag: the caller's own membership row carries
 * last_read_at, and unread is "messages after it". Marking up to a specific
 * message is what a client does when it scrolls to the end of a thread.
 *
 * `upToAt` is a timestamp the service has already resolved and checked against
 * this thread, not a message id. That is what makes the guard below possible: a
 * receipt for an older message cannot un-read a newer one, so two clients — one
 * scrolled to the top, one to the bottom — cannot argue the badge back and forth.
 * An update that does not move the cursor returns where the caller already was,
 * rather than a null that reads like there is nothing to show.
 */
export async function markRead(conversationId, userId, { upToAt = null, upToId = null } = {}, db = { query }) {
  const at = upToAt ?? new Date()
  const { rows } = await db.query(
    `UPDATE conversation_participants
        SET last_read_at = $3,
            last_read_message_id = COALESCE($4, last_read_message_id)
      WHERE conversation_id = $1
        AND user_id = $2
        AND (last_read_at IS NULL OR last_read_at < $3)
      RETURNING last_read_at, last_read_message_id`,
    [conversationId, userId, at, upToId],
  )
  if (rows[0]) return rows[0]

  const current = await db.query(
    `SELECT last_read_at, last_read_message_id
       FROM conversation_participants
      WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  )
  return current.rows[0] ?? null
}

/**
 * Writes read receipts for the messages a reader has now seen.
 *
 * Kept alongside the cursor so the sender's "delivered/read" ticks keep working
 * exactly as they did in Phase 1, where a receipt row per message was the whole
 * mechanism.
 *
 * `upToAt` bounds the receipts as well as the cursor. A client that says "I have
 * read up to here" has not read what came after it, and writing a receipt for the
 * rest of the thread would show the sender ticks that never happened.
 */
export async function markMessagesRead(conversationId, userId, { upToAt = null } = {}, db = { query }) {
  const { rowCount } = await db.query(
    `INSERT INTO message_read_status (message_id, user_id)
     SELECT m.id, $2
       FROM messages m
      WHERE m.conversation_id = $1
        AND m.sender_id <> $2
        AND m.deleted_at IS NULL
        AND ($3::timestamptz IS NULL OR m.created_at <= $3)
        AND NOT EXISTS (
          SELECT 1 FROM message_read_status rs
           WHERE rs.message_id = m.id AND rs.user_id = $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [conversationId, userId, upToAt],
  )
  return rowCount ?? 0
}

/** The total unread count across every thread, for a badge. */
export async function unreadCount(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS unread
       FROM messages m
       JOIN conversation_participants p
         ON p.conversation_id = m.conversation_id AND p.user_id = $1
      WHERE m.sender_id <> $1
        AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(p.last_read_at, '-infinity'::timestamptz)`,
    [userId],
  )
  return rows[0]?.unread ?? 0
}

/** Soft-deletes a message the caller sent, keeping the thread's shape intact. */
export async function deleteMessage(messageId, senderId) {
  const { rows } = await query(
    `UPDATE messages SET deleted_at = NOW()
      WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
      RETURNING *`,
    [messageId, senderId],
  )
  return rows[0] ?? null
}

/**
 * Where a member's read position ended up.
 *
 * Shaped like the rest of the API rather than like the row: a client that has just
 * been told where its cursor is should not have to know that the column is called
 * something else in the database.
 */
export function formatReadPosition(row) {
  if (!row) return null
  return {
    lastReadAt: row.last_read_at ?? null,
    lastReadMessageId: row.last_read_message_id ?? null,
  }
}

export function formatConversationSummary(row) {
  return {
    id: row.id,
    type: row.type,
    peerId: row.peer_id,
    peer: {
      id: row.peer_id,
      name: `${row.first_name} ${row.last_name}`,
      avatarUrl: row.avatar_url,
      isActive: row.is_active,
      isSuspended: row.is_suspended,
    },
    lastMessage: row.last_body ?? null,
    lastMessageAt: row.last_message_at ?? row.created_at,
    unreadCount: row.unread_count ?? 0,
    lastReadAt: row.last_read_at ?? null,
    lastReadMessageId: row.last_read_message_id ?? null,
    createdAt: row.created_at,
  }
}