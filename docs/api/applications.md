# Applications — `/api/applications`

Applying to a posting, and the review pipeline that follows.

Postings, moderation and search: [jobs.md](jobs.md).
Resumes: [file-storage.md](../backend/file-storage.md).

---

## Conventions

- Every endpoint requires a bearer token.
- Statuses are lowercase in the database and uppercase in the API. Requests accept
  lower case, dashes and spaces, so `under-review`, `UNDER REVIEW` and
  `UNDER_REVIEW` are the same instruction.

### Application statuses

| API status | Meaning |
| --- | --- |
| `SUBMITTED` | Sent, waiting to be read |
| `UNDER_REVIEW` | The poster is looking at it |
| `SHORTLISTED` | On the shortlist |
| `ACCEPTED` | Offer made |
| `REJECTED` | Not successful |
| `WITHDRAWN` | Withdrawn by the applicant |

---

## Endpoints

An applicant addresses their own application by application id:

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | bearer | The caller's applications, filterable |
| GET | `/:applicationId` | participant | One application |
| PATCH | `/:applicationId/withdraw` | applicant | Withdraw |

The poster's side of the same feature lives on the posting:

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/jobs/:jobId/applications` | poster | Applications received, filterable |
| POST | `/api/jobs/:jobId/applications` | bearer | Apply |
| PATCH | `/api/jobs/:jobId/applications/:applicationId` | poster | Review |
| GET | `/api/jobs/applications` | bearer | The caller's applications, same as above |
| PATCH | `/api/jobs/applications/:applicationId` | poster | Review |
| PATCH | `/api/jobs/applications/:applicationId/withdraw` | applicant | Withdraw |

The recruiter's paths nest under the posting because a reviewer works through an
inbox of applications for one posting. The applicant's paths do not nest, because
they follow their own history across postings — which is also why they are
mounted separately instead of three levels deeper. Both spellings run the same
handlers, so a client written against either contract is answered.

---

## Applying

```http
POST /api/jobs/:jobId/applications
{ "coverLetter": "Please read my CV.", "resumeFileId": "…" }
```

One of `resumeFileId`, `resumeUrl` or `externalUrl` is required, and the
validator names the missing one rather than refusing the request with a generic
message:

- `resumeFileId` — a file uploaded through
  [`/api/files`](README.md#files--apifiles). The applicant must own it.
- `resumeUrl` — a link the applicant typed, for resumes kept elsewhere.
- `externalUrl` — where to apply when the posting names an external system.

Link fields must be `http(s)` or site-relative.

Rules:

- Only `published` postings accept applications; anything else, or one whose
  deadline has passed, is `400`.
- The applicant may not apply to their own posting (`400`).
- One application per member per posting — a second attempt is `409`. A withdrawn
  application does not free the slot, so the history stays honest.
- A student, alumni or staff account may all apply.
- `resumeFileId` naming somebody else's file is `422`, not `404`: the applicant
  knows which file they picked, and the answer is that they may not use it.

```json
{
  "success": true,
  "data": {
    "id": "…", "jobId": "…", "status": "SUBMITTED",
    "resume": { "id": "…", "filename": "cv.pdf",
                "downloadPath": "/api/files/…/download" },
    "createdAt": "2026-02-01T09:15:00.000Z"
  }
}
```

`downloadPath` grants nothing on its own. Reading it re-checks permission and
answers `404` to anybody else, so the path tells the applicant where to ask
without telling a stranger that the resume exists.

---

## Who can see an application

| Viewer | Sees |
| --- | --- |
| The applicant | Their own application, including their own email |
| The poster of the posting | Every application on their posting |
| Moderator, admin | Any application, for moderation |

Everybody else gets `404`. Reading an application as the poster includes the
applicant's email address, because that is what a recruiter has to reply to; a
viewer who is none of the above gets the name and headline only.

---

## Reviewing

```http
PATCH /api/applications/:applicationId/status
{ "status": "SHORTLISTED", "note": "Available for an interview next week" }
```

The reviewer is the poster of the posting or staff; an applicant reviewing their
own application is refused (`403`), and so is any other member.

`status` must be one of the six states above. `note` is shown to the applicant.
Re-sending the state an application is already in returns it unchanged rather
than failing, so a double-click on "shortlist" is harmless.

Moving to `under_review`, `shortlisted`, `accepted` or `rejected` stamps
`reviewed_by` and `reviewed_at` and notifies the applicant. Moving back to
`submitted` or `withdrawn` is not a review and stamps nothing.

A withdrawn application is final: reviewing one is `409`, and the poster cannot
revive it.

**The review is also enforced in the database.** Moving an application to
`shortlisted`, `accepted` or `rejected` requires `reviewed_by` to be named — a
status change with nobody attributed to it is refused rather than silently
recorded as unowned.

---

## Withdrawing

```http
PATCH /api/applications/:applicationId/withdraw
```

The applicant may withdraw their own application, and nobody else may withdraw it
on their behalf. A member with no part in the application gets `403`; a stranger
who has not seen it gets `404`.

Withdrawal is not reversible: a second attempt is `409`. The application row is
kept rather than deleted, because the poster's history and the applicant's record
both refer to it, and because a posting keeps a count of how many people applied.

The `PATCH` verb is deliberate — withdrawing changes the state of a resource that
stays readable. `POST` is not accepted.

Withdrawal is recorded in the audit log but sends no notification: the poster is
told by the application disappearing from their review queue, and a notification
naming a withdrawal would be news the applicant did not ask for.

---

## Notifications

| Event | Type | Recipient |
| --- | --- | --- |
| Application submitted | `application_received` | Poster, by email |
| Application reviewed | `application_status` | Applicant, by email |

Both are written inside the same transaction as the change, so a rollback cannot
leave a notice about something that did not happen.
