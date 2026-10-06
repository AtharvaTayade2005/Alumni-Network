# Jobs — `/api/jobs`

The job board: postings, the moderation workflow that puts one on the board,
search, and saved postings.

Schemas: [jobs, companies, skills](../backend/database.md#phase-4-tables).
File handling: [file-storage.md](../backend/file-storage.md).

---

## Conventions

- Every endpoint requires a bearer token.
- Statuses are lowercase in the database and uppercase in the API. Requests accept
  lower case, dashes and spaces, so `under-review`, `UNDER REVIEW` and
  `UNDER_REVIEW` are the same instruction.
- Money is `NUMERIC(12,2)` with a three-letter `salaryCurrency`.
- Filters are repeated or comma-separated; both are accepted.

### Job statuses

| API status | Stored | Meaning |
| --- | --- | --- |
| `DRAFT` | `draft` | Private to its poster |
| `PENDING_REVIEW` | `pending_review` | Waiting for a moderation decision |
| `PUBLISHED` | `published` | Live on the board |
| `CLOSED` | `closed` | No longer accepting applications |
| `REJECTED` | `rejected` | Refused, or pulled after publication |

`ACTIVE`, `LIVE`, `HIDDEN` and `REMOVED` are accepted as input and map onto
`PUBLISHED`/`REJECTED`. Rows migrated from the previous vocabulary keep their old
value in the database until they are next written; reads always report the new name.

---

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | bearer | Search, filter, sort and paginate the board |
| POST | `/` | poster | Create a posting |
| GET | `/:jobId` | bearer | One posting |
| PUT | `/:jobId` | owner, staff | Edit a posting |
| DELETE | `/:jobId` | owner, staff | Delete a posting |
| PATCH | `/:jobId/status` | varies | Move a posting between states |
| PATCH | `/:jobId/close` | owner | Close the caller's own posting |
| PATCH | `/:jobId/moderate` | moderator | `{ action: "approve" \| "remove", reason? }` |
| POST | `/:jobId/save` | bearer | Save a posting |
| DELETE | `/:jobId/save` | bearer | Remove a saved posting |
| GET | `/saved` | bearer | The caller's saved postings |
| GET | `/:jobId/applications` | poster | Applications received on a posting |
| POST | `/:jobId/applications` | bearer | Apply (see [applications.md](applications.md)) |
| PATCH | `/:jobId/applications/:applicationId` | poster | Review one application |
| GET | `/companies` | bearer | Search companies |
| GET | `/companies/:companyId` | bearer | One company and its postings |

`/saved`, `/applications` and `/companies` are declared before `/:jobId`, because
Express matches in registration order and `/saved` would otherwise be read as a
posting id.

---

## Creating a posting

```http
POST /api/jobs
{ "title": "Platform Engineer",
  "companyName": "Northwind",
  "description": "…at least 50 characters…",
  "employmentType": "full_time",
  "workMode": "remote",
  "skills": ["node", "postgres"] }
```

Required: `title` (3–200), `companyName` (2–200), `description` (50–20 000).
Defaulted: `workMode` `onsite`, `employmentType` `full_time`, `salaryCurrency`
`USD`, `experienceLevel` `mid`, `skills` `[]`, `status` `PENDING_REVIEW`.

Only alumni, moderators and administrators may post. A student account gets
`403`, enforced in the database as well as the service.

**Publishing is a moderation decision.** A non-staff posting enters
`PENDING_REVIEW` whatever it asks for: `status: "PUBLISHED"` — or the legacy
`ACTIVE` — is refused with `403` rather than quietly downgraded, because a client
that believed it had published would stop tracking the review. A moderator or
administrator may publish at creation time, which is what lets staff correct the
board without waiting for a second pair of eyes.

Cross-field rules, checked on create and update: `salaryMax` must not be below
`salaryMin`, and `deadline` must be in the future. A deadline is not a database
constraint — it is a rule about a request, and the stored value is a plain date.

`description` and any link field (`applicationUrl`) are length-capped, and links
must be `http(s)` or site-relative: a `javascript:` value stored on a posting
would be rendered as a clickable link by every client that trusts it.

---

## Searching the board

```http
GET /api/jobs?search=engineer&workMode=remote&employmentType=internship
            &experienceLevel=entry&skills=node,postgres&salaryMin=80000
            &openOnly=true&sort=newest&page=1&limit=20
```

| Parameter | Notes |
| --- | --- |
| `search` | Title, company and description |
| `location`, `industry` | Case-insensitive prefix match |
| `workMode` | `remote`, `hybrid`, `onsite` |
| `employmentType` | `full_time`, `part_time`, `internship`, `contract` |
| `experienceLevel` | `entry`, `mid`, `senior`, `lead` |
| `skills` | Must have **every** skill asked for |
| `salaryMin`, `salaryMax` | Overlap, not containment |
| `deadline` | Only postings closing on or before this date |
| `openOnly` | `true` by default; hides expired postings |
| `postedByMe` | The caller's own postings, whatever their state |
| `status` | Any state, for staff or for the poster asking about their own |
| `sort` | `newest`, `oldest`, `title`, `deadline`, `salary` |
| `page`, `limit` | `limit` 1–100, default 20 |

`openOnly` defaults to `true` because a board that lists expired roles sends
readers to dead links.

A salary filter is an **overlap** test: a posting matches when any part of its
range falls inside the range asked for, which is what "at least 80k" means. A
posting with no salary stated is never excluded by a salary filter.

`skills` requires every named skill. The query uses `EXISTS ... IN (...)` rather
than a correlated `NOT EXISTS` over the missing set, because PGlite — which the
test suite runs on — evaluates the correlated form wrongly and drops postings
that do match.

```json
{
  "success": true,
  "data": { "jobs": [ { "id": "…", "title": "…", "status": "PUBLISHED",
                        "skills": [ { "id": "…", "name": "node" } ] } ] },
  "meta": { "page": 1, "limit": 20, "total": 12, "pages": 1 }
}
```

`meta.pages` is at least 1, so a client rendering "page 1 of N" does not have to
special-case an empty result set.

The default listing shows `published` postings only.

---

## Visibility

| Viewer | Sees |
| --- | --- |
| Anyone | `published` |
| The poster | Their own posting in any state |
| Moderator, admin | Any posting in any state |

A posting the caller may not see is reported as **404**, not 403: the board does
not confirm that a draft exists to somebody with no business knowing.

Staff may **edit** any posting so they can fix a broken one during moderation.
That is a deliberate exception, and it is written to the audit log.

---

## The moderation workflow

```http
PATCH /api/jobs/:jobId/status
{ "status": "PUBLISHED", "note": "Looks good" }
```

Transitions, and who may perform them:

| From | To | Who |
| --- | --- | --- |
| `DRAFT` | `PENDING_REVIEW` | poster |
| `PENDING_REVIEW` | `PUBLISHED`, `REJECTED` | moderator, admin |
| `PENDING_REVIEW` | `DRAFT` | poster |
| `PUBLISHED` | `CLOSED`, `PENDING_REVIEW` | poster |
| `PUBLISHED` | `REJECTED` | moderator, admin |
| `CLOSED` | `PUBLISHED` | moderator, admin |
| `REJECTED` | `PENDING_REVIEW` | poster |

A live posting can still be pulled by staff. The previous moderation endpoint
could remove anything, and a moderator who finds a posting they should not have
approved has to be able to say so without going through the owner.

Anything else is `409`.

`note` is shown to the poster when a posting is rejected. A decision stamps
`moderated_by`, `moderated_at` and `published_at`, and notifies the poster.
`PATCH /:jobId/moderate` is the older `{ action: "approve" | "remove" }` shape,
kept working and mapped onto the same transitions.

**Decisions are also enforced in the database.** Moving a posting to
`published`, `rejected` or `closed` requires `moderated_by` to name a moderator or
administrator, and refuses the poster's own name — the migration carries the
trigger, so a direct `UPDATE` cannot bypass the workflow.

---

## Saved postings

```http
POST   /api/jobs/:jobId/save
DELETE /api/jobs/:jobId/save
GET    /api/jobs/saved?page=1&limit=20
```

`POST` and `DELETE` are both accepted because removing a saved posting is not a
state change, so it has no body and reads better as the verb it is. Saving twice
is idempotent and returns the existing row.

---

## Notifications

| Event | Type | Recipient |
| --- | --- | --- |
| Posting published, rejected or reopened | `job_moderated` | Poster, with the moderator's note |
| Application received | `application_received` | Poster |

Notifications are written inside the same transaction as the change they describe,
so a rollback cannot leave somebody holding a notice about something that did not
happen. See [applications.md](applications.md#notifications) for the applicant side.
