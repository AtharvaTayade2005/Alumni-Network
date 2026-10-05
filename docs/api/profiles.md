# Profile API

Everything under `/api/profiles`, `/api/alumni` and `/api/students` requires a
valid access token. Responses use the standard envelope:

```json
{ "success": true, "data": { } }
```

A single failure shape is used everywhere:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": { "code": "UNPROCESSABLE", "message": "Validation failed" },
  "errors": [{ "field": "bio", "message": "String must contain at most 2000 character(s)", "code": "too_big" }]
}
```

`errors` is present for `422` responses and lists every field that failed, so a
client can render all of them at once.

## Two spellings of the same field

The specification names several fields differently from the original schema:
`major` (was `department`), `jobTitle` (was `currentPosition`), and
`university` and `location`, which did not exist before.

Both spellings are accepted on write, and both appear on read. The reason is
that the mentorship, jobs and connection modules were written against the old
column names and are not part of this phase; renaming underneath them would
break them. A trigger keeps `department`/`major` and `currentPosition`/`jobTitle`
synchronised in the database, so the two can never drift.

Responses carry the camelCase names as the documented shape, plus the original
column names for existing clients. New clients should use the camelCase names.

## Own profile

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/profiles/me` | Own profile, including `privacy` |
| `PUT` | `/api/profiles/me` | Partial or full; dispatches on profile type |
| `PATCH` | `/api/profiles/me` | Identical to `PUT` |
| `PUT` | `/api/alumni/me` | Alumni only; `400` if no alumni profile exists |
| `PATCH` | `/api/alumni/me` | Identical to `PUT` |
| `PUT` | `/api/students/me` | Students only; `400` if no student profile exists |
| `PATCH` | `/api/students/me` | Identical to `PUT` |

There is no route that updates someone else's profile. A `userId` in the request
body is not a target selector; only the caller's own profile is ever written.
Including one changes nothing.

```http
PUT /api/alumni/me
{
  "graduationYear": 2015,
  "major": "Computer Science",
  "university": "LUMS",
  "jobTitle": "Senior Engineer",
  "currentCompany": "Acme",
  "industry": "Software",
  "location": "Lahore, Punjab, Pakistan",
  "bio": "Backend engineer.",
  "mentorshipAvailable": true
}
```

Fields left out are unchanged. Passing `null` explicitly clears a nullable field.

`graduationYear` must be between 1950 and ten years from now. `location` is
composed automatically from `city`/`region`/`country` when you supply those
instead; passing an explicit `location` always wins.

### `mentorshipAvailable` versus `openToMentorship`

These are not aliases of each other, and the difference is enforced rather than
documented:

| Field | Profile | Means |
| --- | --- | --- |
| `mentorshipAvailable` | Alumni | "I will mentor" |
| `openToMentorship` | Student | "I would like to be mentored" |

