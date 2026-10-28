# Comprehensive Codebase Documentation & File Directory Guide
## Alumni Network Portal

> **Document Purpose:** Complete, file-by-file audit and technical explanation of the entire Alumni Network Portal codebase.  
> **Repository:** `Alumini-Network`  
> **Architecture:** Decoupled Full-Stack Web Application (Node.js/Express REST API + PostgreSQL/PGlite + Socket.io + React 19/Vite/Tailwind v4)

---

## Table of Contents

1. [Root Directory (`/`)](#1-root-directory-)
2. [Root Orchestration Scripts (`scripts/`)](#2-root-orchestration-scripts-scripts)
3. [Frontend Client Root (`client/`)](#3-frontend-client-root-client)
4. [Frontend Public Assets (`client/public/`)](#4-frontend-public-assets-clientpublic)
5. [Frontend Core (`client/src/`)](#5-frontend-core-clientsrc)
6. [Frontend UI Components (`client/src/components/`)](#6-frontend-ui-components-clientsrccomponents)
7. [Frontend Context & State (`client/src/context/`)](#7-frontend-context--state-clientsrccontext)
8. [Frontend Mock Data & In-Memory Store (`client/src/data/`)](#8-frontend-mock-data--in-memory-store-clientsrcdata)
9. [Frontend Layouts (`client/src/layouts/`)](#9-frontend-layouts-clientsrclayouts)
10. [Frontend Application Pages (`client/src/pages/`)](#10-frontend-application-pages-clientsrcpages)
11. [Frontend Routing & Security Guards (`client/src/routes/`)](#11-frontend-routing--security-guards-clientsrcroutes)
12. [Frontend Service Layer & Tests (`client/src/services/`)](#12-frontend-service-layer--tests-clientsrcservices)
13. [Frontend Utilities & Role Matrix (`client/src/utils/`)](#13-frontend-utilities--role-matrix-clientsrcutils)
14. [Database Migrations (`database/migrations/`)](#14-database-migrations-databasemigrations)
15. [Database Schema & Seeders (`database/schema/`, `database/seeds/`)](#15-database-schema--seeders-databaseschema-databaseseeds)
16. [System Documentation (`docs/`)](#16-system-documentation-docs)
    - [API Specifications (`docs/api/`)](#api-specifications-docsapi)
    - [Architecture (`docs/architecture/`)](#architecture-docsarchitecture)
    - [Backend Guides (`docs/backend/`)](#backend-guides-docsbackend)
    - [Database, Deployment & Testing (`docs/database/`, `docs/deployment/`, `docs/testing/`)](#database-deployment--testing-docsdatabase-docsdeployment-docstesting)
17. [Backend Server Root & Config (`server/`, `server/src/config/`, `server/src/constants/`)](#17-backend-server-root--config-server-serversrcconfig-serversrcconstants)
18. [Backend Scratch & Verification Scripts (`server/scratch/`, `server/scripts/`)](#18-backend-scratch--verification-scripts-serverscratch-serverscripts)
19. [Backend Entry & Core Application (`server/server.js`, `server/src/app.js`)](#19-backend-entry--core-application-serverserverjs-serversrcappjs)
20. [Backend Middleware (`server/src/middleware/`)](#20-backend-middleware-serversrcmiddleware)
21. [Backend Controllers (`server/src/controllers/`)](#21-backend-controllers-serversrccontrollers)
22. [Backend Models & Data Access (`server/src/models/`, `server/src/repositories/`)](#22-backend-models--data-access-serversrcmodels-serversrcrepositories)
23. [Backend API Routes (`server/src/routes/`)](#23-backend-api-routes-serversrcroutes)
24. [Backend Database Maintenance Scripts (`server/src/scripts/`)](#24-backend-database-maintenance-scripts-serversrcscripts)
25. [Backend Core Services (`server/src/services/`)](#25-backend-core-services-serversrcservices)
26. [Backend AI Intelligence Services & Providers (`server/src/services/ai/`)](#26-backend-ai-intelligence-services--providers-serversrcservicesai)
27. [Backend WebSockets & Real-Time Messaging (`server/src/sockets/`)](#27-backend-websockets--real-time-messaging-serversrcsockets)
28. [Backend Utilities (`server/src/utils/`)](#28-backend-utils-serversrcutils)
29. [Backend Request Validators (`server/src/validators/`)](#29-backend-request-validators-serversrcvalidators)
30. [Backend Test Suite & Helpers (`server/tests/`, `server/tests/helpers/`)](#30-backend-test-suite--helpers-servertests-servertestshelpers)
31. [Runtime & Storage Directories (`server/uploads/`, `server/.dev-postgres/`)](#31-runtime--storage-directories-serveruploads-serverdev-postgres)

---

## 1. Root Directory (`/`)

The workspace root coordinates workspace-level tasks, containerization, environment definitions, and high-level architectural references.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `.env` | Environment Config | Root environment configuration containing secret keys, database URLs, JWT secrets, Stripe tokens, and port assignments for local development. |
| `.env.example` | Config Template | Master template documenting every required and optional environment variable for both frontend and backend configurations. |
| `.gitignore` | Version Control Filter | Instructs Git to ignore `node_modules`, build artifacts (`dist`, `build`), environment credentials (`.env`), database logs, uploaded media, and cache directories. |
| `BRAIN.md` | Milestone Roadmap | Project memory and milestone tracking document describing platform phases (Auth, Profiles, Directory, Jobs, Events/Messaging, Donations/Moderation, AI). |
| `docker-compose.yml` | Container Orchestration | Docker Compose configuration defining containerized PostgreSQL databases, ports (5432), environment volumes, and optional containerized services. |
| `env` | Configuration Helper | Shell/environment helper documenting system runtime defaults and environment flag references. |
| `package.json` | Root Monorepo Manifest | Top-level project configuration defining concurrent run scripts (`npm run dev`) that start both backend Express server and frontend Vite client simultaneously. |
| `PROJECT_CONTEXT.md` | Verified System Audit | Empirical ground-truth audit of the codebase: verified technologies, commit history, role structures, API contracts, and implementation realities. |
| `README.md` | Project Introduction | Repository entry documentation detailing high-level features, installation steps, and platform objectives. |
| `SKILL.md` | Agent Operational Runbook | Specialized instructions and operational rules for AI development agents interacting with this repository. |

---

## 2. Root Orchestration Scripts (`scripts/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `scripts/start-dev.js` | Dev Process Supervisor | Node.js script using `child_process.spawn` to spin up both the Express backend (`server`) and Vite client (`client`) in a unified process with graceful shutdown handling (`SIGINT`, `SIGTERM`). |

---

## 3. Frontend Client Root (`client/`)

Contains configuration files and dependencies for the modern React 19 Single Page Application.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/.env.example` | Frontend Env Template | Sample environment variables for Vite (`VITE_API_URL`, `VITE_USE_MOCK`, `VITE_ENABLE_SWISS_THEME`). |
| `client/eslint.config.js` | Linting & Code Quality | ESLint 9 configuration enforcing React Hooks rules, React Refresh rules, and modern ECMAScript standards. |
| `client/index.html` | HTML Entry Point | Single Page Application entry HTML template mounting the React root (`<div id="root"></div>`) and loading `/src/main.jsx`. |
| `client/package.json` | Client Dependency Manifest | Defines React 19, React Router DOM 7, Tailwind CSS 4, Lucide icons, Vitest, and Vite build toolchains. |
| `client/package-lock.json` | Client Lockfile | Deterministic dependency tree locking exact versions of all frontend packages. |
| `client/vite.config.js` | Bundler & Dev Server Config | Vite configuration integrating `@vitejs/plugin-react`, `@tailwindcss/vite`, and dev server proxy routing `/api` requests to `http://localhost:5000`. |

---

## 4. Frontend Public Assets (`client/public/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/public/favicon.svg` | Platform Favicon | SVG vector logo rendered in browser tabs. |
| `client/public/.gitkeep` | Git Directory Anchor | Ensures empty public folders remain tracked by version control. |

---

## 5. Frontend Core (`client/src/`)

The core initialization layer for the React user interface.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/main.jsx` | React Root Initialization | Application bootstrapper: mounts React DOM root, enables `React.StrictMode`, and renders `<App />`. |
| `client/src/App.jsx` | Root Application Shell | Sets up React Router `<RouterProvider />`, wraps the component tree in `<AuthProvider />`, and installs top-level `<ErrorBoundary />`. |
| `client/src/index.css` | Global Styling & Design Tokens | Tailwind CSS v4 entry file defining Swiss Dev Design System variables (colors `#ff6600`, monochrome surfaces, 1px strict borders, and JetBrains Mono fonts). |
| `client/src/assets/.gitkeep` | Static Asset Placeholder | Keeps the static asset folder tracked. |

---

## 6. Frontend UI Components (`client/src/components/`)

Reusable, modular presentation components following the Swiss Dev UI aesthetic.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/components/ErrorBoundary.jsx` | Error Catching Boundary | Class component catching uncaught React render errors; displays diagnostic information and recovery buttons. |
| `client/src/components/PagePlaceholder.jsx` | WIP Placeholder | Minimalist Swiss-styled placeholder shown for modules that are undergoing development. |
| `client/src/components/RoleSwitcher.jsx` | Dev Simulation Toolbar | Interactive header toolbar enabling instant one-click switching between `STUDENT`, `ALUMNI`, `PROFESSOR`, and `ADMIN` personas during testing. |
| `client/src/components/ui.jsx` | Design System Library | Comprehensive UI component library containing `Button`, `Card`, `CardHeader`, `Badge`, `Input`, `Textarea`, `Select`, `Modal`, `Tabs`, `StatWidget`, and `StatusPill`. |

---

## 7. Frontend Context & State (`client/src/context/`)

Global state management layers for authentication, session lifecycle, and user roles.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/context/AuthContext.jsx` | Authentication State Provider | React Context exposing `user`, `role`, `token`, `login()`, `logout()`, `register()`, `switchDemoUser()`, and automated token refresh lifecycle hooks. |
| `client/src/context/.gitkeep` | Git Anchor | Preserves context folder structure. |

---

## 8. Frontend Mock Data & In-Memory Store (`client/src/data/`)

A self-contained in-memory / localStorage mock backend that enables full frontend functionality offline or during rapid prototyping without requiring a live database.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/data/mock-db.js` | In-Memory Database Simulator | LocalStorage-persisted mock database engine simulating relational queries, insertions, filtering, and updates for all domain entities. |
| `client/src/data/index.js` | Mock Barrel Export | Central export point aggregating all mock data datasets. |
| `client/src/data/users.js` | Seed Users | Mock user credentials and basic account profiles across Student, Alumni, Professor, and Admin roles. |
| `client/src/data/students.js` | Student Profiles | Mock records for undergraduate students (majors, graduation years, GPA, skills, resumes). |
| `client/src/data/alumni.js` | Alumni Profiles | Mock records for graduated alumni (current employers, job titles, degrees, graduation years, mentorship availability). |
| `client/src/data/professors.js` | Faculty Profiles | Mock records for academic professors (departments, research labs, advisory roles, office hours). |
| `client/src/data/jobs.js` | Job Postings | Mock data for full-time jobs and internships (roles, companies, compensation ranges, locations, criteria). |
| `client/src/data/applications.js` | Job Applications | Mock job application records tracking applicant status (`submitted`, `reviewing`, `shortlisted`, `rejected`). |
| `client/src/data/mentorshipRequests.js` | Mentorship Requests | Mock mentorship pairings and requests (`pending`, `accepted`, `completed`, `declined`). |
| `client/src/data/conversations.js` | Chat Threads & Messages | Mock one-on-one direct message conversations and chat history. |
| `client/src/data/events.js` | Events Data | Mock campus lectures, alumni reunions, career workshops, and attendee RSVPs. |
| `client/src/data/notifications.js` | In-App Notifications | Mock notifications for job updates, connection requests, event reminders, and admin alerts. |
| `client/src/data/announcements.js` | Campus Bulletins | Mock institutional announcements broadcast to campus segments. |
| `client/src/data/donations.js` | Fundraising Campaigns | Mock endowment campaigns, pledge records, and donation leaderboards. |
| `client/src/data/resumes.js` | Resumes & Skills | Mock resume documents, parsed technical skills, and experience blocks. |
| `client/src/data/analytics.js` | Admin Metrics | Mock analytics metrics (total users, placement percentages, active mentorships, donation totals). |
| `client/src/hooks/.gitkeep` | Hooks Placeholder | Preserves custom hooks folder for future extensions. |

---

## 9. Frontend Layouts (`client/src/layouts/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/layouts/AppLayout.jsx` | Master Responsive Shell | Top-level layout providing top navigation bar, collapsible role-specific sidebar, unread notification counter, user profile menu, and breadcrumbs. |

---

## 10. Frontend Application Pages (`client/src/pages/`)

Complete screen implementations for user workflows.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/pages/Home.jsx` | Public Landing Page | High-impact homepage highlighting university network statistics, features, and authentication entry points. |
| `client/src/pages/Login.jsx` | Sign-In Screen | User login form supporting email/password authentication, demo role quick-login buttons, and redirect handling. |
| `client/src/pages/Register.jsx` | Onboarding Registration | Multi-role registration form (Student, Alumni, Professor) collecting academic information and credentials. |
| `client/src/pages/ForgotPassword.jsx` | Password Reset Request | Form requesting password recovery emails via verification tokens. |
| `client/src/pages/ResetPassword.jsx` | Password Reset Form | Screen where users input new passwords using a valid reset token from their email. |
| `client/src/pages/VerifyEmail.jsx` | Email Verification Handler | Validates email confirmation tokens from URL query parameters and updates account status. |
| `client/src/pages/Dashboard.jsx` | Role-Aware Command Center | Personalized dashboard rendering metrics, upcoming events, recommended jobs, mentorship requests, and quick actions based on user role. |
| `client/src/pages/Directory.jsx` | Alumni Directory Explorer | Searchable, paginated directory with filters for graduation year, department, company, location, and skills. |
| `client/src/pages/AlumniProfile.jsx` | Public Alumni View | Public profile screen detailing an alumni's career trajectory, education history, and "Request Mentorship" button. |
| `client/src/pages/Students.jsx` | Student Directory | Directory view tailored for faculty and alumni recruiters to find students by skill and department. |
| `client/src/pages/Profile.jsx` | Profile Self-Management | Form allowing users to edit bio, career experiences, education, skills, avatar photo, and privacy preferences. |
| `client/src/pages/Jobs.jsx` | Jobs Portal & Applications | Job board with search, filters, job posting creation (Alumni/Admin), and application submission with resumes. |
| `client/src/pages/Mentorship.jsx` | Mentorship Workspace | Mentorship matching hub: discover mentors, request mentorship, manage accepted mentees, and log session notes. |
| `client/src/pages/Messages.jsx` | Real-Time Chat Center | Direct messaging interface with active thread selection, real-time message bubble feeds, and typing indicators. |
| `client/src/pages/Events.jsx` | Events Explorer | Calendar and cards view of campus seminars, networking mixers, and webinars with one-click RSVP. |
| `client/src/pages/EventDetails.jsx` | Event In-Depth View | Detailed view showing full agenda, host bio, location map/link, and registered attendees. |
| `client/src/pages/Announcements.jsx` | Campus Broadcasts | Feed of institutional notices and departmental updates posted by administrators or professors. |
| `client/src/pages/Donations.jsx` | University Giving Portal | Campaign showcase with donation progress bars, pledge amount selector, and payment checkout integration. |
| `client/src/pages/Admin.jsx` | Admin Management Suite | Admin-only dashboard managing account verifications, role escalations, job moderation, donation reports, and audit logs. |
| `client/src/pages/Assistant.jsx` | AI Career Chatbot | Interactive chat interface connected to the backend AI Assistant for career advice and platform guidance. |
| `client/src/pages/JobReadiness.jsx` | AI Career Match Assessor | Analyzes student profiles against selected job descriptions to generate readiness scores and custom roadmaps. |
| `client/src/pages/Resume.jsx` | Resume Viewer & Manager | Allows students to view, upload, and update their active resume files. |
| `client/src/pages/ResumeAnalyzer.jsx` | AI ATS Resume Analyzer | PDF/DOCX resume uploader giving automated ATS scores, skill extraction, keyword matches, and improvement tips. |
| `client/src/pages/SemanticSearch.jsx` | AI Vector Semantic Search | Natural language search interface finding people and job opportunities using vector embeddings rather than exact keywords. |
| `client/src/pages/Settings.jsx` | Account & Security Settings | Allows changing password, managing notification channels, and configuring field-level privacy controls. |
| `client/src/pages/SystemScreens.jsx` | System Error Displays | Provides Swiss-styled error screens: `Forbidden` (403), `Unauthorized` (401), `ServerError` (500), `Offline`, and `Maintenance`. |
| `client/src/pages/ComingSoon.jsx` | Future Feature Stub | Graceful fallback view for features planned in upcoming system versions. |
| `client/src/pages/NotFound.jsx` | 404 Error Screen | Handles unmatched URL routes with navigation options to return to safe areas. |

---

## 11. Frontend Routing & Security Guards (`client/src/routes/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/routes/index.jsx` | Route Definitions | Central router table mapping all URLs to page components and layout wrappers. |
| `client/src/routes/guards.jsx` | Navigation Guards | Higher-Order Components enforcing access controls: `<RequireAuth>`, `<RequireAnonymous>`, and `<RequireRoleAccess>` (RBAC). |

---

## 12. Frontend Service Layer & Tests (`client/src/services/`)

The client service layer abstracts HTTP requests, manages local mock fallbacks, and executes API calls.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/services/http.js` | Base HTTP Client | Axios/Fetch wrapper configuring base URL, timeout, automatic Bearer JWT injection, and unified error handling. |
| `client/src/services/api.js` | Unified Gateway | Dynamic proxy layer routing API operations to `api.real.js` (backend) or `mock-db.js` (offline mode). |
| `client/src/services/api.real.js` | Real REST API Client | Concrete implementation making genuine HTTP requests to all backend `/api/v1` routes. |
| `client/src/services/auth.service.js` | Auth API Handler | Client service handling login, registration, token refresh, logout, password resets, and session recovery. |
| `client/src/services/admin.service.js` | Admin API Handler | Client service for user verification approvals, role modifications, moderation queues, and audit log fetches. |
| `client/src/services/ai.service.js` | AI Features Handler | Client service communicating with backend AI endpoints (chat, resume ATS analysis, career readiness, semantic search). |
| `client/src/services/announcement.service.js` | Announcements Client | Client service fetching, creating, and deleting campus announcements. |
| `client/src/services/directory.service.js` | Directory Client | Client service executing directory queries, facet counts, and public profile lookups. |
| `client/src/services/donation.service.js` | Donations Client | Client service managing donation campaigns and initiating payment intents. |
| `client/src/services/events.service.js` | Events Client | Client service handling event browsing, creation, and RSVP status changes. |
| `client/src/services/jobs.service.js` | Jobs Client | Client service for creating job postings, fetching listings, and submitting applications. |
| `client/src/services/mentorship.service.js` | Mentorship Client | Client service for sending mentorship requests, accepting mentees, and updating mentorship settings. |
| `client/src/services/messaging.service.js` | Messaging Client | Client service managing chat conversations, message history, and Socket.io subscriptions. |
| `client/src/services/notification.service.js` | Notifications Client | Client service fetching notifications and marking items as read. |
| `client/src/services/resume.service.js` | Resume Client | Client service uploading resume files and fetching active resume records. |
| `client/src/services/user.service.js` | User Profile Client | Client service managing user profile data, avatars, and settings updates. |
| `client/src/services/auth.service.test.js` | Auth Unit Tests | Vitest unit tests verifying authentication service methods and error propagation. |
| `client/src/services/auth-regression.test.js` | Auth Regression Tests | Regression tests ensuring login and token storage contracts remain unbroken. |
| `client/src/services/tasks-regression.test.js` | Service Contract Tests | Regression tests validating end-to-end service contracts across job and mentorship workflows. |
| `client/src/services/.gitkeep` | Git Anchor | Preserves service folder structure. |

---

## 13. Frontend Utilities & Role Matrix (`client/src/utils/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `client/src/utils/roles.js` | Role Constants & Checks | Defines canonical role constants (`STUDENT`, `ALUMNI`, `PROFESSOR`, `FACULTY`, `ADMIN`, `MODERATOR`) and helper predicates (`isAdmin`, `isAlumni`, `isProfessor`, `isStudent`). |
| `client/src/utils/permissions.js` | RBAC Permission Rules | Maps application features to allowed role arrays, defining access matrices for UI buttons and protected views. |

---

## 14. Database Migrations (`database/migrations/`)

Incremental SQL migrations driving PostgreSQL schema structure from Phase 1 through Phase 6.

| File Name | Migration Scope | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `001_initial_schema.sql` | Core Platform | Creates fundamental tables: `roles`, `users`, `user_roles`, `refresh_tokens`, `profiles`, and audit logging triggers. |
| `002_user_presence.sql` | Presence Tracking | Adds `is_online` status flags and `last_seen_at` timestamps to user profiles. |
| `003_connection_pair_symmetry.sql` | Networking Integrity | Creates unique constraints ensuring connection pairs `(user_a, user_b)` cannot be duplicated in reverse order. |
| `004_student_verification_notes.sql` | Verification Workflow | Adds administrative notes and rejection reason columns to student verification records. |
| `005_community_notification_types.sql` | Notification Enums | Expands notification type enums to support announcements and community activities. |
| `006_job_posting_integrity.sql` | Job Portal Constraints | Enforces foreign key constraints and validation rules on job salaries, application deadlines, and company names. |
| `007_mentorship_job_notifications.sql` | Interaction Triggers | Adds database triggers generating in-app notifications when mentorship requests are submitted or jobs posted. |
| `008_user_account_status.sql` & `.down.sql` | Account Governance | Implements account status enum (`active`, `pending`, `suspended`, `rejected`) and moderation flags. |
| `009_phase2_profiles.sql` & `.down.sql` | Rich Profile Schema | Expands profile schemas with `education_experiences`, `work_experiences`, `social_links`, and `certifications`. |
| `010_directory_trigram.sql` & `.down.sql` | Trigram Directory Search | Enables PostgreSQL `pg_trgm` extension and adds GIN indexes over names, companies, and skills for lightning-fast fuzzy search. |
| `011_networking_mentorship.sql` & `.down.sql` | Connections & Mentors | Creates `connections`, `mentorship_relationships`, `mentorship_requests`, and mentor availability schedules. |
| `012_jobs_portal.sql` & `.down.sql` | Jobs & Applications | Creates `jobs`, `job_applications`, `saved_jobs`, and candidate status tracking tables. |
| `013_events_notifications_messaging.sql` & `.down.sql` | Social & Communications | Creates `events`, `event_rsvps`, `conversations`, `conversation_participants`, `messages`, and `notifications` tables. |
| `014_donations_moderation_audit.sql` & `.down.sql` | Giving & Auditing | Creates `donation_campaigns`, `donations`, `content_reports`, and platform-wide `audit_logs`. |
| `015_ai_embeddings.sql` & `.down.sql` | AI Vector Store | Creates `ai_embeddings` table storing dense vector representations of profiles and jobs for cosine similarity search. |
| `016_roles_professor.sql` & `.down.sql` | Faculty Structure | Formalizes `PROFESSOR` and `FACULTY` roles with department mappings and academic advisory permissions. |
| `017_career_roadmaps.sql` & `.down.sql` | AI Roadmaps | Creates `career_roadmaps` and `roadmap_tasks` tables storing AI-generated milestone paths for students. |
| `018_announcements.sql` & `.down.sql` | Broadcast System | Creates `announcements` table with target audience scoping, expiration dates, and priority flags. |
| `019_mentorship_settings_profiles.sql` & `.down.sql` | Mentorship Preferences | Adds custom mentor intake questions, max mentee capacities, and mentorship topic tags. |
| `database/migrations/README.md` | Migration Runbook | Documentation explaining migration numbering, naming conventions, and rollback instructions. |

---

## 15. Database Schema & Seeders (`database/schema/`, `database/seeds/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `database/schema/README.md` | Schema Reference | Entity-relationship guidelines and architectural notes for database models. |
| `database/seeds/001_roles.sql` | System Seed | Inserts system roles (`ADMIN`, `ALUMNI`, `STUDENT`, `PROFESSOR`, `FACULTY`, `MODERATOR`) on conflict do nothing. |
| `database/seeds/.gitkeep` | Git Anchor | Keeps seed directory tracked. |

---

## 16. System Documentation (`docs/`)

Technical documentation covering API endpoints, architecture, backend internals, deployment, and testing.

### API Specifications (`docs/api/`)
- `docs/api/README.md`: Overview of REST API standards, base URL `/api/v1`, headers, and standardized JSON response envelope.
- `docs/api/applications.md`: Endpoints for student job applications, status updates, and resume submissions.
- `docs/api/authentication.md`: Complete specifications for `/auth/login`, `/register`, `/refresh`, `/logout`, and password resets.
- `docs/api/directory.md`: Query parameters, pagination contracts, and response schemas for alumni and student searches.
- `docs/api/events.md`: Endpoints for creating campus events, listing upcoming events, and managing attendee RSVPs.
- `docs/api/jobs.md`: Endpoints for creating, browsing, filtering, and bookmarking job postings.
- `docs/api/mentorship.md`: Endpoints for finding mentors, submitting mentorship requests, and approving pairings.
- `docs/api/messaging.md`: Specifications for conversation threads, direct messaging, and read indicators.
- `docs/api/networking.md`: Specifications for connection requests, acceptance, rejection, and relationship queries.
- `docs/api/notifications.md`: In-app notification retrieval and read status marking endpoints.
- `docs/api/profiles.md`: Specifications for personal profile retrieval, updates, experiences, and privacy controls.

### Architecture (`docs/architecture/`)
- `docs/architecture/system-architecture.md`: Comprehensive system architecture diagrams, data flow models, and security boundary documentation.

### Backend Guides (`docs/backend/`)
- `docs/backend/architecture.md`: Layering principles (Routes -> Controllers -> Services -> Models) and error handling design.
- `docs/backend/authentication.md`: JWT token issuance, refresh rotation strategy, bcrypt salt rounds, and token invalidation.
- `docs/backend/background-jobs.md`: Background job queue design, periodic sweeps, and async task execution.
- `docs/backend/database.md`: Database connection pooling (`pg.Pool`), transaction boundaries, and migration policies.
- `docs/backend/file-storage.md`: Upload handling, MIME type verification, file size constraints, and disk storage layout.
- `docs/backend/privacy.md`: Field-level privacy filtering, visibility masks, and student data protection rules.
- `docs/backend/websockets.md`: Real-time WebSocket connection lifecycle, JWT handshake verification, and room topology (`user:<id>`).

### Database, Deployment & Testing (`docs/database/`, `docs/deployment/`, `docs/testing/`)
- `docs/database/README.md`: Database setup guide, PostgreSQL configuration, and embedded PGlite usage.
- `docs/deployment/backend-deployment.md`: Production deployment guide covering environment setups, Docker builds, and reverse proxies.
- `docs/testing/README.md`: Testing overview and instructions for executing unit, integration, and E2E test scripts.
- `docs/testing/TEST_PLAN_AUTH_MERN.md`: Master test plan detailing all test cases for authentication, RBAC, and security boundaries.

---

## 17. Backend Server Root & Config (`server/`, `server/src/config/`, `server/src/constants/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/.env` | Server Secrets | Server-side environment variables (DB credentials, JWT secrets, Stripe secret keys, Gemini/OpenAI API keys). |
| `server/package.json` | Server Manifest | Express 5, Socket.io, node-postgres (`pg`), `@electric-sql/pglite`, Zod, bcrypt, multer, pdf-parse, mammoth dependencies. |
| `server/package-lock.json` | Server Lockfile | Exact dependency tree lockfile for backend packages. |
| `server/eslint.config.js` | Server Linter Config | ESLint configuration for backend Node.js standards. |
| `server/db.err` | Dev DB Error Log | Standard error output from embedded local PGlite development runs. |
| `server/devdb.log` | Dev DB Query Log | Query execution log from local embedded development database. |
| `server/src/config/env.js` | Typed Config Loader | Validates and exports environment variables with defaults using safe fallbacks. |
| `server/src/config/database.js` | DB Pool & Client | Configures `pg.Pool`, provides `query()` and `getClient()` transaction helpers, and checks database connectivity. |
| `server/src/config/devDbAutoStart.js` | Auto DB Launcher | Spawns local embedded PGlite database process automatically if native PostgreSQL is not detected. |
| `server/src/constants/auditActions.js` | Audit Log Enums | Enumerates action codes for system audit logging (`USER_LOGIN`, `ROLE_CHANGE`, `JOB_POSTED`, `CONTENT_DELETED`). |
| `server/src/constants/notificationTypes.js` | Notification Enums | Enumerates notification categories (`MENTORSHIP_REQUEST`, `JOB_APPLICATION_UPDATE`, `EVENT_REMINDER`). |

---

## 18. Backend Scratch & Verification Scripts (`server/scratch/`, `server/scripts/`)

Verification scripts and automated test suites ensuring system integrity across all user journeys.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/scratch/test-verification.js` | Scratch Script | Ad-hoc test runner for validating student verification token mechanics. |
| `server/scripts/dev-postgres.js` | Zero-Docker DB Engine | Embedded PostgreSQL runner powered by `@electric-sql/pglite` listening on port `54329` for zero-install development. |
| `server/scripts/perf-directory.mjs` | Search Performance Benchmark | Benchmarks trigram fuzzy directory search response times under simulated high load. |
| `server/scripts/smoke.js` | Sanity Smoke Test | Rapid connectivity check verifying server health, database connectivity, and core routes. |
| `server/scripts/verify-all-role-interactions.mjs` | Multi-Role E2E Test | Simulates real interactions between Students, Alumni, Professors, and Admins to ensure RBAC and workflow continuity. |
| `server/scripts/verify-assistant-e2e.mjs` | AI Assistant E2E Test | Verifies AI conversational agent endpoints, context hydration, and question-answering workflows. |
| `server/scripts/verify-e2e-demo.mjs` | Complete Demo Verification | Master test verifying the entire demo flow (registration, profile completion, job posting, application, donation). |
| `server/scripts/verify-job-readiness-e2e.mjs` | Job Readiness E2E Test | Tests AI career matching: evaluates candidate skills against job requirements and checks readiness output. |
| `server/scripts/verify-journeys.mjs` | User Journey Simulation | Automated script walking through realistic user journeys across the application. |
| `server/scripts/verify-migrations.mjs` | Migration Integrity Check | Runs all database migrations up and down to ensure SQL scripts are bidirectional and reversible. |
| `server/scripts/verify-resume-analyzer-e2e.mjs` | ATS Resume E2E Test | Uploads sample PDF/DOCX resumes and verifies text extraction, skill tagging, and ATS scoring. |
| `server/scripts/verify-semantic-search-e2e.mjs` | Vector Search E2E Test | Tests AI vector embeddings generation and semantic similarity ranking. |

---

## 19. Backend Entry & Core Application (`server/server.js`, `server/src/app.js`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/server.js` | Server Bootstrapper | Top-level entry file: initializes HTTP server, binds Socket.io, ensures database readiness, launches background scheduler, and binds port 5000. |
| `server/src/app.js` | Express App Configuration | Configures Express middleware: Helmet security headers, CORS policies, rate limiters, Morgan logging, cookie parser, JSON body parsing, route mounting at `/api/v1`, and global error handling. |

---

## 20. Backend Middleware (`server/src/middleware/`)

Interceptors providing authentication, authorization, security, validation, and error management.

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/middleware/auth.js` | JWT Authentication Guard | Extracts Bearer tokens from `Authorization` header, verifies JWT signature, decodes user payload, and attaches `req.user`. |
| `server/src/middleware/rbac.js` | Role-Based Access Control | Restricts route execution to users possessing required roles (`requireRole(['ADMIN', 'ALUMNI'])`). |
| `server/src/middleware/validate.js` | Schema Validation Interceptor | Zod validation middleware parsing and validating `req.body`, `req.query`, and `req.params`; rejects invalid payloads with formatted errors. |
| `server/src/middleware/errorHandler.js` | Central Error Handler | Catches all synchronous and asynchronous errors; transforms them into standard JSON error envelopes without leaking stack traces in production. |
| `server/src/middleware/rateLimiter.js` | Abuse & DoS Protection | Uses `express-rate-limit` to throttle rapid requests on sensitive endpoints (login, registration, AI generation). |
| `server/src/middleware/security.js` | Security Policies & CSRF | Enforces CSRF tokens, secure cookie headers, and checks database availability before request processing. |
| `server/src/middleware/upload.js` | Multipart File Upload | Configures `multer` disk storage with file size limits and MIME filtering for photos (JPEG, PNG) and resumes (PDF, DOCX). |

---

## 21. Backend Controllers (`server/src/controllers/`)

Controller classes that unpack requests, invoke domain services, and structure HTTP responses.

| File Name | Primary Domain | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/controllers/authController.js` | Authentication | Handles register, login, refresh tokens, logout, email verification, and password resets. |
| `server/src/controllers/userController.js` | User Account | Retrieves user profiles, account metadata, and account settings. |
| `server/src/controllers/profileController.js` | Basic Profiles | Manages basic user biography, summary, headline, and privacy preferences. |
| `server/src/controllers/profileV2Controller.js` | Rich Profiles | Manages education history, work experience records, social links, and certifications. |
| `server/src/controllers/directoryController.js` | Directory Queries | Executes member directory queries, facet counting, and geographic map points. |
| `server/src/controllers/alumniDirectoryController.js` | Alumni Directory | Enriched alumni search with company facets and graduation year filters. |
| `server/src/controllers/connectionController.js` | Networking Connections | Manages connection requests: send, accept, reject, withdraw, and list active connections. |
| `server/src/controllers/mentorshipController.js` | Mentorship Programs | Manages mentorship pairings, mentor availability settings, and session status updates. |
| `server/src/controllers/jobController.js` | Job Postings | Handles job creation, listing, updating, bookmarking, and applicant review. |
| `server/src/controllers/eventController.js` | Campus Events | Handles event creation, updates, public listing, and attendee RSVP management. |
| `server/src/controllers/conversationController.js` | Chat Conversations | Creates direct conversation threads and retrieves recent chat messages. |
| `server/src/controllers/messageController.js` | Chat Messages | Dispatches direct messages and handles chat attachments. |
| `server/src/controllers/notificationController.js` | Notifications | Retrieves unread user notifications and marks notifications as read. |
| `server/src/controllers/announcementController.js` | Broadcast Notices | Manages institutional announcements, targeting by role or department. |
| `server/src/controllers/donationController.js` | Donations & Giving | Manages donation campaigns, donation pledges, and payment checkouts. |
| `server/src/controllers/fileController.js` | File Storage | Uploads and serves user avatar images and resume documents. |
| `server/src/controllers/aiController.js` | AI Intelligence | Handles AI Assistant chat, resume ATS analysis, job readiness scoring, and semantic search. |
| `server/src/controllers/professorController.js` | Faculty Domain | Faculty-specific operations: student advisory lists, department research projects, and academic announcements. |
| `server/src/controllers/reportController.js` | Moderation Reports | Accepts user reports regarding inappropriate content or policy violations. |
| `server/src/controllers/verificationController.js` | Account Verification | Handles institutional verification requests for graduating students and alumni. |
| `server/src/controllers/oauthController.js` | Third-Party Auth | Handles OAuth2 single sign-on callbacks (Google, LinkedIn). |
| `server/src/controllers/healthController.js` | System Health | Liveness and readiness probe reporting uptime and database connectivity. |

---

## 22. Backend Models & Data Access (`server/src/models/`, `server/src/repositories/`)

Data access layer containing SQL queries and mapping database rows to JavaScript objects.

| File Name | Primary Entity | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/models/userModel.js` | Users & Identity | Queries for finding users by email/id, creating users, and updating credentials and status. |
| `server/src/models/profileModel.js` | Profiles & Experience | Queries for profiles, work history, education records, and skills associations. |
| `server/src/models/jobModel.js` | Jobs & Applications | Queries for job postings, application records, bookmarks, and candidate statuses. |
| `server/src/models/mentorshipModel.js` | Mentorships | Queries for mentorship relationships, incoming requests, and mentor criteria. |
| `server/src/models/eventModel.js` | Events & Attendees | Queries for campus events, event schedules, RSVP lists, and attendee headcounts. |
| `server/src/models/conversationModel.js` | Chat & Threads | Queries for conversations, participants, message logs, and unread counts. |
| `server/src/models/donationModel.js` | Campaigns & Pledges | Queries for fundraising campaigns, donation transactions, and donor rankings. |
| `server/src/models/announcementModel.js` | Broadcast Bulletins | Queries for institutional announcements filtered by user role and date. |
| `server/src/models/reportModel.js` | Moderation Tickets | Queries for moderation reports, flagged entities, and review statuses. |
| `server/src/models/roadmapModel.js` | Career Roadmaps | Queries for student career roadmaps, milestones, and task completion. |
| `server/src/models/tokenModel.js` | Security Tokens | Queries for storing, retrieving, and revoking refresh tokens and password reset tokens. |
| `server/src/models/fileModel.js` | File Metadata | Queries for file metadata records, storage paths, and owner associations. |
| `server/src/models/backgroundJobModel.js` | Task Queue Ledger | Queries for background job queueing, scheduled tasks, and execution logs. |
| `server/src/repositories/userRepository.js` | Repository Pattern | Data isolation repository abstracting user queries from business logic. |

---

## 23. Backend API Routes (`server/src/routes/`)

Route modules mapping HTTP endpoints, validation middleware, and auth guards to controllers.

| File Name | Mount Path | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/routes/index.js` | `/api/v1` | Central router aggregator mounting all domain sub-routers. |
| `server/src/routes/healthRoutes.js` | `/health` | Health checking endpoint accessible without database dependencies. |
| `server/src/routes/authRoutes.js` | `/auth` | Authentication endpoints: `/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/reset-password`. |
| `server/src/routes/oauthRoutes.js` | `/auth` | OAuth SSO routes: `/google`, `/google/callback`, `/linkedin`, `/linkedin/callback`. |
| `server/src/routes/profileRoutes.js` | `/profiles` | Profile endpoints: view and update personal profile, bio, and privacy settings. |
| `server/src/routes/profileV2Routes.js` | `/profiles/me/*` | Rich profile sub-resources: education, work experiences, skills, and honors. |
| `server/src/routes/alumniDirectoryRoutes.js` | `/alumni` | Searchable alumni directory, faceted navigation, and geographic distribution. |
| `server/src/routes/connectionRoutes.js` | `/connections` | Networking connection routes: send, accept, reject, withdraw, and list connections. |
| `server/src/routes/conversationRoutes.js` | `/conversations` | Conversation thread management and message history retrieval. |
| `server/src/routes/messageRoutes.js` | `/messages` | Direct message sending and read receipt logging. |
| `server/src/routes/mentorshipRoutes.js` | `/mentorship` | Mentorship program routes: request mentor, respond to request, update settings. |
| `server/src/routes/eventRoutes.js` | `/events` | Event management routes: browse events, create events, register RSVPs. |
| `server/src/routes/jobRoutes.js` | `/jobs` | Job board routes: browse postings, create jobs, bookmark listings. |
| `server/src/routes/applicationRoutes.js` | `/applications` | Candidate job application submission and status tracking. |
| `server/src/routes/fileRoutes.js` | `/files` | File upload and secure retrieval routes for avatars and resumes. |
| `server/src/routes/donationRoutes.js` | `/donations` | Fundraising campaign routes and donation pledges. |
| `server/src/routes/paymentRoutes.js` | `/payments` | Payment processing routes (Stripe payment intents and webhooks). |
| `server/src/routes/announcementRoutes.js` | `/announcements` | Campus announcements publishing and retrieval routes. |
| `server/src/routes/professorRoutes.js` | `/professors` | Faculty-specific routes: advisee rosters and academic initiatives. |
| `server/src/routes/reportRoutes.js` | `/reports` | User reporting and moderation complaint routes. |
| `server/src/routes/adminRoutes.js` | `/admin` | Administrative portal routes: verifications, role management, audit logs. |
| `server/src/routes/aiRoutes.js` | `/ai` | AI intelligence routes: assistant chat, resume ATS analyzer, job readiness, semantic search. |

---

## 24. Backend Database Maintenance Scripts (`server/src/scripts/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/scripts/migrate.js` | Migration Runner | Executes pending SQL migrations up or down against the configured database. |
| `server/src/scripts/migrate-status.js` | Migration Status Checker | Compares disk migration files with `schema_migrations` table and logs status. |
| `server/src/scripts/sync-migrations.js` | Migration Sync Tool | Repairs and syncs migration state table during schema repairs. |
| `server/src/scripts/seed.js` | Base Seeder | Inserts default seed data (system roles, administrative users). |
| `server/src/scripts/seed-demo.js` | Demo Environment Seeder | Generates a rich, realistic university ecosystem with students, alumni, professors, jobs, and events. |
| `server/src/scripts/seed-dev-users.js` | Dev Users Seeder | Inserts lightweight known test credentials for instant development logins. |
| `server/src/scripts/seed-roles-interactions.js` | Social Interaction Seeder | Generates realistic connections, chat messages, and mentorship pairings between seed users. |
| `server/src/scripts/reset-db.js` | Database Dropper & Rebuilder | Completely drops all tables, schemas, and types, then runs all migrations from scratch. |
| `server/src/scripts/reset-demo.js` | Demo Reset Utility | Rebuilds database and applies full demo dataset in one command. |

---

## 25. Backend Core Services (`server/src/services/`)

The core business logic layer executing workflows, business rules, and external integrations.

| File Name | Primary Responsibility | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/services/authService.js` | Auth Logic | Password hashing with bcrypt, JWT token signing, refresh token rotation, and credential verification. |
| `server/src/services/userService.js` | User Profile Logic | Profile retrieval, user preferences, and account status management. |
| `server/src/services/profileService.js` | Experience Aggregation | Manages biography, skills arrays, work histories, and education credentials. |
| `server/src/services/directoryService.js` | Directory Query Engine | Builds parameterized SQL queries for member search with pagination, filters, and privacy masks. |
| `server/src/services/alumniDirectoryService.js` | Alumni Search Logic | Specialized search engine computing facet counts for companies, locations, and graduation years. |
| `server/src/services/connectionService.js` | Networking Workflow | Enforces connection business rules: prevents duplicate requests, self-connections, and manages mutual friendships. |
| `server/src/services/mentorshipService.js` | Mentorship Pairing | Mentorship matching engine: verifies mentor capacities, manages request transitions, and logs progress. |
| `server/src/services/jobService.js` | Job Postings Logic | Job lifecycle management: expiration dates, applicant tracking, and role posting permissions. |
| `server/src/services/eventService.js` | Campus Events Logic | Event registration rules: capacity limits, registration deadlines, and attendee tracking. |
| `server/src/services/conversationService.js` | Chat Thread Logic | Manages conversation participants, message history retrieval, and thread lookups. |
| `server/src/services/messageService.js` | Direct Message Logic | Persists direct messages, validates permissions, and dispatches real-time WebSocket alerts. |
| `server/src/services/notificationService.js` | In-App Alerts | Creates notification records and dispatches them to active user socket rooms. |
| `server/src/services/announcementService.js` | Announcements Logic | Publishes campus announcements and scopes visibility based on user roles and departments. |
| `server/src/services/donationService.js` | Fundraising Logic | Manages campaign funds, records donations, and calculates progress toward targets. |
| `server/src/services/stripeService.js` | Stripe Payment Gateway | Interacts with Stripe API to create PaymentIntents and process payment webhooks. |
| `server/src/services/paymentClient.js` | Payment Abstraction | Unified payment interface switching between live Stripe API and offline mock processor. |
| `server/src/services/auditService.js` | System Audit Logger | Appends immutable audit records capturing critical operations (logins, role changes, moderations). |
| `server/src/services/fileService.js` | File Operations | Handles avatar images and resume files: checks ownership and coordinates disk writes. |
| `server/src/services/storageService.js` | Storage Abstraction | Manages file paths, directory creation, and disk reads/deletions. |
| `server/src/services/mailService.js` | Email Dispatcher | Sends system emails (verification links, password resets) via Nodemailer or logs to console in dev. |
| `server/src/services/templates.js` | Email HTML Templates | Generates clean, accessible HTML email templates for transactional communications. |
| `server/src/services/oauthService.js` | OAuth Provider Client | Exchanges authorization codes for user profile details with Google and LinkedIn APIs. |
| `server/src/services/privacyService.js` | Field Privacy Filter | Inspects user privacy settings and scrubs sensitive fields (email, phone, company) for unauthorized viewers. |
| `server/src/services/professorService.js` | Academic Faculty Logic | Coordinates professor advisee rosters, department research listings, and academic mentorship. |
| `server/src/services/reportService.js` | Moderation Workflow | Handles user violation reports, assigns review statuses, and manages moderation queues. |
| `server/src/services/verificationService.js` | Institutional Verification | Manages student verification submissions, document reviews, and graduation status confirmations. |
| `server/src/services/scheduler.js` | Background Scheduler | Periodic background task runner: clears expired tokens, marks past events as concluded, and cleans logs. |

---

## 26. Backend AI Intelligence Services & Providers (`server/src/services/ai/`)

Implements the platform's AI Career Intelligence features: LLM Assistant, Resume ATS Analyzer, Job Readiness Assessment, and Semantic Vector Search.

| File Name | Primary AI Capability | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/services/ai/aiService.js` | AI Orchestrator | Central coordinator uniting prompt engineering, retrieval augmented context (RAG), and LLM generation. |
| `server/src/services/ai/aiProvider.js` | Provider Interface | Abstract base class defining standardized methods (`generateText`, `generateEmbedding`) across all AI backends. |
| `server/src/services/ai/llmService.js` | LLM Dispatcher | Invokes configured AI provider with temperature parameters, token limits, and structured JSON parsing. |
| `server/src/services/ai/promptService.js` | System Prompt Library | High-performance prompt templates engineering context for Assistant chat, resume analysis, and roadmaps. |
| `server/src/services/ai/atsScorer.js` | Resume ATS Scoring | Evaluates candidate resume text against target job descriptions, computing keyword match percentages and ATS scores. |
| `server/src/services/ai/resumeExtractor.js` | Document Text Parser | Extracts clean raw text from uploaded binary PDF (`pdf-parse`) and DOCX (`mammoth`) files. |
| `server/src/services/ai/careerReadinessService.js` | Career Readiness Engine | Analyzes user skills, education, and experiences to compute readiness scores and roadmap tasks. |
| `server/src/services/ai/skillTaxonomy.js` | Skills Knowledge Base | Standardized taxonomy of technical and soft skills, synonyms, and categorical benchmarks. |
| `server/src/services/ai/embeddingService.js` | Vector Embeddings | Transforms user bios, skills, and job descriptions into dense mathematical vector embeddings. |
| `server/src/services/ai/retrievalService.js` | Vector Similarity Search | Executes cosine similarity mathematical searches across vector embeddings to find closest semantic matches. |
| `server/src/services/ai/providers/geminiProvider.js` | Google Gemini Adapter | Integrates Google Gemini API (Gemini 1.5/2.0 Flash) for text generation and text-embedding-004 vector models. |
| `server/src/services/ai/providers/openaiProvider.js` | OpenAI Adapter | Integrates OpenAI API (`gpt-4o`, `text-embedding-3-small`) for text generation and embedding models. |
| `server/src/services/ai/providers/testProvider.js` | Deterministic Mock Provider | Deterministic mock AI provider returning structured fixtures for fast, reliable unit testing without API keys. |

---

## 27. Backend WebSockets & Real-Time Messaging (`server/src/sockets/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/sockets/index.js` | Socket.io Initialization | Mounts Socket.io on Express HTTP server, performs JWT handshake authentication, and assigns sockets to `user:<id>` rooms. |
| `server/src/sockets/messageHandlers.js` | Real-Time Chat Handlers | Listens for real-time events: `chat:send`, `chat:typing`, and `chat:read`, broadcasting events to recipient socket rooms. |

---

## 28. Backend Utilities (`server/src/utils/`)

| File Name | Primary Role | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/utils/crypto.js` | Cryptographic Helper | Generates cryptographically secure random tokens, SHA-256 hashes, and UUIDs using Node's `node:crypto`. |
| `server/src/utils/errors.js` | Custom Error Classes | Defines standard HTTP error classes (`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`). |
| `server/src/utils/logger.js` | Structured Logger | JSON structured logger with log levels (`info`, `warn`, `error`, `debug`) and timestamps for production observability. |
| `server/src/utils/query.js` | SQL Query Builder | Helper building parameterized SQL clauses, dynamic WHERE conditions, sorting, and pagination parameters. |
| `server/src/utils/requestContext.js` | Async Request Tracing | Uses Node.js `AsyncLocalStorage` to propagate correlation IDs across asynchronous database calls. |
| `server/src/utils/response.js` | Response Envelope Formatter | Formats standardized JSON responses: `sendSuccess(res, data)`, `sendError(res, message)`, and `paginated(res, items, meta)`. |

---

## 29. Backend Request Validators (`server/src/validators/`)

Zod schema validators enforcing strict contract validation on incoming payloads before reaching controllers.

| File Name | Target Domain | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/src/validators/authValidators.js` | Auth Schemas | Validates registration forms, email formats, password strength requirements, and login credentials. |
| `server/src/validators/profileValidators.js` | Profile Schemas | Validates updates to bio, contact information, skills, and privacy preference flags. |
| `server/src/validators/communityValidators.js` | Community Schemas | Validates query parameters for directory lookups, member search filters, and location bounds. |
| `server/src/validators/connectionValidators.js` | Connection Schemas | Validates connection invitations, note lengths, and status transition parameters. |
| `server/src/validators/mentorshipValidators.js` | Mentorship Schemas | Validates mentorship requests, goals, mentor criteria, and session feedback. |
| `server/src/validators/jobValidators.js` | Job Portal Schemas | Validates job postings (title, company, description, salary numbers) and application submissions. |
| `server/src/validators/eventValidators.js` | Events Schemas | Validates event creation payloads (dates, capacities, location types) and RSVP submissions. |
| `server/src/validators/conversationValidators.js` | Conversation Schemas | Validates new thread initiation parameters and participant lists. |
| `server/src/validators/messageValidators.js` | Message Schemas | Validates direct message text lengths, attachment formats, and recipient IDs. |
| `server/src/validators/donationValidators.js` | Donation Schemas | Validates donation currency amounts, campaign IDs, and donor anonymity flags. |
| `server/src/validators/adminValidators.js` | Admin Schemas | Validates user role promotions, account status updates, and moderation resolutions. |
| `server/src/validators/aiValidators.js` | AI Payload Schemas | Validates AI chat prompts, resume file inputs, job readiness IDs, and semantic search queries. |

---

## 30. Backend Test Suite & Helpers (`server/tests/`, `server/tests/helpers/`)

Automated integration test suites powered by Node.js native test runner (`node --test`) and Supertest.

| File Name | Test Target | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/tests/helpers/testDatabase.js` | Test Database Harness | Test setup utility: resets test database, runs migrations, and manages isolated database transactions. |
| `server/tests/auth.test.js` | Auth Integration Tests | Tests registration, password hashing, JWT login, token refresh rotation, and logout invalidation. |
| `server/tests/admin-portal.test.js` | Admin Portal Tests | Tests verification approval queues, role changes, and audit log generation. |
| `server/tests/ai-foundation.test.js` | AI Endpoints Tests | Tests AI Assistant, ATS scorer, career readiness, and semantic search using deterministic test fixtures. |
| `server/tests/integration.test.js` | Cross-Service Tests | Tests complete cross-system pipelines connecting users, profiles, and networking. |
| `server/tests/phase2.test.js` | Phase 2 Profile Tests | Tests rich profile endpoints: education credentials, work history, and skills. |
| `server/tests/phase3.test.js` | Phase 3 Directory Tests | Tests trigram directory search, filtering by company/skills, and networking connections. |
| `server/tests/phase4.test.js` | Phase 4 Jobs & Mentors | Tests job posting creation, application lifecycle, and mentorship request matching. |
| `server/tests/phase5-events.test.js` | Phase 5 Events Tests | Tests event creation, RSVP headcounts, and cancellation mechanics. |
| `server/tests/phase5-messaging.test.js` | Phase 5 Messaging Tests | Tests direct messaging, thread retrieval, unread indicators, and notification delivery. |
| `server/tests/phase6-final.test.js` | Phase 6 Final Tests | Tests donations, audit logging integrity, content moderation, and system health status. |
| `server/tests/professor-role.test.js` | Faculty Role Tests | Tests professor role permissions, advisee rosters, and faculty broadcast announcements. |
| `server/tests/.gitkeep` | Git Anchor | Keeps test folder structure tracked. |

---

## 31. Runtime & Storage Directories (`server/uploads/`, `server/.dev-postgres/`)

Special runtime data directories managed by the backend during execution.

| Directory Name | Classification | Technical Purpose & Implementation |
| :--- | :--- | :--- |
| `server/uploads/` | Media Storage | Stores uploaded binary files on the local filesystem, separated into `photos/` (user avatars) and `resumes/` (PDF/DOCX documents). Sanitized filenames are generated using UUIDs and timestamps to avoid path collisions. |
| `server/.dev-postgres/` | Embedded Database Data | Local data cluster directory used by `@electric-sql/pglite` during zero-Docker local execution, holding PostgreSQL catalogs, write-ahead logs (`pg_wal`), and table files without requiring an external PostgreSQL installation. |

---

*Documentation compiled and verified against the Alumni Network Portal codebase.*

