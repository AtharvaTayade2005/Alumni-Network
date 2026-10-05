# API Reference

Base URL: `http://localhost:5000/api`

## Conventions

- All endpoints are namespaced under `/api`.
- Requests and responses are JSON unless noted.
- Timestamps are ISO-8601 UTC strings; money is `NUMERIC(12,2)`.

### Response shapes

Success:

```json
{
  "success": true,
  "data": { },
  "message": "Connection request sent",
  "meta": { "page": 1, "limit": 20, "total": 16, "totalPages": 1 }
}
```

`message` is only present for actions that warrant a human-readable confirmation.
`meta` is only present on paginated endpoints.

Failure:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": { "code": "UNPROCESSABLE" },
  "errors": [{ "field": "latitude", "message": "...", "code": "invalid_type" }]
}
```

`errors` is present only for schema-validation failures (`422`).

### Status codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Resource created |
| 400 | Malformed request the client must fix (bad JSON, bad upload) |
| 401 | Missing, invalid, or expired access token |
| 403 | Authenticated but not permitted (CSRF, privacy, account lockout) |
| 404 | Resource or route not found |
| 409 | Conflict (duplicate email, existing connection request) |
| 413 | Upload exceeds the size limit |
| 415 | Upload MIME type not allowed |
| 422 | Schema validation failed; see `errors` |
| 429 | Rate limit exceeded |
| 503 | Database unreachable |

In non-production environments, 500 responses also include a `stack` field.

### Authentication

Access tokens are short-lived JWTs sent as `Authorization: Bearer <token>`.
Refresh tokens are opaque random strings stored hashed, delivered in an
`httpOnly` cookie scoped to `/api/auth`, and rotated on every use.

Cookie-authenticated state changes (`/api/auth/refresh`, `/api/auth/logout`) are
CSRF protected: the client must echo the readable `csrf_token` cookie in an
`x-csrf-token` request header.

---

## Health

### GET /api/health

Readiness probe. Touches the database and returns `503` when it is unreachable,
so it is mounted before the database-availability gate.

```json
{
  "status": "ok",
  "service": "Alumni Network Portal API",
  "environment": "development",
  "uptimeSeconds": 128,
  "checks": { "database": "connected" }
}
```

---

## Auth — `/api/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | – | Create an account and its role profile |
| POST | `/login` | – | Exchange credentials for an access token + cookies |
| POST | `/refresh` | cookie | Rotate the refresh token, issue a new access token |
| POST | `/logout` | cookie | Revoke the refresh token and clear cookies |
| POST | `/forgot-password` | – | Queue a password reset email (always `200`) |
| POST | `/reset-password` | – | Consume a reset token and revoke all sessions |
| GET | `/verify-email` | – | Consume an email verification token (`?token=`) |
| POST | `/verify-email` | – | Same, for clients that send the token in a body |
| GET | `/me` | bearer | Current user with roles |
| POST | `/change-password` | bearer | Change password and revoke other sessions |

Accounts lock for `LOCKOUT_MINUTES` after `MAX_FAILED_LOGINS` failed attempts.
Unknown-email logins return the same message as wrong passwords to avoid
account enumeration.

---

## Profiles — `/api/profiles`

