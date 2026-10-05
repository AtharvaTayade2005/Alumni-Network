# Connections and Blocking API

Connections are the social backbone of the portal: messaging, mentorship and
mutual-context all key off an accepted connection. Everything here requires a
bearer token.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/connections` | bearer | The caller's connections, filterable by status |
| `GET` | `/api/connections/requests` | bearer | Incoming requests awaiting an answer |
| `GET` | `/api/connections/pending` | bearer | Alias of `/requests` |
| `GET` | `/api/connections/stats` | bearer | Counts by status |
| `GET` | `/api/connections/status/:userId` | bearer | Pair state with one member |
| `GET` | `/api/connections/mutuals/:userId` | bearer | Members connected to both parties |
| `POST` | `/api/connections` | bearer | Send a request; body `{ userId, message? }` |
| `POST` | `/api/connections/:userId` | bearer | Send a request to the member in the path |
| `PATCH` | `/api/connections/:id/accept` | bearer | Accept an incoming request |
| `PATCH` | `/api/connections/:id/reject` | bearer | Decline an incoming request |
| `PATCH` | `/api/connections/:connectionId` | bearer | Legacy `{ action: "accept" \| "decline" }` |
| `DELETE` | `/api/connections/:id` | bearer | Remove the connection with that id |
| `POST` | `/api/connections/:userId/block` | bearer | Block a member |
| `POST` | `/api/connections/block/:userId` | bearer | Alias of the above |
| `DELETE` | `/api/connections/:userId/block` | bearer | Unblock a member |
| `DELETE` | `/api/connections/block/:userId` | bearer | Alias of the above |

Literal segments (`requests`, `pending`, `stats`, `block`) are registered before
the `:id` forms, so they are not captured as UUIDs.

## States

| State | Meaning |
| --- | --- |
| `PENDING` | Sent, not yet answered |
| `ACCEPTED` | Both members are connected |
| `REJECTED` | Declined; the pair may try again |
| `BLOCKED` | One member blocked the other |

`GET /api/connections/status/:userId` answers with a *pair* state rather than a
row state, because that is what a client asking "what can I do here?" needs:

| `state` | Meaning |
| --- | --- |
| `self` | The caller and the target are the same person |
| `none` | No row, or a previously rejected one |
| `pending_outgoing` | The caller sent the request |
| `pending_incoming` | The target sent the request |
| `connected` | Accepted |
| `blocked` | Blocked in either direction |

A rejected request reads as `none`: the pair is free to try again, and the
caller is not told that a declined request is still sitting in the table.

## Request and response shapes

`POST /api/connections` takes `userId` in the body; `POST /api/connections/:userId`
takes it from the path and accepts the same optional `message`.

```json
{
  "success": true,
  "data": {
    "id": "b7c1d2e3-...",
    "status": "PENDING",
    "direction": "outgoing",
    "blockedByMe": false,
    "peer": {
      "id": "9f2a...",
      "name": "Grace Person",
      "avatarUrl": "/uploads/photos/...",
      "currentCompany": "Acme",
      "currentPosition": "Engineer",
      "graduationYear": 2015,
      "degree": "BSc",
      "yearOfStudy": null,
      "headline": "Acme"
    },
    "createdAt": "2025-01-04T09:12:00.000Z",
    "respondedAt": null
  },
  "message": "Connection request sent"
}
```

`direction` is relative to the caller: `outgoing` when the caller sent the
request, `incoming` when they received it. It is derived per request rather than
stored, so it is always correct for whoever reads the row.

`peer` is `null` for a blocked row on both sides. The blocked member must not be
able to read who blocked them, and the blocker has no further action to take, so
neither view needs the peer. `blockedByMe` is the field that tells the two apart:
`true` only for the blocker.

`GET /api/connections` returns the same objects as an array, with per-status
counts in `meta.counts`:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "counts": { "accepted": 12, "incoming": 1, "outgoing": 2, "blocked": 0 }
  }
}
```

`GET /api/connections/stats` returns those numbers as the payload itself:
`{ "connections": 12, "pending_received": 1, "pending_sent": 2 }`.

## Errors

| Situation | Code | Message |
| --- | --- | --- |
| Requesting yourself | `400` | You cannot connect with yourself |
| Target is inactive or suspended | `400` | That account is not available for connections |
| Target has `allow_connection_requests` off | `403` | This person is not accepting connection requests |
| Already connected | `409` | You are already connected |
| Request already pending | `409` | You already sent a request |
| The target already sent you one | `409` | This person has already sent you a request |
| Either side has blocked the pair | `403` | Connections are not available |
| Answering somebody else's request | `403` | You can only respond to requests addressed to you |
| Answering an already-answered request | `400` | This request has already been handled |
| Removing a connection you are not part of | `404` | Connection |

## Retrying and duplicates

A pair owns at most one `connections` row, held unique by the symmetric index
`connections_pair_symmetric_unique`. Two consequences:

- **A retry after a rejection works.** The rejected row is revived in place
  (`status` back to `pending`, `responded_at` cleared) rather than a second row
  being inserted, because a second row would violate the index.
- **A simultaneous double-send resolves to `409`, not `500`.** Both senders can
  pass the state check before either writes; the unique index settles the race
  and the losing transaction is translated into the same conflict the pre-check
  would have produced.

The revive happens under a `SELECT … FOR UPDATE` lock on the pair row, so two
simultaneous retries cannot both revive it.

## Blocking

There is no separate blocks table. A block is a `connections` row with status
`blocked` in which `requester_id` is always the blocker:

- Blocking rewrites `requester_id`/`addressee_id`, not just the status, which is
  what makes "did I block them?" (`blockedByMe`) answerable without a second table.
- **Both members read `blocked`.** The blocked member is not told they were
  blocked, so the API cannot answer differently for them.
- The blocked member cannot unblock. `DELETE …/block` matches only the row where
  the caller is the requester, so a blocked member's attempt is a `404`, not a
  silent success that would leak the block's existence.
- Blocking is idempotent for the blocker: a repeated block returns `200` rather
  than failing, because a retried request should not report an error.
- Unblocking deletes the row entirely rather than resetting it to `rejected`, so
  neither side is left holding a stale declined request.
- A block is refused with `403` when the caller is the blocked party, so the
  endpoint cannot be used to discover or clear someone else's block.

Messaging and mentorship both check the pair state, so a block stops those
without either module needing its own logic. See
[mentorship.md](mentorship.md) for the mentorship side.

## Notifications

| Event | Type | Recipient |
| --- | --- | --- |
| Request sent | `connection_request` | Target |
| Request accepted | `connection_accepted` | Requester |

The request row, its notification and its queued email are written in one
transaction, so a rollback cannot leave a request nobody was told about. A decline
sends no notification and no email: the answerer sees the new state directly, and
the requester can read their own list. Socket emission happens after the
transaction commits.

Blocking and removing a connection send no notification at all. Telling someone
they were blocked would defeat the block, and telling them about a removal they
initiated is noise.

Schema: [../backend/database.md](../backend/database.md#phase-3-tables).
