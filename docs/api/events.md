# Events API

An event is something with a day, a time and a place: a talk, a meetup, a
webinar. Events have a lifecycle rather than a boolean, and most of the rules
below exist because of that lifecycle.

Everything here requires a bearer token.

## The lifecycle

```
draft ──publish──▶ published ──complete──▶ completed
  │                   │
  └──delete──▶ cancelled ◀──cancel──┘
```

| Status | Meaning |
| --- | --- |
| `DRAFT` | Only the organizer can see it. RSVPs are refused. |
| `PUBLISHED` | Listed, open to RSVPs, and eligible for reminders. |
| `CANCELLED` | Withdrawn. Everybody who answered is told. |
| `COMPLETED` | The day has passed, or the organizer marked it done. |

The API returns statuses in upper case (`"PUBLISHED"`) and stores them in lower
case (`published`). Requests accept either, along with `"in-progress"` and
`"in progress"` as the old spelling of `published`, and `"removed"` as the old
spelling of `cancelled`.

Transitions are one-way. A cancelled event cannot be published again; a completed
one cannot be reopened. This is deliberate: the people who were told it was
cancelled have already been told.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/events` | bearer | Browse published events |
| `GET` | `/api/events/mine` | bearer | Events the caller organizes |
| `GET` | `/api/events/my-rsvps` | bearer | Events the caller has answered |
| `POST` | `/api/events` | bearer | Create a draft |
| `GET` | `/api/events/:id` | bearer | One event, shaped for this viewer |
| `PATCH` | `/api/events/:id` | organizer | Update |
| `DELETE` | `/api/events/:id` | organizer | Withdraw (cancels) |
| `POST` | `/api/events/:id/publish` | organizer | Draft → published |
| `POST` | `/api/events/:id/cancel` | organizer | With reason `{ reason? }` |
| `POST` | `/api/events/:id/complete` | organizer | Published → completed |
| `POST` | `/api/events/:id/rsvp` | bearer | Answer `{ status, guestCount?, note? }` |
| `DELETE` | `/api/events/:id/rsvp` | bearer | Withdraw an answer |
| `GET` | `/api/events/:id/rsvps` | bearer | Who answered |
| `GET` | `/api/events/:id/attendees` | organizer | The check-in roster |
| `POST` | `/api/events/:id/attendees` | organizer | Add somebody by hand |
| `PATCH` | `/api/events/:id/attendees/:userId` | organizer | Check in; body `{ checkedIn? }` |
| `PATCH` | `/api/events/:id/attendees/:userId/notes` | organizer | Private notes |
| `DELETE` | `/api/events/:id/attendees/:userId` | organizer | Remove from the roster |
| `GET` | `/api/events/:id/attendees/me` | bearer | The caller's own check-in state |

## Dates and times

The API takes and returns instants. Storage is a pair of columns — a `DATE` and a
`TIME` without a zone — which is what lets an event keep its calendar day if the
country changes its clocks.

- `startTime` and `endTime` are ISO 8601 instants and are required on create.
- `date` in a response is the calendar day, for clients that group by date.
- `timezone` is always `"UTC"`. A later phase can store a real zone.
- An event that runs past midnight has `endTime` on the following day. The
  constraint that enforces it is `events_time_order_check`, which compares the
  end against the start using `COALESCE(end_date, event_date)` so a row that
  forgot `end_date` is caught rather than stored.
- `rsvpDeadline` is an instant and must not be after the start.

## Capacity

`capacity` is the number of *people*, and it counts guests:

```
seatsUsed = SUM(guest_count + 1) over RSVPs with status 'going'
```

`seatsLeft` is `capacity - seatsUsed`, or `null` for an event with no capacity.
The count that decides whether there is room and the row that records the answer
are computed inside one transaction holding a lock on the event, so two people
taking the last place produce one acceptance and one refusal rather than two
acceptances for one seat.

## Answering

```
GOING       stored as going       takes a place, joins the attendee roster
INTERESTED  stored as interested   takes no place, is not reminded
NOT_GOING   stored as cancelled    takes no place
```

`INTERESTED` is "tell me if there is room" and is not a promise to attend, so it
is not reminded about the event. `guestCount` defaults to `0` and counts people
coming with the member, so a `guestCount` of `2` uses three places.

An RSVP is refused with `409` when the event is not published, when the deadline
has passed, or when there is no room left.

Changing an answer re-notifies nobody: the confirmation email is for the first
answer, and a member who has already confirmed does not need telling again.
Changing the stored deadline is validated against the stored start even when the
request does not mention either, because a move that silently invalidates the
deadline everybody agreed to is not the caller's intent.

## The event shape

```json
{
  "success": true,
  "data": {
    "id": "3c9d...",
    "title": "Alumni Winter Meetup",
    "description": "An evening of talks and introductions.",
    "date": "2026-02-14",
    "startTime": "2026-02-14T18:00:00.000Z",
    "endTime": "2026-02-14T21:00:00.000Z",
    "timezone": "UTC",
    "venue": "Engineering Hall",
    "virtualUrl": null,
    "isVirtual": false,
    "city": "Karachi",
    "capacity": 120,
    "rsvpDeadline": "2026-02-12T18:00:00.000Z",
    "status": "PUBLISHED",
    "publishedAt": "2026-01-20T09:00:00.000Z",
    "cancelledAt": null,
    "cancellation": null,
    "moderated": false,
    "organizer": { "id": "b1c2...", "name": "Grace Person", "avatarUrl": null },
    "rsvpCount": 84,
    "attendeeCount": 80,
    "seatsLeft": 36,
    "myRsvp": { "status": "GOING", "guestCount": 0, "createdAt": "..." },
    "isOrganizer": false
  }
}
```

`myRsvp`, `isOrganizer`, `rsvpCount`, `attendeeCount` and `seatsLeft` are
computed for the caller, so the same row serves the organizer's dashboard and a
visitor's event page.

An event must have somewhere to be: either `venue` or `virtualUrl`. Clearing
`venue` to `null` is a valid instruction rather than a malformed field, so the
check runs against the merged result and answers `400` when the update would
leave the event with no place at all.

## Reminders and completion

Two things happen on a timer rather than on a request. See
[background jobs](../backend/background-jobs.md) for how that is kept to once.

- Everybody who answered `GOING` is reminded on the morning of the day and the
  day before, if their preferences allow the `event_reminder` type.
- A `published` event whose day has passed becomes `completed`, and everybody who
  came is thanked.

Both carry a dedupe key of `event:<id>:reminder:<user>` and
`event:<id>:completed:<user>`, so an event that stays published for three days
still sends one reminder and one thank-you.

## Filtering

`GET /api/events` accepts:

| Parameter | Type | Notes |
| --- | --- | --- |
| `search` | string ≤120 | Title, description, venue, `ILIKE` |
| `city` / `region` / `country` | string ≤120 | Exact match |
| `status` | enum | Only meaningful for organizers; drafts are never listed publicly |
| `from` / `to` | `YYYY-MM-DD` | Inclusive day range |
| `page` | integer ≥1 | Default `1` |
| `limit` | integer 1–50 | Default `20` |