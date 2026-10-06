# Alumni Network Portal
## Project Brain

### 1. Project Overview
**Project name:** Alumni Network Portal
**Project purpose:** A web-based alumni networking platform connecting alumni, students, faculty/professors, and university administrators.

**Major Goals:**
- Alumni networking & discovery
- Professional networking & mentorship
- Job opportunities and applications
- Messaging and real-time notifications
- Events and reunions
- Administrative management & moderation
- Alumni giving and endowments
- AI-powered career & networking intelligence

**Intended User Classes (4 Roles):**
- **STUDENT**: Current students seeking mentorship, jobs, internships, career readiness, and guidance.
- **ALUMNI**: Graduates mentoring, posting opportunities, networking, and contributing to endowment funds.
- **PROFESSOR**: Faculty members advising students, coordinating campus research, and connecting with alumni.
- **ADMIN**: University administration managing users, verifications, jobs, moderation, and audit trails.

---

### 2. Current Project Status (Frontend & Backend Integrated)

- **Backend Integration**: CONNECTED. The frontend's centralized API client (`src/services/api.js`) routes directly to the live Express REST backend via `src/services/api.real.js` and `src/services/http.js` through the Vite proxy (`/api` -> `http://localhost:5000`).
- **Role Architecture**: IMPLEMENTED (`STUDENT`, `ALUMNI`, `PROFESSOR`, `ADMIN` with centralized permissions and role-based navigation).
- **Authentication**: JWT authentication with automatic CSRF token mirroring, refresh token rotation deduplication, and cookie/bearer support.
- **REST Endpoints Connected**: `/auth`, `/profiles`, `/alumni`, `/connections`, `/conversations`, `/messages`, `/mentorship`, `/events`, `/jobs`, `/applications`, `/notifications`, `/admin`, `/files`.
- **UI / Swiss Design System**: IMPLEMENTED & PRESERVED (Strict 1px borders, typography hierarchy, monospace accents, zero arbitrary shadows, dark/light contrast).

---

### 3. Architecture

The architecture consists of a decoupled frontend and backend.

```text
                    Alumni Network Portal
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Client         Server       Database
           React         Express       PostgreSQL
              │             │
              │             ├── REST API
              │             ├── JWT Auth
              │             ├── RBAC
              │             └── Socket.io
              │
              └──────────────┬──────────────
                             │
                       Future AI Service
                      FastAPI (Planned)
```

---

### 4. Repository Structure
```text
Alumni-Network/
├── client/
│   ├── src/
│   │   ├── components/  # Reusable UI components (Swiss UI)
│   │   ├── context/     # AuthContext for global state
│   │   ├── layouts/     # Main AppLayout shell
│   │   ├── pages/       # React route components
│   │   ├── services/    # api.js fetch wrappers
│   │   └── index.css    # Tailwind v4 theme & global styles
├── server/
│   └── src/
│       ├── config/      # DB and Env config
│       ├── controllers/ # HTTP route handlers
│       ├── middleware/  # Auth, RBAC, Error handling, Rate limiting
│       ├── models/      # Database queries
│       ├── routes/      # Express routers
│       ├── services/    # Business logic & email templates
│       └── sockets/     # Socket.io handlers
├── database/
│   ├── migrations/      # Sequential SQL schema migrations
│   └── seeds/           # Initial SQL seed data
├── docs/                # Architecture and API documentation
└── BRAIN.md             # This persistent context file
```

---

### 5. Technology Stack
- **Frontend**: React 19, Vite, Tailwind CSS v4.
- **Backend**: Node.js, Express 5.
- **Database**: PostgreSQL (pg).
- **Real-time**: Socket.io.
- **Styling**: Vanilla CSS + Tailwind v4 (Swiss Design System).

---

### 6. Frontend Architecture
- **Framework**: React (Bootstrapped via Vite).
- **Styling**: Tailwind CSS v4, initialized in `index.css`.
- **State Management**: React Context (`AuthContext.jsx`) and local component state.
- **Routing**: React Router (`react-router-dom`) managed via `routes/index.jsx` and `App.jsx`.
- **API Communication**: Custom abstraction utilizing a central HTTP client (`http.js` + `api.js`), no Axios.

---

### 7. Backend Architecture
- **Runtime**: Node.js.
- **Framework**: Express 5.
- **API Style**: RESTful JSON API.
- **Authentication**: JWT-based (stored in HTTP-only cookies).
- **Authorization**: RBAC middleware (`rbac.js`).
- **Structure**: Controller-Service-Model pattern. Controllers handle HTTP, Services handle logic, Models handle SQL queries.

