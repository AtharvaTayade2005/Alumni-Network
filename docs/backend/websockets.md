# Websockets

The server runs one Socket.IO endpoint on the same HTTP server as the API, at
`/socket.io`, so there is nothing extra to deploy and no second origin to
configure.

A socket is an accelerator, not a source of truth. Everything it delivers could
have been delivered by a `GET`, so a client that misses an event recovers by
re-reading the thread. That is what keeps a dropped connection, a restarted
server and a client that was in a background tab from turning into lost messages.

## Connecting

```js
import { io } from 'socket.io-client'

const socket = io('http://localhost:5000', {
  auth: { token: accessToken },
  transports: ['websocket'],
})
```

The token is the same JWT the HTTP API uses, and it is checked once at handshake
by `authenticateSocket`. A socket without a valid token is refused during the
handshake and never connects.

| Setting | Value | Why |
| --- | --- | --- |
| `path` | `/socket.io` | Matches the API's own path |
| `auth.token` | Access token | Identity comes from here and nowhere else |
| CORS origin | `CLIENT_URL` | Credentials are allowed, so the origin cannot be `*` |

Identity is taken from the handshake and stored on the socket. Nothing in an event
payload can change who a socket is, so a client cannot post as somebody else by
naming them.

## Rooms

Every socket joins `user:<id>` on connection. This is the room that makes
delivery work without any setup: to reach a member, emit to their user room.

| Room | Joined | Used for |
| --- | --- | --- |
| `user:<id>` | Automatically on connect | All delivery to that member |
| `dm:<lowId>:<highId>` | `conversation:join` | Pair-scoped events |
| `presence:visible` | `presence:subscribe` | Presence announcements |

A thread's room name is the two member ids, lowest first, so both sides of a
conversation derive the same name without agreeing on it beforehand. Nothing is
delivered *only* to a thread room — the user rooms are always included — so a
client gets exactly one copy of a message whether or not it ever joined the
thread.

## Events

### Client to server

| Event | Payload | Ack | Notes |
| --- | --- | --- | --- |
| `message:send` | `{ recipientId, body, clientMessageId? }` | `{ ok, message }` | `clientMessageId` makes a retry safe |
| `message:read` | `{ peerId }` | none | Best-effort |
| `typing` | `{ recipientId, isTyping }` | none | Best-effort |
| `conversation:join` | `{ peerId }` | `{ ok, room }` | Refused for a non-peer |
| `conversation:leave` | `{ peerId }` | none | |
| `presence:subscribe` | — | `{ ok }` | Opt in to presence |

### Server to client

| Event | Payload | Notes |
| --- | --- | --- |
| `message:new` | The message, plus `conversationId` | Sent to both participants |
| `message:error` | `{ error }` | Generic on purpose |
| `message:read` | `{ by, at }` | Pair room only |
| `typing` | `{ userId, isTyping }` | Pair room only |
| `user:online` | `{ userId }` | Presence room only |
| `user:offline` | `{ userId }` | Presence room only |
| `conversation:read` | `{ conversationId, lastReadAt, lastReadMessageId }` | The reader's own devices |

`conversationId` on `message:new` is the Phase 5 thread when the message belongs
to one, and falls back to the Phase 1 `dm:<lowId>:<highId>` room name otherwise,
so a client from before Phase 5 still has something to file the message under.

## Rules a client cannot break

The socket paths call the same services as the HTTP routes. That is the point: a
socket is not a way round a check.

- **The recipient comes from the payload, but permission comes from the server.**
  `assertConversationMember()` decides, exactly as it does for `POST /api/messages`,
  which means the socket cannot be used to message somebody whose
  `allow_messages_from` is `nobody` or who has no accepted connection with you.
- **Bodies are validated before they are stored**, and the column constraint checks
  the length again. A 5000-character limit enforced once, in one process, is a
  limit that can be passed.
- **Every message-shaped event is rate limited per socket**, on a sliding window:

  | Event | Limit |
  | --- | --- |
  | `message:send` | 30 per minute |
  | `typing` | 60 per 10 seconds |
  | `message:read` | 60 per 10 seconds |

  A socket over its limit is refused rather than slowed. An over-quota connection
  is that client's problem, and letting it consume the server would make it
  everybody's. The window is held on the socket, so two processes behind a load
  balancer each rate limit their own connections instead of sharing a counter.
- **A socket cannot accumulate rooms without bound.** A connection is allowed 50
  conversation rooms over its lifetime; past that, `conversation:join` is refused.
  Each room is held in server memory for as long as somebody is in it.
- **Errors are generic.** A failed send answers `message:error` with no detail.
  Distinguishing "no such user" from "not allowed to message" tells an
  unauthenticated peer which ids are real.

## Presence

Presence is opt-in, and only members who subscribe appear in it.

```
socket.emit('presence:subscribe')   → joins presence:visible
```

A socket that never subscribed is never announced, in either direction. Announcing
it as offline would tell every watching client that somebody went away whom nobody
had been told was there.

Presence is tracked per person rather than per connection: a member with three
tabs open is online until the last one closes, so they do not flicker offline every
time they rearrange their windows.

## Rendering

Three things will go wrong in a client that trusts events alone, and each has a
mechanical answer:

1. **A socket connects after a message was sent.** Ask for the thread on open
   (`GET /api/conversations/:id/messages`) rather than waiting for an event.
2. **Two tabs, two sockets.** Deduplicate on `message.id`. A retry with the same
   `clientMessageId` is answered with the original message and pushed again
   deliberately, so a client that has already rendered that id should ignore it.
3. **A click sends before the socket is up.** Fall back to
   `POST /api/conversations/:id/messages`. The socket is for receiving, not for
   making a send depend on a connection that may not be open.

The `ack` on `message:send` is what tells a client its message is stored. An
unacknowledged send is unknown, not lost: re-send it with the same
`clientMessageId` and get the original row back.