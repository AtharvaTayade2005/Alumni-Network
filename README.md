# Alumni Network Portal

A centralised, mobile-responsive web portal connecting alumni, current students and
university administrators.

> **Status: foundation build.** This repository currently contains project setup only.
> Authentication, OAuth, RBAC, the job board, mentorship, messaging, payments,
> donations, email, maps and admin moderation are **not implemented** and will be
> delivered incrementally.

## 1. Project Overview

One portal for three audiences:

- **Alumni** find peers, mentors, jobs and events.
- **Current students** access internships, mentors and campus events.
- **Administrators** moderate content, run the directory and oversee the platform.

The codebase is a monorepo-style layout with an independent `client/` and `server/`
package, a `database/` folder for migrations and documentation, and a `docs/` folder
for design records.

## 2. Features

Planned modules, in delivery order:

1. User Management & Authentication
2. Alumni Directory & Search
3. Networking & One-to-One Mentorship
4. Job & Internship Portal
5. Events & Reunions
6. Real-Time Messaging
7. Notifications
8. Donations & Payments
9. Admin Dashboard
10. Security, Audit Logs and Monitoring

Currently available: the frontend shell with placeholder routes, the Express API
with a health endpoint, the initial database schema, and local PostgreSQL via Docker.

## 3. Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 6, JavaScript, Tailwind CSS 4, React Router 7 |
| Backend | Node.js 20+, Express 5, REST API, ES modules |
| Database | PostgreSQL 16, `pg` driver |
| Local infra | Docker Compose (PostgreSQL only) |
| Quality | ESLint (flat config) in both packages |

Planned integrations: Google OAuth, LinkedIn OAuth, University SSO, Socket.IO,
Stripe/PayPal, SendGrid/AWS SES, AWS S3, Google Maps/Mapbox.

## 4. Architecture Overview

```text
User
 ↓
React Frontend
 ↓
Express REST API
 ↓
PostgreSQL
```

The API is stateless and the only component that touches the database. External
integrations sit behind service modules so the core API remains testable in
isolation. Full detail: [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md).

## 5. Project Structure

```text
alumni-network-portal/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── utils/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── app.js
│   ├── tests/
│   ├── package.json
│   └── server.js
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schema/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   └── testing/
├── .env.example
├── .gitignore
├── README.md
└── docker-compose.yml
```

## 6. Prerequisites

- Node.js 20 or newer (developed on 24.x)
- npm 10 or newer
- Docker Desktop, or a local PostgreSQL 16 installation
- Git

## 7. Installation

```bash
git clone <repository-url> alumni-network-portal
cd alumni-network-portal
```

Install dependencies per package:

```bash
cd client && npm install
cd ../server && npm install
```

## 8. Frontend Setup

```bash
cd client
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173`. Vite proxies `/api` requests to
`http://localhost:5000`, so no CORS configuration is needed during development.

Available scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## 9. Backend Setup

```bash
cd server
npm install
npm run dev
```

The API listens on `http://localhost:5000`. Environment variables are loaded from a
`.env` file in the repository root.

| Script | Purpose |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start with Node's watch mode |
| `npm run lint` | Run ESLint |
| `npm run dev:db` | Start the bundled PGlite database (no PostgreSQL install needed) |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | List applied and pending migrations |
| `npm run migrate:down` | Roll back the most recent reversible migration |
| `npm run db:reset` | Drop and rebuild the schema |
| `npm run seed` | Insert roles and the development accounts |
| `npm run seed:users` | Insert the development accounts only |
| `npm test` | Run the integration suite |

Further reading: [architecture](docs/backend/architecture.md),
[authentication and RBAC](docs/backend/authentication.md),
[database](docs/backend/database.md),
[API reference](docs/api/authentication.md).

## 10. PostgreSQL Setup

Option A, bundled PGlite — no installation required:

```bash
cd server
npm run dev:db      # starts on 127.0.0.1:54329
```