---

### 8. Database Architecture
- **Engine**: PostgreSQL.
- **Driver**: `pg` (Pool).
- **Migrations**: Custom migration runner executing raw `.sql` files (`database/migrations/`).
- **Entities**: Users, Profiles (Alumni/Student), Jobs, Applications, Mentorships, Connections, Messages, Notifications.
- **Relationships**:
  - `User` 1:1 `Profile`
  - `User` 1:M `Jobs` (Posted)
  - `User` 1:M `Applications`
  - `User` M:M `Connections`
  - `User` 1:M `Messages`
  - `User` 1:M `Notifications`

---

### 9. Authentication
- **Flow**: Registration → DB Insertion → JWT token generation → Token set in `cookie` → Protected routes checked via `auth.js` middleware.
- **Mechanism**: JWT with `bcrypt` password hashing.
- **SSO**: Providers logic exists (`oauthController`), endpoints implemented for Google/LinkedIn/SSO (status active/planned depending on environment keys).

---

### 10. RBAC
Roles: `ALUMNI`, `STUDENT`, `ADMIN`, `MODERATOR`, `STAFF`, `FACULTY`.
- **ALUMNI**: Can post jobs, offer mentorship, browse directory, message.
- **STUDENT**: Can apply to jobs, request mentorship, browse directory. Cannot post jobs.
- **ADMIN / STAFF / MODERATOR**: Can access admin dashboards, moderate content, review verifications.

---

### 11. API Architecture
Base API path: `/api`
Groups:
- `/api/auth`: Login, Register, Me, OAuth.
- `/api/profiles`: Me, Directory, Skills, Privacy.
- `/api/connections`: List, Pending, Stats, Mutuals.
- `/api/messages`: Conversations, Send, Read.
- `/api/jobs`: List, Create, Apply, Review.
- `/api/mentorship`: Mentors, Requests, Respond.
- `/api/notifications`: List, Unread, Preferences.
- `/api/admin`: **PLANNED**.
- `/api/events`: **PLANNED**.

---

### 12. Real-Time Messaging
- **Implementation**: Socket.io (`server/src/sockets/index.js`).
- **Connection**: Authenticated via JWT from cookies (`authenticateSocket` middleware).
- **Rooms**: Users join `user:{userId}`. Conversations joined dynamically as `dm:{userA}:{userB}`.
- **Events**: Handles presence, typing indicators, read receipts, and real-time message delivery.

---

### 13. Feature Inventory
| Feature | Frontend | Backend | Database | Real-time | AI | Status |
|---|---|---|---|---|---|---|
| Authentication | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Profiles | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Directory | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Mentorship | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Connections | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Jobs & Apps | Yes | Yes | Yes | - | - | IMPLEMENTED |
| Messaging | Yes | Yes | Yes | Yes | - | IMPLEMENTED |
| Notifications | Yes | Yes | Yes | Yes | - | IMPLEMENTED |
| Events | No | No | No | - | - | PLACEHOLDER |
| Admin | No | No | No | - | - | PLACEHOLDER |
| AI Assistant | No | No | No | - | No | NOT IMPLEMENTED |

---

### 14. SRS Traceability
*Note: Refer to `docs/` for complete SRS mapping. Current implementation aligns heavily with core networking, jobs, and messaging functional requirements.*
- **Core Networking (FR-1)**: IMPLEMENTED
- **Job Board (FR-2)**: IMPLEMENTED
- **Mentorship (FR-3)**: IMPLEMENTED
- **Events (FR-4)**: PLANNED (Missing UI and API)
- **Admin (FR-5)**: PLANNED (Missing UI and API)

---

### 15. Swiss Style Design System
- **Authority**: The project's `SKILL.md` (Swiss Dev UI System) dictates all design choices.
- **Current Status**: The frontend has been overhauled to adhere strictly to Swiss principles.
- **Typography**: Inter (sans-serif) + JetBrains Mono.
- **Color System**: Near-black background (`#0a0a0a`), off-white text, single accent color (`#00ff66`).
- **Principles applied**:
  - Grid-based layouts.
  - Numbered structural prefixes (`01 — DASHBOARD`).
  - No shadows, sharp corners, 1px borders.
  - High contrast, minimalistic UI.

---

### 16. UI Component System (`client/src/components/ui.jsx`)
- **Card / CardHeader**: Flat surfaces, 1px border.
- **Button**: Primary (filled) and Ghost/Secondary (outlined).
- **Input / Textarea / Select**: Sharp borders, transparent backgrounds.
- **Badge**: Monospace, tracking-widest, uppercase.
- **Alert**: Monochromatic backgrounds based on intent.
- **Field**: Labeled with monospace eyebrows.

