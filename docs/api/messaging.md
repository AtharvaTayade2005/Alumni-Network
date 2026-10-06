# Messaging API

There are two message APIs. `/api/messages` is the original one from phase 1 and
still works exactly as it did. `/api/conversations` is the phase 5 one, built on
conversation rows instead of on pairs scraped out of the message table.

Use `/api/conversations` for anything new. The legacy routes are documented last
and kept only for older clients.

Everything requires a bearer token.

## Who may talk to whom

The rule is the recipient's, not the sender's, and it is enforced in
`messageService.assertConversationMember()` on every path — HTTP and websocket
alike:

| `allow_messages_from` | Who may open a thread |
| --- | --- |
| `everyone` | Any active member |
| `connections` (default) | Members with an accepted connection |
| `nobody` | Nobody |

A suspended or deactivated account cannot be messaged at all. Opening a
conversation is checked the same way as sending into one, so `POST /api/conversations`
is not a way to discover who has set theirs to `nobody`.

## Conversations

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/conversations` | bearer | The caller's threads |
| `GET` | `/api/conversations/unread-count` | bearer | `{ unread }` across every thread |
| `POST` | `/api/conversations` | bearer | Open, or return, a thread; body `{ peerId }` |
| `GET` | `/api/conversations/:conversationId` | bearer | One thread |
| `GET` | `/api/conversations/:conversationId/messages` | bearer | A page of the thread |
| `POST` | `/api/conversations/:conversationId/messages` | bearer | Post; body `{ body, clientMessageId? }` |
| `PATCH` | `/api/conversations/:conversationId/read` | bearer | Mark read; body `{ upTo? }` |
| `DELETE` | `/api/conversations/messages/:messageId` | bearer | Soft-delete your own |

`GET /api/conversations` accepts `limit` (1–100, default 50) and `offset`.

```json
{
  "success": true,
  "data": [
    {
      "id": "7b3e...",
      "type": "direct",
      "peerId": "c4d5...",
      "peer": {
        "id": "c4d5...",
        "name": "Grace Person",
        "avatarUrl": "/uploads/photos/...",
        "isActive": true,
        "isSuspended": false
      },
      "lastMessage": "See you at the meetup",
      "lastMessageAt": "2026-02-13T08:00:00.000Z",
      "unreadCount": 2,
      "lastReadAt": null,
      "createdAt": "2026-01-02T10:00:00.000Z"
    }
  ]
}
```

`peer` is the *other* participant, resolved from the thread's membership rather
than from anything the request said, so a client cannot be talked into showing the
wrong person.

## Opening a thread is idempotent

`POST /api/conversations` with the same `peerId` always returns the same thread,
from either side. The key is `direct_key` — the two ids, lowest first, joined by
a colon — and it carries a unique index, so two clients racing to open a thread
resolve to one row and the loser reads the winner's.

```json
{ "success": true, "data": { "id": "7b3e...", "peerId": "c4d5...", "peer": { "…": "…" } } }
```

`400` when the peer is yourself or the id is malformed. `403` when the recipient
will not accept messages from you. A malformed id is `422`, because it fails
validation before the service is reached.

## Messages

```json
{
  "success": true,
  "data": {
    "id": "9a2c...",
    "conversationId": "7b3e...",
    "senderId": "e6f7...",
    "recipientId": "c4d5...",
    "body": "See you at the meetup",
    "createdAt": "2026-02-13T08:00:00.000Z",
    "isRead": true,
    "readByPeer": false
  }
}
```

`isRead` is the reader's own state. `readByPeer` answers the sender's question —
did they read it — and is computed from receipts belonging to somebody other than
the caller.

| Parameter | Type | Notes |
| --- | --- | --- |
| `limit` | integer 1–100 | Default `50` |
| `before` | uuid | A message id; page backwards from it |

Paging is by cursor rather than offset on purpose: a message arriving while
somebody is scrolled up would shift every row under an offset and show them the
same message twice.

The recipient is read from the thread's membership, never from the request, so a
client cannot post into somebody else's conversation by naming a different peer.

### Retries

`clientMessageId` makes a retry safe:

```json
{ "body": "See you at the meetup", "clientMessageId": "b7f1-4a92" }
```

The pair `(sender_id, client_message_id)` is unique, so a client that never saw
the answer sends the same id again and gets the original message back rather than
a second copy. The key is per sender, so two people may use the same id.

Omit it and every retry is a new message, which is the right behaviour for a
client that does not care.

### Deleting

`DELETE /api/conversations/messages/:messageId` soft-deletes a message its sender
wrote. The row stays, so read receipts and the thread's shape do not change under
a client that is still holding the id, and the message stops appearing in the
thread. Only the sender may delete; anybody else gets `404`.

## Read positions

Reading is a cursor, not a flag. Each participant's membership row carries
`last_read_at`, and unread is "messages after it" — which is why an unread badge
is a single indexed count rather than a join across the whole history.

```json
PATCH /api/conversations/7b3e.../read   { "upTo": "9a2c..." }
```

`upTo` is optional. With it, the position moves to that message's timestamp,
which is what stops an older receipt from un-reading a newer one. Without it, the
position moves to now.

Both the position and the receipts are bounded by the same message. Reading up to
the middle of a thread leaves the rest unread and leaves the sender's later
messages without a read tick, because a receipt is a claim about what has been
read rather than about the whole thread. `upTo` from another thread is a `404`,
not a silent no-op.

```json
{
  "success": true,
  "data": {
    "conversationId": "7b3e...",
    "lastReadAt": "2026-02-13T08:05:00.000Z",
    "lastReadMessageId": "9a2c..."
  }
}
```

The response reports where the cursor ended up, not where it was asked to go. A
client whose receipt arrived late, or out of order with another tab, is told the
position it actually has rather than the one it requested.

Marking read also writes the per-message receipts in `message_read_status`, so
the phase 1 "delivered/read" ticks keep working for old clients.

## Notifications

Posting a message creates a `new_message` notification for the recipient, in-app
and by email if they have email on. It is sent from `messageService.sendMessage()`
on both the HTTP and the websocket path, so it does not depend on how the message
was sent, and it happens after the row is written so nobody is told about a
message that failed to save.

## Legacy routes

Unchanged, and still tested:

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/messages` | Threads, derived from the message table |
| `GET` | `/api/messages/with/:peerId` | A thread, newest last; marks it read |
| `GET` | `/api/messages/search?q=` | `ILIKE` over the caller's messages |
| `POST` | `/api/messages` | `{ recipientId, body }` |
| `POST` | `/api/messages/read/:peerId` | Marks read |

Two differences worth knowing:

- A legacy send now attaches itself to an existing conversation for the same
  pair, if there is one, so old and new clients do not fork a thread into two. It
  does not open one: that would create a conversation for a pair who have never
  spoken.
- A message sent over the websocket carries a real `conversationId` when it
  belongs to a conversation, and falls back to the old `dm:<lowId>:<highId>` room
  name when it does not.

Messages sent before migration 013 were folded into conversations by the
migration itself, deriving the pair from `sender_id` and `recipient_id`. They
appear in `/api/conversations` like any other message.