Option B, using Docker:

```bash
docker compose up -d postgres
```

Option C, using an existing local PostgreSQL server: create a database and set
`DATABASE_URL` in `.env`.

Apply the schema and load development data:

```bash
cd server
npm run migrate
npm run seed
```

`npm run migrate` applies every file in `database/migrations/` that is not yet
recorded in `schema_migrations`, one transaction per file. A migration is
reversible when a sibling `<name>.down.sql` exists, and `npm run migrate:down`
rolls back to the last reversible one. See
[database.md](docs/backend/database.md).

The seed creates three development accounts, all with the password
`DevPassw0rd!`:

| Role | Email |
| --- | --- |
| ADMIN | `admin@alumni.local` |
| ALUMNI | `alumni@alumni.local` |
| STUDENT | `student@alumni.local` |

These credentials are deliberately predictable and the seeder refuses to run
when `NODE_ENV=production`. Override them with the `SEED_*` variables in
`.env.example`.

In development, outbound mail is not sent. Verification and password-reset
links are written to `email_queue` instead:

```sql
SELECT payload->>'link' FROM email_queue
WHERE to_email = 'you@example.edu' ORDER BY created_at DESC LIMIT 1;
```

## 11. Environment Variables

Copy the template and fill in values locally:

```bash
cp .env.example .env
```

`.env` is gitignored and must never be committed. Only `.env.example`, which
contains variable names and safe placeholder values, is tracked.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime environment |
| `PORT` | API port, default `5000` |
| `CLIENT_URL` | Allowed CORS origin, default `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SSL` | Enable TLS for the database connection |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Docker Compose database bootstrap |
| `JWT_SECRET` | Token signing secret (planned) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (planned) |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth (planned) |
| `SSO_ISSUER_URL` / `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` | University SSO (planned) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe (planned) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal (planned) |
| `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` / `AWS_SES_FROM_EMAIL` | Email (planned) |
| `AWS_REGION` / `AWS_S3_BUCKET` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Cloud storage (planned) |
| `MAPBOX_ACCESS_TOKEN` / `GOOGLE_MAPS_API_KEY` | Maps (planned) |

The frontend has its own template at `client/.env.example` containing
`VITE_API_URL`. Only `VITE_`-prefixed variables reach the browser bundle, so no
server secret is ever exposed to the client.

## 12. Running the Project

Two terminals:

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Then open `http://localhost:5173`.

## 13. API Health Check

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "Alumni Network Portal API"
}
```

## 14. Git Workflow

- Branch per feature or fix, for example `feature/mentorship-requests`.
- Commits follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Commits stay small and logically scoped; unrelated changes are never bundled.
- History is never rewritten with force pushes, and no branch is force-pushed or deleted.
- Secrets are never staged. Review `git status` and `git diff --staged` before committing.
- Pull requests describe scope, testing performed and any environment changes.

## 15. Planned Development Roadmap

| Phase | Scope |
| --- | --- |
| Phase 0 (current) | Repository structure, frontend shell, Express API, database foundation, docs, local PostgreSQL |
| Phase 1 | User management, password auth, JWT sessions, RBAC middleware |
| Phase 2 | Google, LinkedIn and University SSO sign-in |
| Phase 3 | Alumni directory, profiles, skills, search |
| Phase 4 | Mentorship requests and pairing |
| Phase 5 | Companies, job and internship postings, applications |
| Phase 6 | Events, reunions, RSVPs, reminders |
| Phase 7 | Messaging over Socket.IO, notification feed |
| Phase 8 | Donations with Stripe and PayPal |
| Phase 9 | Admin dashboard, moderation, audit log review |
| Phase 10 | Security hardening, rate limiting, monitoring, deployment |

Each phase is delivered as working, reviewable increments. Advanced modules are
implemented incrementally; nothing beyond the current foundation is assumed to exist.
