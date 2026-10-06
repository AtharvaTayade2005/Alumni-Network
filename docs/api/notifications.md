# Notifications API

A notification is something that happened to one person: a request they have to
answer, an answer they were waiting for, an event that is tomorrow. Nothing here
is addressed to anybody else — every route is scoped to the caller.

Everything requires a bearer token.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/notifications` | bearer | The caller's feed, newest first |
| `GET` | `/api/notifications/unread-count` | bearer | `{ unread }` |
| `POST` | `/api/notifications/read-all` | bearer | Mark everything read |
| `PATCH` | `/api/notifications/read-all` | bearer | Alias of the above |
| `PATCH` | `/api/notifications/:id/read` | bearer | Mark one read |
| `DELETE` | `/api/notifications/:id` | bearer | Remove one |
| `GET` | `/api/notifications/preferences` | bearer | Current preferences |
| `PATCH` | `/api/notifications/preferences` | bearer | Update preferences |
| `PUT` | `/api/notifications/preferences` | bearer | Alias of the above |

`POST` is the original spelling of `read-all` and `PATCH` is the one that follows
the convention the rest of the API uses. They are the same action, so they share
one handler rather than growing separate behaviour that can drift.

## The feed

| Parameter | Type | Notes |
| --- | --- | --- |
| `page` | integer ≥1 | Default `1` |
| `limit` | integer 1–100 | Default `20` |
| `offset` | integer ≥0 | Default `0` |
| `unreadOnly` | boolean | Default `false` |
| `type` | notification type | Exact match |

```json
{
  "success": true,
  "data": [
    {
      "id": "8f21...",
      "type": "event_reminder",
      "title": "Reminder: Alumni Winter Meetup is tomorrow",
      "body": "Saturday 14 February at Engineering Hall",
      "link": "/events/3c9d...",
      "actorId": null,
      "isRead": false,
      "metadata": { "eventId": "3c9d...", "kind": "reminder" },
      "createdAt": "2026-02-13T08:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "unread": 1 }
}
```

`metadata` is whatever the creating flow attached, so a client can act on a
notification without parsing `link`. `link` is still there and still valid for a
human; `metadata` is what code should branch on.

## Preferences

```json
{
  "userId": "b1c2...",
  "emailEnabled": true,
  "inAppEnabled": true,
  "mutedTypes": ["connection_request"],
  "createdAt": "...",
  "updatedAt": "..."
}
```

A member with no preferences row defaults to in-app on and email off, and reading
`GET /preferences` creates the row. Each field is optional on update: an absent
field is left alone, so a client can flip one switch without resending the rest.

`mutedTypes` is checked against the same vocabulary the database constraint
allows (`src/constants/notificationTypes.js`), and an unknown type is refused with
`422`. Muting a type that does not exist looks like it worked and then never does
anything, which is worse than being told.

A muted type suppresses **both** the in-app row and the email — nothing is
stored, so it does not appear in the feed either. This is checked inside
`notificationService.notify()`, before the insert, so a muted type never lands in
the table and never has to be filtered out of a query.

## Idempotency

`notificationService.notify()` takes an optional `dedupeKey`. When one is given,
the insert is `ON CONFLICT (dedupe_key) DO NOTHING` against a partial unique
index, and the caller is told it stored nothing. A notification with no key is
written every time, which is what every Phase 1–4 notification wants: two
genuinely distinct things that happen to read alike are still two notifications.

Scheduled notifications always pass a key:

| Key | Used by |
| --- | --- |
| `event:<id>:reminder:<user>` | The day-before and day-of reminder |
| `event:<id>:completed:<user>` | The completion thank-you |
| `event:<id>:rsvp:<user>` | The RSVP confirmation |
| `event:<id>:published:<rsvp>` | "An event you were watching is open" |
| `event:<id>:cancelled:<user>` | The cancellation |
| `event:<id>:updated:<n>:<user>` | One notice per saved change |

The reminder key is per person per event rather than per day, so an event that
stays published for three days cannot send three reminders. See
[background jobs](../backend/background-jobs.md) for the second layer that stops
two processes sending the same one at all.

## Types

| Group | Types |
| --- | --- |
| Networking | `connection_request`, `connection_accepted` |
| Mentorship | `mentorship_request`, `mentorship_accepted`, `mentorship_declined`, `mentorship_ended`, `mentorship_completed` |
| Events | `event_rsvp`, `event_reminder`, `event_cancelled`, `event_updated` |
| Messages | `new_message`, `message` |
| Directory | `profile_view` |
| Careers | `job_posted`, `new_job_match`, `application_received`, `application_status`, `job_application_update`, `job_moderated` |
| System | `admin_notice`, `verification_result`, `system` |

An unknown type still creates an in-app notification and simply sends no email,
so a new type can be added without holding up the release that introduces it.

## Email

Email is opt-in per member and per type. When it is on, the mail is rendered by
`src/services/templates.js` and written to `email_queue` in the same call that
writes the in-app row, so the two cannot disagree.

A notification from the scheduler has no actor to credit — an event that ended
because its day passed was not cancelled by anybody — so `actorId` is `null` and
the copy is written to work without one.