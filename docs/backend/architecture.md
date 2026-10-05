# Backend architecture

Scope: this document describes the backend as it stands after **Phase 1**
(backend foundation, database foundation, migrations, user management,
authentication, RBAC, security middleware and automated tests).

## Shape

The backend is a modular monolith: one deployable Express application, one
PostgreSQL database, no inter-service network calls. That keeps transactions
local and the deployment surface small while the domain is still growing.

```
HTTP request
   │
   ├─ security middleware      helmet, CORS, body limit, rate limit, request id
   │
   ├─ /api/health              liveness, answered before the database check
   │
   ├─ /api/*                   database availability, CSRF, then routes
   │      │
   │      ├─ validate()        Zod schema, rejects before the handler runs
   │      ├─ authenticate      verifies the access token, loads the user
   │      ├─ requireRole(...)  server-side authorization
   │      │
   │      ├─ routes            URL shape only
   │      ├─ controllers       HTTP in, HTTP out; no SQL, no business rules
   │      ├─ services          business rules and transactions
   │      ├─ repositories      SQL and row shapes  (repositories/)
   │      ├─ models            SQL for modules that predate repositories/
   │      └─ PostgreSQL
   │
   └─ notFound → errorHandler  one place that renders an error envelope
```

The dependency direction is fixed: a layer may only call the one below it.
Routes never contain SQL, and controllers never contain business rules.

### Why both `repositories/` and `models/`

Phase 1 adds `repositories/` because the specification calls for an explicit
repositories layer, and the new user-management endpoints are written against
it. Modules that landed in earlier phases still call `models/`. The two are
kept apart rather than mixing them inside a single file; consolidating
`models/` into `repositories/` is mechanical and can be done when those modules
are next touched.

## Layout

| Path | Responsibility |
| --- | --- |
| `server/src/config/` | Environment parsing and validation, PostgreSQL pool, transaction helper |
| `server/src/controllers/` | Translate HTTP to service calls and back |
| `server/src/services/` | Business rules, transactions, token issuance |
| `server/src/repositories/` | SQL and projections (new in Phase 1) |
| `server/src/models/` | SQL for earlier-phase modules |
| `server/src/middleware/` | Security, authentication, authorization, validation, error handling |
| `server/src/routes/` | Route tables, mounted from `routes/index.js` |
| `server/src/validators/` | Zod request schemas |
| `server/src/utils/` | Errors, response envelope, crypto, logging |
| `server/src/scripts/` | `migrate`, `migrate-status`, `seed`, `reset-db` |
| `database/migrations/` | Ordered, forward-only SQL with optional `.down.sql` companions |
| `server/tests/` | Integration suite driven by supertest against a real schema |

## Configuration

`config/env.js` parses the environment once at load. Outside production it
falls back to a fixed, clearly-labelled development JWT secret and a local
PGlite database URL so `npm run dev` works with no `.env` file.
`assertProductionConfig()` runs at boot in production and refuses to start
unless `JWT_SECRET`, `JWT_REFRESH_SECRET` and `DATABASE_URL` are set, the two
secrets differ, neither is the development placeholder, and both are at least 32
characters.

## Database access

A single `pg` pool is created in `config/database.js`. `withTransaction(fn)`
checks out one client, runs `BEGIN`/`COMMIT`, and rolls back on any throw; the
client is handed to `fn` so participating statements run on that same
connection. Anything that takes `FOR UPDATE` locks must use it, because a lock
is only held for the life of its transaction.

Migrations are plain SQL files applied in filename order and recorded in
`schema_migrations`. Each file runs inside a transaction, so a failure leaves no
partial state.

## Error handling

Handlers throw `AppError` (or an error the error handler recognises) and the
single `errorHandler` renders it:

```json
{ "success": false, "message": "...", "error": { "code": "...", "message": "...", "details": [] } }
```

`message` is repeated at the top level and `details` are mirrored to `errors`
because the existing frontend reads those two locations. Stack traces are only
attached outside production.

## Testing

`server/tests/integration.test.js` drives the real Express app with supertest
against a freshly migrated database. No application module is mocked: routing,
validation, middleware, services and SQL are all exercised together.

Each run starts its own in-memory PGlite on port 54330 and tears it down
afterwards, so runs are isolated and repeatable. It deliberately does not reuse
`npm run dev:db`, because that server is single-session and a test run that
ends with an open connection leaves it rejecting the next one.