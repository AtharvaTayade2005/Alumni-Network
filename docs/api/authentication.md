# Authentication API

Base URL `http://localhost:5000/api`. All bodies are JSON.

## Response envelope

Success:

```json
{ "success": true, "data": {}, "message": "optional", "meta": {} }
```

Failure:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": { "code": "UNPROCESSABLE", "message": "Validation failed", "details": [] }
}
```

`message` is repeated at the top level and `details` are mirrored to `errors`
for compatibility with the existing client. Stack traces appear only outside
production.

Codes: `BAD_REQUEST`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`UNPROCESSABLE`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create an account |
| POST | `/auth/login` | — | Sign in |
| POST | `/auth/logout` | cookie | Revoke the refresh session |
| POST | `/auth/refresh` | cookie + CSRF | Rotate the session |
| GET | `/auth/me` | bearer | Current user |
| POST | `/auth/forgot-password` | — | Request a reset link |
| POST | `/auth/reset-password` | — | Consume a reset token |
| GET | `/auth/verify-email` | — | Consume a verification token |
| GET | `/admin/users` | bearer + ADMIN | List accounts |
| GET | `/admin/users/:userId` | bearer + ADMIN | Account detail |
| GET | `/health` | — | Liveness and database status |

Rate limits apply per IP: 10 login attempts, 5 registrations, 60 writes per
window (`RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_REGISTER_MAX`,
`RATE_LIMIT_WRITE_MAX`). Exceeding one returns `429`.

### POST /api/auth/register

```json
{
  "firstName": "Ada", "lastName": "Lovelace",
  "email": "ada@example.edu",
  "password": "Str0ngPass!23",
  "role": "ALUMNI",
  "graduationYear": 2015,
  "acceptTerms": true
}
```

`role` accepts `ALUMNI` or `STUDENT` only; anything else is `422`. `ALUMNI`
requires `graduationYear`, `STUDENT` requires `yearOfStudy`.

`201` returns the user and a message. The account starts as
`PENDING_VERIFICATION`. `409` if the email is already registered.

### POST /api/auth/login

```json
{ "email": "ada@example.edu", "password": "Str0ngPass!23" }
```

`200` returns the user, an access token and the expiry, and sets the refresh and
CSRF cookies:

```json
{ "success": true, "data": { "user": {}, "accessToken": "...", "expiresIn": 900 } }
```

`401` for a wrong password or unknown address — the message is identical for
both. `403` when the account is suspended or deactivated.

### POST /api/auth/refresh

Send the refresh cookie and the CSRF header. Returns a new access token and a
new refresh cookie; the presented token is revoked, so replaying it returns
`401`.

### POST /api/auth/logout

Revokes the presented refresh token and clears both cookies. `200` on success.

### GET /api/auth/me

Requires `Authorization: Bearer <accessToken>`. Returns the current user with
`fullName` and `accountStatus`.

### POST /api/auth/forgot-password

```json
{ "email": "ada@example.edu" }
```

Always `200` with the same message, whether or not the address exists. In
development the link is readable from `email_queue`
(`SELECT payload->>'link' FROM email_queue WHERE to_email = $1 ORDER BY created_at DESC LIMIT 1`).

### POST /api/auth/reset-password

```json
{ "token": "<from the link>", "password": "An0therPass!23" }
```

`200` on success; `400` for an unknown, expired or already-used token.
Completing the reset revokes every refresh token for the account.

### GET /api/auth/verify-email?token=<token>

`200` once verified; `400` for an unknown, expired or reused token. The
account's `accountStatus` becomes `ACTIVE`.

### GET /api/admin/users

`requireRole(ADMIN)`. Query: `search`, `role`, `status`, `page` (default 1),
`limit` (default 20, max 100). Unknown parameters are rejected with `422`.

```json
{
  "success": true,
  "data": [{
    "id": "…", "email": "…", "full_name": "Ada Lovelace",
    "account_status": "ACTIVE", "is_email_verified": true,
    "roles": ["ALUMNI"], "last_login_at": "…", "created_at": "…"
  }],
  "meta": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

### GET /api/admin/users/:userId

Returns `{ "user": { … } }`. `404` if unknown, `422` if `userId` is not a UUID.

### GET /api/health

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "environment": "development",
    "timestamp": "…",
    "checks": { "database": "connected" }
  }
}
```

## Authorization summary

| Caller | Result |
| --- | --- |
| No token | `401 UNAUTHENTICATED` |
| Student or alumni → `/api/admin/*` | `403 FORBIDDEN` |
| Administrator → `/api/admin/*` | `200` |

Roles come from the database on every request; role information in a token,
header or request body is ignored.