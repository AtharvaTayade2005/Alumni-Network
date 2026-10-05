# Mentorship API

A mentorship is a pairing between a **verified alumnus who has opted in** and a
member seeking guidance. It is deliberately stricter than a connection:

- Only an alumni account can mentor. A student profile has an
  `openToMentorship` flag meaning "I would like to be mentored"; it is not an
  offer to mentor and never appears in the mentor directory.
- The mentor must be `verified` and must have `is_open_to_mentor` set.
- The two members must already share an **accepted connection**.
- The mentor must have a free slot.

Everything here requires a bearer token.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/mentorship/mentors` | bearer | Mentor discovery |
| `GET` | `/api/mentorship/requests` | bearer | The caller's requests |
| `POST` | `/api/mentorship/requests` | bearer | Ask a mentor for guidance |
| `GET` | `/api/mentorship/requests/:id` | bearer | One request (participants only) |
| `PATCH` | `/api/mentorship/requests/:id/accept` | bearer | Mentor accepts; body `{ responseNote? }` |
| `PATCH` | `/api/mentorship/requests/:id/reject` | bearer | Mentor declines; body `{ responseNote? }` |
| `PATCH` | `/api/mentorship/requests/:id/cancel` | bearer | Mentee withdraws |
| `PATCH` | `/api/mentorship/requests/:requestId` | bearer | Legacy `{ status, responseNote? }` |
| `DELETE` | `/api/mentorship/requests/:requestId` | bearer | Legacy alias of `/cancel` |
| `GET` | `/api/mentorship/relationships` | bearer | The caller's mentorships |
| `GET` | `/api/mentorship/mentorships` | bearer | Alias of the above |
| `PATCH` | `/api/mentorship/relationships/:id/complete` | bearer | Mark a mentorship finished |
| `PATCH` | `/api/mentorship/relationships/:id/end` | bearer | End it early; body `{ endReason? }` |
| `PATCH` | `/api/mentorship/mentorships/:relationshipId/complete` | bearer | Alias of `/complete` |
| `PATCH` | `/api/mentorship/mentorships/:relationshipId/end` | bearer | Alias of `/end` |

`accept`, `reject` and `cancel` are bodyless apart from the optional note, so a
client may send an empty body.

## Discovery

`GET /api/mentorship/mentors` lists verified alumni who are opted in, ordered by
fewest active mentorships first and then most recently graduated, so the mentors
with room appear first.

| Parameter | Type | Notes |
| --- | --- | --- |
| `search` | string ≤120 | Name, current company or industry, `ILIKE` |
| `industry` | string ≤120 | Exact match |
| `page` | integer ≥1 | Default `1` |
| `limit` | integer 1–50 | Default `20` |

```json
{
  "success": true,
  "data": [
    {
      "id": "9f2a...",
      "name": "Grace Person",
      "avatarUrl": "/uploads/photos/...",
      "currentCompany": "Acme",
      "currentPosition": "Engineer",
      "industry": "Software",
      "degree": "BSc",
      "graduationYear": 2015,
      "bio": "Happy to talk about moving into platform work.",
      "openSlots": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

`openSlots` is `mentorship_capacity` minus the mentor's live relationships,
floored at `0`, computed in SQL. A mentor at capacity still appears here; the
capacity check happens when the request is created and again when it is accepted.

## Asking for mentorship

`POST /api/mentorship/requests`

| Field | Type | Notes |
| --- | --- | --- |
| `mentorId` | uuid | Required |
| `careerGoal` | string 20–2000 | Required; what the mentee wants to achieve |
| `interestArea` | string 2–150 | Required |
| `message` | string ≤2000 | Optional free text |
| `preferredCommunication` | `email`\|`chat`\|`call`\|`video` | Defaults to `email` |

The specification names two fields differently from the original API. Both
spellings are accepted, and sending both with different values is a `422`:

| Phase 3 name | Original name |
| --- | --- |
| `interestArea` | `areaOfInterest` |
| `preferredCommunication` | `preferredMode` |

Responses expose both spellings for the same reason, so a client written against
either contract reads the same value:

```json
{
  "success": true,
  "data": {
    "id": "e5a1...",
    "direction": "outgoing",
    "role": "mentee",
    "mentorId": "9f2a...",
    "menteeId": "4c8b...",
    "peerId": "9f2a...",
    "careerGoal": "Move from frontend into platform engineering.",
    "interestArea": "Platform engineering",
    "areaOfInterest": "Platform engineering",
    "message": null,
    "preferredCommunication": "email",
    "preferredMode": "email",
    "status": "PENDING",
    "responseNote": null,
    "respondedAt": null,
    "createdAt": "2025-01-04T09:12:00.000Z",
    "peer": { "id": "9f2a...", "name": "Grace Person", "currentCompany": "Acme" }
  },
  "message": "Mentorship request sent"
}
```

`role` and `direction` are relative to the caller: `role: "mentor"` with
`direction: "incoming"` in the mentor's inbox, `role: "mentee"` with
`direction: "outgoing"` for the mentee.

## Errors on create

| Situation | Code | Message |
| --- | --- | --- |
| Requesting yourself | `400` | You cannot request mentorship from yourself |
| Target is a student | `400` | Only an alumni member can offer mentorship |
| Target is inactive or suspended | `400` | That account is not available for mentorship |
| Target has not opted in | `400` | That member is not accepting mentorship requests right now |
| Target is not verified | `400` | That member is awaiting alumni verification |
| Mentor is at capacity | `400` | That mentor is already at capacity |
| Pair already has a live mentorship | `409` | You already have an active mentorship with this member |
| Pair already has a pending request | `409` | A mentorship request is already pending for this pair |
| Not connected | `400` | Connect with this member before requesting mentorship |
| Either side has blocked the pair | `403` | This member is not available for mentorship |

The pair state is checked before eligibility, so a mentor who is full *because of
this mentee* is told about the existing mentorship rather than about capacity.

Asking again after a **rejected** or **cancelled** request is allowed: the pair's
existing row is revived with the new goal and note. A `completed` request is not
revived, because a finished mentorship stays in the history.

## Answering

`PATCH /api/mentorship/requests/:id/accept` returns both halves of the result,
since the relationship is new:

```json
{
  "success": true,
  "data": {
    "request": { "id": "e5a1...", "status": "ACCEPTED", "role": "mentor", "...": "..." },
    "relationship": {
      "id": "r2d4...",
      "requestId": "e5a1...",
      "role": "mentor",
      "mentorId": "9f2a...",
      "menteeId": "4c8b...",
      "peerId": "4c8b...",
      "status": "ACTIVE",
      "startedAt": "2025-01-04T10:00:00.000Z",
      "endedAt": null,
      "endReason": null,
      "peer": { "id": "4c8b...", "name": "Sam Lee", "currentCompany": null, "currentPosition": null }
    }
  },
  "message": "Mentorship request accepted"
}
```

Rejecting returns the same envelope with `relationship: null`.

Accepting writes three rows that have to agree: the request's new status, the new
relationship, and the mentee's notification. They share one transaction with the
mentor's row locked, because the capacity that was free when the request arrived
may be gone by the time the mentor answers. A mentor whose slots filled up in the
meantime gets `409` ("That mentor is now at capacity") and **no** notification
reaches the mentee, which is the case the rollback test covers.

| Situation | Code |
| --- | --- |
| Answering somebody else's request | `403` |
| Answering an already-answered request | `409` |
| Capacity taken since the request was made | `409` |
| Unknown request | `404` |

Cancelling is the mentee's alone: `403` for the mentor, and `409` unless the
request is still pending.

## Completing versus ending

Both endpoints require an `active` relationship and either participant. They
differ in what they mean, so they are separate endpoints:

| | `/complete` | `/end` |
| --- | --- | --- |
| Relationship status | `COMPLETED` | `ENDED` |
| Originating request | moves to `COMPLETED` | stays `ACCEPTED` |
| Notification | `mentorship_completed` | `mentorship_ended` |
| Body | none | `{ endReason? }` |
| Frees capacity | yes | yes |

Completion is the successful outcome, so the request follows the relationship to
`COMPLETED`; otherwise an active mentorship and a finished one would look
identical in the request list. Ending early records that the pairing happened but
stopped, which the `ended` relationship status already says. Both writes happen
in one transaction, so a finished mentorship never appears with a still-pending
request.

## Listing

`GET /api/mentorship/requests`

| Parameter | Type | Notes |
| --- | --- | --- |
| `status` | `PENDING`\|`ACCEPTED`\|`REJECTED`\|`CANCELLED`\|`COMPLETED` | Optional |
| `role` | `mentor`\|`mentee`\|`all` | Default `all` |
| `page` | integer ≥1 | Default `1` |
| `limit` | integer 1–50 | Default `20` |

```json
{
  "success": true,
  "data": [],
  "meta": { "counts": { "pending": 1, "accepted": 2 } }
}
```

`GET /api/mentorship/relationships` takes `status` (`ACTIVE`, `COMPLETED` or
`ENDED`), `limit` (1–100, default 50) and `offset`.

Every state filter also accepts the lowercase spelling. Storage is lowercase
throughout; uppercasing is the API contract, and the lowercase form is honoured
so existing callers do not break.

## Privacy

`GET /api/mentorship/requests/:id` is restricted to the two participants, and
the restriction is not lifted for administrators: a request carries the mentee's
stated career goal, which is theirs to see.

## Notifications

| Event | Type | Recipient |
| --- | --- | --- |
| Request sent | `mentorship_request` | Mentor |
| Request accepted | `mentorship_accepted` | Mentee |
| Request declined | `mentorship_declined` | Mentee |
| Mentorship completed | `mentorship_completed` | Peer |
| Mentorship ended early | `mentorship_ended` | Peer |

`mentorship_declined` keeps its original spelling rather than becoming
`mentorship_rejected`: it is already in the database constraint, already stored
in existing rows, and already mapped by the client's notification badges. Only
`mentorship_completed` is new.

Every transition writes its notification inside the same transaction as the state
change, so a rollback cannot leave a notification describing something that did
not happen — a `409` on capacity leaves the mentee with neither an acceptance nor
an email. The queued email is written on the same transaction, so it is rolled
back with the rest.

Cancelling by the mentee notifies nobody, because the mentor never had anything
to do.

Each type maps to an email template, and every one names the other party. The
acceptance and decline mails read "Maya Mentor accepted…", which is right because
only a mentee reads them. Completion and early-end mails go to whichever
participant did not trigger them, so a mentor may be the reader; those templates
say "the mentorship with Maya Mentor" rather than naming the peer "your mentor".

Email follows `/api/notifications/preferences`: a recipient with `emailEnabled`
off still gets the in-app notification, and neither is suppressed by a muted
type. See [../api/README.md](README.md#notifications---apinotifications).

## Schema

Tables, constraints and indexes: [../backend/database.md](../backend/database.md#phase-3-tables).