Full reference: [profiles.md](profiles.md). Privacy rules: [../backend/privacy.md](../backend/privacy.md).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/me` | bearer | Profile bundle: user, role profile, skills, education, experience, socials, privacy |
| PUT | `/me` | bearer | Full or partial update; dispatches on profile type |
| PATCH | `/me` | bearer | Partial update; `skills` is synced case-insensitively |
| PUT | `/alumni/me` | bearer | Alumni-only update (`/api/alumni/me`) |
| PUT | `/students/me` | bearer | Student-only update (`/api/students/me`) |
| GET | `/me/education` | bearer | Education history |
| POST | `/me/education` | bearer | Add an education entry |
| DELETE | `/me/education/:id` | bearer | Delete an entry |
| GET | `/me/experience` | bearer | Work experience |
| POST | `/me/experience` | bearer | Add an experience entry |
| DELETE | `/me/experience/:id` | bearer | Delete an entry |
| GET | `/me/social-links` | bearer | Social links |
| PUT | `/me/social-links` | bearer | Create or replace social links |
| DELETE | `/me/social-links/:id` | bearer | Delete a social link |
| GET | `/me/privacy` | bearer | Privacy settings |
| PATCH | `/me/privacy` | bearer | Update privacy settings |
| POST | `/me/photo` | bearer | Upload a profile photo (JPEG/PNG/WebP/GIF, 2 MB) |
| DELETE | `/me/photo` | bearer | Delete the stored profile photo |
| POST | `/me/verification` | bearer | Submit an alumni profile for verification |
| GET | `/me/verification` | bearer | Verification decision history |
| POST | `/me/resume` | bearer | Upload a resume (PDF/DOC/DOCX, 5 MB) |
| GET | `/me/resume` | bearer | Resume metadata and download URL |
| DELETE | `/me/resume` | bearer | Delete the stored resume |
| GET | `/skills` | bearer | Browse the shared skill taxonomy |
| GET | `/directory` | bearer | Search the alumni directory (paginated) |
| GET | `/directory/filters` | bearer | Available filter options |
| GET | `/directory/map` | bearer | Map points for verified, opted-in alumni |
| GET | `/:userId` | bearer | Public profile; contact details honour the owner's privacy settings |
| GET | `/:userId/skills` | bearer | Another user's skills |

Notification preferences live under `/api/notifications`, not here.

Latitude and longitude must be supplied together and are range-checked
(latitude ±90, longitude ±180).

`verification_status` is lowercase in the database and uppercase
(`PENDING`/`VERIFIED`/`REJECTED`) in responses.

---

## Alumni Directory — `/api/alumni`

Full reference: [directory.md](directory.md).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | bearer | Search, filter, sort and paginate the directory |
| GET | `/facets` | bearer | Distinct filter values with counts |
| GET | `/locations` | bearer | Grouped locations for autocomplete |
| GET | `/me`, `/me/*` | bearer | The caller's own alumni profile (see above) |
| GET | `/:userId` | bearer | One alumni profile, redacted for the viewer |

---

## Admin Verification — `/api/admin/alumni`

Requires the `ADMIN` role.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/pending` | admin | Verification review queue, oldest first |
| GET | `/:userId` | admin | Full profile detail for review |
| PATCH | `/:userId/verify` | admin | Mark verified |
| PATCH | `/:userId/reject` | admin | Mark rejected; `reason` required |

Every decision appends a row to `alumni_verification_events` in the same
transaction as the status change.

---

## Connections — `/api/connections`

Full reference: [networking.md](networking.md).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | bearer | List connections, filterable by status |
| GET | `/requests`, `/pending` | bearer | Incoming requests |
| GET | `/stats` | bearer | Connection counts by status |
| GET | `/status/:userId` | bearer | `none`, `pending_incoming`, `pending_outgoing`, `connected`, `blocked` |
| GET | `/mutuals/:userId` | bearer | Shared connections |
| POST | `/` | bearer | Send a request; body `{ userId, message? }` |
| POST | `/:userId` | bearer | Send a request to the member in the path |
| PATCH | `/:id/accept`, `/:id/reject` | bearer | Answer an incoming request |
| PATCH | `/:connectionId` | bearer | Legacy `{ action: "accept" \| "decline" }` |
| DELETE | `/:id` | bearer | Remove the connection by id |
| POST | `/:userId/block`, `/block/:userId` | bearer | Block a member |
| DELETE | `/:userId/block`, `/block/:userId` | bearer | Unblock a member |

A connection pair is unique regardless of who initiated it, so a retry after a
rejection revives the existing row and a simultaneous double-send resolves to
`409`. Blocking sets the pair to `blocked` with `requester_id` as the blocker, and
both members read `blocked` — the blocked one is not told. Blocking also revokes
messaging and mentorship access.

---

## Mentorship — `/api/mentorship`

Full reference: [mentorship.md](mentorship.md).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/mentors` | bearer | Verified alumni who are opted in and have room |
| GET | `/requests` | bearer | The caller's requests; `role`, `status`, paginated |
| POST | `/requests` | bearer | Ask a mentor; body `{ mentorId, careerGoal, interestArea, … }` |
| GET | `/requests/:id` | bearer | One request (participants only) |
| PATCH | `/requests/:id/accept`, `/reject` | bearer | Mentor's answer; body `{ responseNote? }` |
| PATCH | `/requests/:id/cancel` | bearer | Mentee withdraws |
| PATCH | `/requests/:requestId` | bearer | Legacy `{ status, responseNote? }` |
| DELETE | `/requests/:requestId` | bearer | Legacy alias of `/cancel` |
| GET | `/relationships`, `/mentorships` | bearer | The caller's mentorships |
| PATCH | `/relationships/:id/complete` | bearer | Finished: relationship and request both COMPLETED |
| PATCH | `/relationships/:id/end` | bearer | Ended early; relationship ENDED, request stays ACCEPTED |

A mentorship requires an accepted connection, a mentor who is a **verified
alumnus** with `is_open_to_mentor` set, and a free slot. Capacity is re-checked
under a row lock when the request is accepted, so a mentor whose slots filled up
gets `409` and the mentee receives no notification. Completing or ending frees the
slot.

`interestArea`/`preferredCommunication` and `areaOfInterest`/`preferredMode` are
accepted and returned interchangeably.

---

## Messages — `/api/messages`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/conversations` | bearer | Conversation list with unread counts and presence |
| GET | `/search` | bearer | Search own message history (`q`) |
| GET | `/with/:peerId` | bearer | Message thread |
| POST | `/` | bearer | Send a message; body `{ recipientId, body }` |
| POST | `/read/:peerId` | bearer | Mark a thread read |

Messaging requires an accepted connection unless the recipient's
`allow_messages_from` is `everyone`. `nobody` blocks all inbound messages.

Realtime delivery uses Socket.IO (see `server/src/sockets/`). Clients
authenticate the handshake with the access token; presence is tracked in the
`user_presence` table.

---

## Notifications — `/api/notifications`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | bearer | Paginated list, filterable by `unreadOnly` and `type` |
| GET | `/unread-count` | bearer | Unread count, optionally by `type` |
| GET | `/preferences` | bearer | Notification preferences |
| PATCH | `/preferences` | bearer | Update notification preferences |
| PATCH | `/:id/read` | bearer | Mark one notification read |
| POST | `/read-all` | bearer | Mark all read |
| DELETE | `/:id` | bearer | Delete a notification |

Preferences are per type: `emailEnabled` off still leaves the in-app
notification, and a type in `mutedTypes` suppresses both. Notifications that
describe a state change are written inside the same transaction as that change,
so a rollback cannot leave a notification about something that did not happen.
Deleting a member who acted in a notification sets `actor_id` to `null` rather
than deleting the notification.

---

## Rate limits

Applied per IP over a 15-minute window (register is hourly). The values below
are the development defaults; automated tests raise them so the limiter stays on
the code path without flaking.

| Scope | Default | Window |
| --- | --- | --- |
| Global API | 600 | 15 min |
| Login | 10 | 15 min |
| Register | 5 | 60 min |
| Authenticated writes | 60 | 15 min |
| Resume upload | 20 | 15 min |