---

### 17. Frontend Pages Inventory
- **Home (`Home.jsx`)**: Public showcase and landing page.
- **Dashboard (`Dashboard.jsx`)**: Role-tailored live overview with KPI tiles for Student, Alumni, Professor, and Admin.
- **Directory (`Directory.jsx`)**: Full member search with filters by graduation year, industry, skills, mentorship flag.
- **AlumniProfile (`AlumniProfile.jsx`)**: Detailed graduate identity, timeline, verification badges, and connection actions.
- **Profile (`Profile.jsx`)**: Profile editing, skills management, and granular privacy controls.
- **Jobs (`Jobs.jsx`)**: Multi-view job board, company view, applicant review, saved jobs, and application tracker.
- **Mentorship (`Mentorship.jsx`)**: Mentor discovery, mentorship requests (incoming/outgoing), and active mentorship management.
- **Resume (`Resume.jsx`)**: Student resume management, PDF upload, parsed technical skills, and AI ATS readiness scanner.
- **Donations (`Donations.jsx`)**: Alumni giving portal with endowment funds, preset giving tiers, and official 80G tax receipts.
- **Students (`Students.jsx`)**: Faculty advising roster for professors to inspect student projects and recommend opportunities.
- **Announcements (`Announcements.jsx`)**: Department and university-wide bulletin broadcast with audience filters.
- **Events (`Events.jsx` & `EventDetails.jsx`)**: Event calendar, RSVP / cancel RSVP, and event creation with Zoom links.
- **Messages (`Messages.jsx`)**: Real-time mock direct messaging with persistent conversation history and read receipts.
- **Notifications (`Notifications.jsx`)**: In-app notifications with mark as read and delete actions.
- **Admin Console (`Admin.jsx`)**: System KPIs, User governance, Alumni verification queue, Job moderation, Events management, Donations audit, Analytics, and Security audit logs.
- **AI Career Intelligence**: `Assistant.jsx` (Chat advisor), `JobReadiness.jsx` (Skill match audit), `ResumeAnalyzer.jsx` (ATS scanner), `SemanticSearch.jsx` (Embeddings-based search).
- **Settings (`Settings.jsx`)**: Account preferences, email notifications, and password security.
- **System Screens (`SystemScreens.jsx`)**: 403 Forbidden (with quick role switch simulation), 401 Unauthorized, 500 Server Error, Offline, Maintenance, and 404 Not Found.

---

### 18. Mock Data & Service Architecture
- **Mock DB (`src/data/`)**: Modular entities with local storage persistence across user sessions.
- **Service Layer (`src/services/`)**: Isolated API abstraction modules ready for seamless drop-in REST API backend connectivity.
- **Role Simulation**: Centralized in `AuthContext.jsx` and `RoleSwitcher.jsx` for 1-click role toggling during QA.

---

### 19. AI Architecture
**STATUS: FRONTEND UI COMPLETE, BACKEND PLANNED**
- **Architecture**: Planned to be a decoupled FastAPI microservice interacting with the Node.js core.
- **Frontend Integration Contracts (Planned)**:
  - `POST /ai/chat` -> Powers `Assistant.jsx`
  - `POST /ai/resume/analyze` -> Powers `ResumeAnalyzer.jsx`
  - `POST /ai/readiness/analyze` -> Powers `JobReadiness.jsx`
  - `GET /search/semantic` -> Powers `SemanticSearch.jsx`
  - `GET /ai/mentors/recommendations` -> Powers Mentor matches in `JobReadiness.jsx` and `Mentorship.jsx`

---

### 20. Security
- **Implemented**: Helmet (HTTP headers), CORS, `express-rate-limit` (DDoS mitigation), JWT (HttpOnly cookies), bcrypt, Input validation middleware.
- **Planned**: Audit logging UI, deeper moderation tools.

---

### 21. Testing
- **Framework**: Node's native test runner / Jest (Check `tests/`).
- **Location**: `server/tests/integration.test.js`.
- **Status**: Integration tests cover core APIs. E2E and Frontend tests are currently limited/missing.

---

### 22. Environment & Configuration
**Required Env Variables (Server)**:
- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `PORT`
*(Secrets must be set in `.env`.)*

---