`mentorshipAvailable` maps to `alumni_profiles.is_open_to_mentor`, which the
database refuses to set on an unverified profile (see
[database.md](../backend/database.md#the-mentor-listing-trigger)). A student
profile's `is_open_to_mentorship` is a different column with the opposite
meaning, so it is exposed as `openToMentorship` and `mentorshipAvailable` is
rejected on `PUT /api/students/me` as a `422`. Exposing the student flag under
the alumni's name would have let a client read a student as a prospective
mentor.

Students are never mentors, whatever their own profile says: mentor discovery
joins `alumni_profiles` and requires a verified, opted-in alumnus.

## Sub-resources

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/profiles/me/privacy` | Current privacy settings |
| `PATCH` | `/api/profiles/me/privacy` | Partial update; see [privacy](../backend/privacy.md) |
| `GET` | `/api/profiles/me/skills` | Own skills |
| `PUT` | `/api/profiles/me/skills` | `{ "skills": ["TypeScript", "PostgreSQL"] }` |
| `GET` | `/api/profiles/me/education` | |
| `POST` | `/api/profiles/me/education` | |
| `DELETE` | `/api/profiles/me/education/:id` | |
| `GET` | `/api/profiles/me/experience` | |
| `POST` | `/api/profiles/me/experience` | |
| `DELETE` | `/api/profiles/me/experience/:id` | |
| `GET` | `/api/profiles/me/social-links` | |
| `PUT` | `/api/profiles/me/social-links` | Upsert by `platform` |
| `DELETE` | `/api/profiles/me/social-links/:id` | |

### Skills

Skills are normalized rows, not a comma-separated string. Names are matched and
stored case-insensitively, so `["TypeScript", "typescript"]` results in one
skill. Replace the whole set with `PUT`.

### Education

```json
{ "institution": "LUMS", "degree": "BS", "field": "Computer Science",
  "startYear": 2011, "endYear": 2015, "description": "Final year project on IR." }
```

`endYear` must not be earlier than `startYear`.

### Experience

```json
{ "companyName": "Acme", "title": "Engineer",
  "employmentType": "full_time", "location": "Remote",
  "startDate": "2020-02-01", "isCurrent": true, "description": "..." }
```

`employmentType` is one of `full_time`, `part_time`, `contract`, `internship`,
`freelance`, `volunteer`, `self_employed`. A current role (`isCurrent: true`)
must not have an `endDate`.

`company` and `jobTitle` are returned as well. They are generated columns derived
from `companyName` and `title`, so they cannot drift.

### Social links

```json
{ "platform": "linkedin", "url": "https://www.linkedin.com/in/example" }
```

`url` must be `http:` or `https:`. `javascript:`, `data:` and `file:` URLs are
rejected with `422`, which is what stops a stored XSS payload from reaching a
client that renders the link.

## Profile photo

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/profiles/me/photo` | `multipart/form-data`, field name `file` |
| `DELETE` | `/api/profiles/me/photo` | Removes the stored file |

```bash
curl -X POST http://localhost:4000/api/profiles/me/photo \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@avatar.png"
```

Accepted: JPEG, PNG, WebP and GIF, up to 2MB. Returns `201` with
`{ "profilePhoto": "/uploads/photos/...", "contentType": "image/png", "size": 1234 }`.

Three checks are applied, and all three must pass:

1. **Size** is within the 2MB limit.
2. **Content** is detected by magic bytes, not by the declared MIME type. A shell
   script renamed to `avatar.png` is rejected.
3. **Declared type and extension** must agree with what the bytes actually are.
   `avatar.php` is rejected even when the bytes are a genuine PNG.

The stored filename is generated from the user id, a timestamp and random bytes.
No part of the client's filename is used, so path traversal cannot occur. The
photo path is not served statically: `GET /uploads/...` returns `404` for
everyone, and reads are meant to go through an authorized route.

Object storage is not configured. The service is a driver interface
(`put`/`remove`/`read`) with a local filesystem implementation, so adding S3 later
is a driver change rather than a change to every call site.

## Verification

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/profiles/me/verification` | Submit for review; alumni only |
| `GET` | `/api/profiles/me/verification` | Full decision history |

`verification_status` is `PENDING`, `VERIFIED` or `REJECTED` in responses. It is
stored lowercase in the database, which is what migration 001 defined.

Submitting is idempotent: submitting an already-pending profile returns `200`
again and appends another `submitted` event. Only `404` (no alumni profile) and
`403` (not an alumnus) are possible failures. Rejecting without a `reason` is
`400`, and re-applying the status a profile already has is `409` — except for
submission, which is allowed to repeat.

Admin endpoints live in [the admin API](#admin-verification).

## Viewing someone else's profile

| Method | Path |
| --- | --- |
| `GET` | `/api/profiles/:userId` |
| `GET` | `/api/alumni/:userId` |
| `GET` | `/api/students/:userId` |
| `GET` | `/api/profiles/:userId/skills` |
| `GET` | `/api/profiles/skills?q=` | Global skill-name search |

The response is redacted on the server according to the owner's settings. A
withheld field is **absent from the response**, not present with a `null` value,
so you cannot distinguish "hidden" from "empty". See
[privacy](../backend/privacy.md).

A profile with `show_profile_in_directory` off returns `404`, not `403`, so the
endpoint does not confirm that the account exists. The owner, an `ADMIN` and a
`MODERATOR` always bypass directory visibility.

## Admin verification

These require the `ADMIN` role.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/alumni/pending` | Review queue; `limit`/`offset`/`search` |
| `GET` | `/api/admin/alumni/:userId` | Full detail for review |
| `PATCH` | `/api/admin/alumni/:userId/verify` | |
| `PATCH` | `/api/admin/alumni/:userId/reject` | `reason` is required |

```http
PATCH /api/admin/alumni/3f1b.../reject
{ "reason": "Graduation year could not be confirmed with the registry." }
```

Both decisions take the same row lock and write to
`alumni_verification_events`, so the queue and the audit history can never
disagree. Every decision is recorded with the reviewer, the timestamp, the
previous and new status, and a reason when one is required. Re-verifying an
already-verified profile is allowed and appends a new event rather than
overwriting the old one.