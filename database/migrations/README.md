# Database Migrations

Plain SQL migrations applied in filename order. Each file has a matching
`.down.sql` from `008` onwards.

| File | Description |
| --- | --- |
| `001_initial_schema.sql` | Core tables, foreign keys and indexes for all planned modules. |
| `002_user_presence.sql` | Last-seen tracking on user profiles. |
| `003_connection_pair_symmetry.sql` | Keeps both sides of a connection consistent. |
| `004_student_verification_notes.sql` | Reviewer notes for student verification. |
| `005_community_notification_types.sql` | Mentorship and job notification types plus their indexes. |
| `006_job_posting_integrity.sql` | Company de-duplication, unique company names, withdrawn applications, job indexes. |
| `007_mentorship_job_notifications.sql` | Re-states the 005 notification types and indexes for databases that had already applied 005. |
| `008_user_account_status.sql` | Suspension and deactivation, with the checks the rest of the API relies on. |
| `009_phase2_profiles.sql` | Profiles, skills, privacy settings, verification history, file metadata. |
| `010_directory_trigram.sql` | Trigram indexes for directory and message search. |
| `011_networking_mentorship.sql` | Connection requests and mentorship lifecycle. |
| `012_jobs_portal.sql` | Job postings, companies, applications, saved postings. |
| `013_events_notifications_messaging.sql` | Conversations and their participants, read state on a participant row, the message backfill, notification dedupe keys and metadata, the background-job ledger, and the extra columns the event lifecycle needs (`published_at`, `cancelled_*`, `end_date`, check-in and notes). |

## Applying migrations

Migrations are plain SQL applied in filename order. Every file is written to be
safe to re-run, so a partially applied sequence can be recovered by running the
remaining files again.

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_user_presence.sql
# ... and so on through 013
```

To roll back the most recent change:

```bash
psql "$DATABASE_URL" -f database/migrations/013_events_notifications_messaging.down.sql
```

The integration suite applies the whole directory to a fresh in-memory database
on every run, which is the quickest way to check a new migration.
`npm run verify:migrations` in `server/` goes further: it checks that the
constraints, indexes and partial unique indexes the application depends on actually
exist, and that every `.down.sql` reverses its own `.sql`.

## Notes on `013_events_notifications_messaging.sql`

The one migration in this set with a backfill, so it is worth knowing why it is
written the way it is. `events`, `event_rsvps`, `event_attendees` and
`message_read_status` already exist from `001`; this file adds the columns the
lifecycle needs and creates the messaging and scheduling tables alongside them.

**Conversations are derived, not invented.** The pair of people in every existing
message becomes a `direct` conversation, keyed by `direct_key` — both user ids,
lowest first — with one participant row each. Messages before this migration
therefore appear in `/api/conversations` like any other message. `direct_key`
carries a partial unique index (`WHERE direct_key IS NOT NULL`) because it is the
idempotency mechanism for opening a thread: two clients racing produce one
conversation, and the loser reads the winner's row.

**The legacy message routes keep working.** `messages.conversation_id` is added as
a nullable column with `ON DELETE CASCADE`, alongside `delivered_at`, `edited_at`,
`deleted_at` and `client_message_id`. Null means "no conversation yet" — a Phase 1
send to somebody who has never spoken has no thread, and inventing one would
create a conversation for a pair who have not exchanged anything. The unique index
on `(sender_id, client_message_id)` is what makes a retried send return the
original row instead of a second copy.

**Unread is a cursor, not a count.** `conversation_participants.last_read_at` and
`last_read_message_id` mean unread is "messages after it", which is an indexed
comparison rather than a join across the whole history. `message_read_status` is
kept for the Phase 1 delivered/read ticks.

**A date without a time zone.** Events store `event_date`, `start_time`, `end_time`
and `end_date` as separate columns rather than one timestamptz. An event keeps its
calendar day if the country changes its clocks, and the API converts to instants
for the client. `events_time_order_check` compares the end against the start using
`COALESCE(end_date, event_date)` so a row that forgot `end_date` is caught rather
than stored.

**Notifications can be idempotent.** `dedupe_key` is unique only where it is not
null, so a scheduled notification is written once however many times its job runs
while every Phase 1–4 notification is still written every time — two genuinely
distinct things that read alike are still two notifications. `metadata` carries
the ids a client needs to act on a notification without parsing its link.

**The job ledger.** `background_jobs.run_key` is the primary key, which is the
whole idempotency mechanism for scheduled work: claiming a window is an insert, and
an insert that loses a race is a no-op rather than a second run. `attempts` counts
takeovers after a stale window, so a retried run is visible rather than silent. See
[../../docs/backend/background-jobs.md](../../docs/backend/background-jobs.md).

**Statuses are lowercase, once.** `events.status` and `event_rsvps.status` store
lower case and the API returns upper case; the API accepts the old spellings
(`in-progress`, `removed`) and translates them. The old `removed` event status is
mapped to `cancelled` here rather than being carried into the new lifecycle.

## Seeds

`database/seeds/` is reserved for local development fixtures. No production or
fake production data is committed to this repository.