### 23. Development Workflow
1. Read `BRAIN.md`.
2. Review `SKILL.md` for styling guidelines.
3. Inspect existing components and services.
4. Reuse existing implementations.
5. Implement feature.
6. Test functionality.
7. Update `BRAIN.md`.

---

### 24. Team Ownership
- **Member 1**: Design system, Swiss Style, App shell, Visual consistency.
- **Member 2**: Events, Admin dashboard.
- **Member 3**: AI integration, Resume parsing.

---

### 25. Roadmap
1. **Phase 1 Completed**: Core platform UI Shell, Swiss Style Redesign, typography, grid, unified app shell.
2. **Phase 2 Completed**: Core user workflows (Directory -> Profile -> Mentorship -> Jobs -> Messages) connected. Mobile drawer navigation implemented. Legacy CSS swept.
3. **Phase 3 Completed**: Remaining platform frontend constructed. `Events.jsx`, `Admin.jsx`, and `Settings.jsx` converted from placeholders to full UI integration surfaces. Navigation architecture finalized. Backend API dependencies explicitly mapped.
4. **Phase 4 Completed**: Complete AI UI built (`Assistant.jsx`, `ResumeAnalyzer.jsx`, `JobReadiness.jsx`, `SemanticSearch.jsx`). All frontend AI boundaries defined and mock-integrated with strict "BACKEND DEPENDENCY" warnings. Application shell fully adapted to house the Career Intelligence layer. Full build verification passed.
5. **Phase 5 (Next)**: Implement actual FastAPI backend, LLM logic, Resume Parsers, Embeddings, and the missing Node.js Express controllers (Events/Admin) to power the frontend shell built in Phases 1-4.

---

### 26. Known Issues
- Some legacy tailwind classes (`text-slate-*`) may persist deeply within complex views (`Jobs.jsx`, `Mentorship.jsx`), requiring gradual refactoring.

---

### 27. Final Frontend Status
**Frontend UI Status: COMPLETE**

Implemented:
- System Screens (401, 403, 404, 500, Offline, Maintenance)
- Core Workflows (Auth, Dashboard, Directory, Mentorship, Jobs, Messages, Profile)
- Admin & Settings UIs
- AI & Career Intelligence (Resume Analyzer, Job Readiness, Semantic Search, Assistant)
- Event Details & Event Creation UI
- Comprehensive responsive shell (Mobile drawers, wrapping flex grids)

Backend dependencies (to be implemented):
- `Events API` (RSVP, Management, Fetching)
- `Admin API` (Stats, Moderation, User modification)
- `Settings API` (Profile preferences)

AI integration dependencies (to be implemented):
- `POST /ai/chat` (Assistant)
- `POST /ai/resume/analyze` (Resume Parsing)
- `POST /ai/readiness/analyze` (Job Readiness)
- `GET /search/semantic` (Embeddings search)
- `GET /ai/mentors/recommendations` (AI matching)

Known frontend limitations:
- All missing backend features are explicitly handled with `BACKEND DEPENDENCY` badges and graceful UI fallbacks to prevent runtime crashes.

---

### 27. Architectural Decisions
- **Database**: PostgreSQL (Chosen over MongoDB for strict relational schemas and complex queries like filtering jobs/profiles).
- **API**: RESTful with custom `fetch` wrapper (Avoided Axios to minimize dependencies).
- **Auth**: HttpOnly Cookies + JWT (Preferred over LocalStorage for security).
- **Real-Time**: Socket.io (Chosen for ease of implementation over raw WebSockets).
- **Styling**: Tailwind CSS v4 + Swiss Dev UI System.

---

### 28. Existing Implementations to Reuse
- **API Services**: `client/src/services/api.js` (Never recreate fetch logic).
- **UI Components**: `client/src/components/ui.jsx` (Always use these for styling consistency).
- **Backend Auth**: `server/src/middleware/auth.js`.
- **Database**: `server/src/config/database.js`.

---

### 29. Development Rules
- Modify only relevant files.
- Reuse existing services and components.
- **DO NOT** rewrite working modules.
- **DO NOT** change DB schema without explicit decision and migration.
- **DO NOT** introduce duplicate API clients or styling libraries.
- **DO NOT** introduce Redux/Zustand; Context API is the standard.
- Follow existing project patterns and Swiss Design guidelines.

---

### 30. BRAIN.md Maintenance Rules
Future agents MUST:
1. Read `BRAIN.md` before major tasks.
2. Check actual code before trusting `BRAIN.md`.
3. Update `BRAIN.md` after architectural changes, feature completions, or schema changes.
4. Never document fictional functionality.
5. Keep the document concise and accurate.
