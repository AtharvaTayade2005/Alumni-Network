# Authentication and RBAC

## Roles

`roles` holds `ADMIN`, `ALUMNI`, `STUDENT` and `MODERATOR`, joined to users by
`user_roles`. A user may hold several roles; the role list is loaded from the
database on every authenticated request and is never read from a token or a
request body.

Registration accepts **only** `ALUMNI` and `STUDENT`. The check is enforced
twice: the Zod schema rejects any other value with `422`, and `authService`
independently rejects anything outside the allow-list so a future caller that
bypasses the route cannot grant itself a privileged role.

`ADMIN` is only ever assigned out of band, by a seed or an administrative
action.

## Account status

`users.account_status` is an enum: `ACTIVE`, `INACTIVE`, `SUSPENDED`,
`PENDING_VERIFICATION`.

Migration 008 maintains it from the pre-existing `is_active`, `is_suspended` and
`is_email_verified` booleans with a `BEFORE INSERT OR UPDATE` trigger. The
direction is one-way on purpose: existing modules keep writing the booleans and
`account_status` follows, so the two representations cannot drift apart.
Suspension outranks deactivation, which outranks pending verification, because
the more restrictive state should win when several apply.

Branch on `account_status`, not on the individual booleans.

## Passwords

Passwords are hashed with **bcrypt** at a cost of 12 (`BCRYPT_ROUNDS`), reduced
to 4 under `NODE_ENV=test` so the suite is not dominated by the KDF. Argon2id is
the preferred algorithm; it is not enabled here because it needs a native build
step, and bcrypt at cost 12 is the documented fallback.

Rules enforced by the validator and re-checked in the service:

- at least 10 characters and at most 128
- at least one uppercase letter, one lowercase letter and one digit
- at least one non-alphanumeric character
- rejected outright: `password`, `12345678`, `qwerty`, `letmein`, `iloveyou`,
  `admin`, `welcome`, `changeme`, `abc123` and the email's local part

Plaintext passwords, reset tokens, refresh tokens and JWT secrets are never
written to the log. The error handler logs method, path, status, code and user
id only.

Repeated failures lock an account for `LOCKOUT_MINUTES` after
`MAX_FAILED_LOGINS` attempts. A wrong password and an unknown address produce
the same message so the endpoint cannot be used to enumerate accounts.

## Tokens

Two token types with different secrets:

| | Access | Refresh |
| --- | --- | --- |
| Lifetime | `JWT_EXPIRES_IN` (15m) | `JWT_REFRESH_EXPIRES_IN` (7d) |
| Transport | `Authorization: Bearer` | `httpOnly` cookie, path `/api/auth` |
| Payload | `sub`, `type` | `sub`, `jti`, `type` |
| Storage | not stored | SHA-256 hash in `refresh_tokens` |
| Revocation | expiry only | `revoked_at`, or delete on logout |

The access token payload carries no email address or other personal data. A JWT
is base64 encoded rather than encrypted, so anything placed in it is readable by
the client; roles are therefore re-read from the database per request instead of
being embedded.

### Refresh rotation

`POST /api/auth/refresh` exchanges a refresh token for a new pair:

1. hash the presented token and look it up
2. reject if unknown, expired or already revoked
3. **revoke the presented token**
4. issue a fresh refresh token and access token

Because the old row is revoked in the same step, replaying a rotated token
fails with `401`. Logout revokes the presented token and clears both cookies.

### Cookie and CSRF

The refresh token is an `httpOnly`, `SameSite=Lax` (strict in production) cookie
scoped to `/api/auth`, so it is never readable from JavaScript and is not sent
to unrelated routes. A readable `csrf_token` cookie is set alongside it; state-
changing requests must echo it in the `x-csrf-token` header, which
`csrfProtection` requires for any non-safe method. The refresh cookie is signed
with `JWT_REFRESH_SECRET` and is verified before use.

### Password reset and email verification

Both flows use the same shape: a random token is generated, **only its SHA-256
hash** is stored, and the raw token is delivered out of band.

- `password_reset_tokens` expire after `PASSWORD_RESET_HOURS` and are stamped
  `used_at`; a second use is rejected, and completing a reset revokes every
  refresh token for that account.
- `email_verification_tokens` expire after `EMAIL_TOKEN_HOURS` and are
  single-use.

`forgot-password` always returns the same message whether or not the address is
registered.

### Getting a verification link in development

No mail provider is required. With `MAIL_DRIVER=log` every message is written
to the `email_queue` table and summarised in the log, so a developer can read
the link straight from the queue:

```sql
SELECT payload->>'link' FROM email_queue
WHERE to_email = 'you@example.edu' ORDER BY created_at DESC LIMIT 1;
```

Set `MAIL_DRIVER=smtp` with the `SMTP_*` variables to send for real. Tokens are
hashed at rest, so the queue holds the only copy of the raw value and is
therefore a development-only mechanism — `assertProductionConfig()` does not
expose it over HTTP.

## Authorization

Two independent middleware, applied in this order:

- `authenticate` (also exported as `requireAuth`) — verifies the access token
  and loads the user, including current roles. Failure is `401`.
- `requireRole(...roles)` — compares the **database** roles against the accepted
  list. Failure is `403`.

The separation matters: an anonymous caller gets `401`, while a signed-in caller
without the role gets `403`. Client-supplied roles are never consulted, and a
forged `x-user-role` header or request body has no effect.

Current guards:

| Middleware | Purpose |
| --- | --- |
| `requireAuth` / `authenticate` | Any signed-in user |
| `requireRole(ROLES.ADMIN)` | Administrators only |
| `requireAdmin()` | Alias for the above |
| `requireVerifiedAlumni()` | Verified alumni, admins always pass |
| `requireSameUserOrAdmin(param)` | Owner or administrator |

`GET /api/admin/users` and `GET /api/admin/users/:userId` are guarded by
`authenticate` then `requireRole(ROLES.ADMIN)`, and the repository never selects
a password hash.