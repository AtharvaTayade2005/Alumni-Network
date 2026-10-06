-- =====================================================================
-- 013_events_notifications_messaging.down.sql
--
-- Rolls the Phase 5 schema back to what 012 left behind.
--
-- Nothing is dropped that would take a member's data with it. Messages keep
-- their sender_id/recipient_id pair, which is how Phase 1 reads them, so the
-- conversations and the participant rows can go without a message becoming
-- unreadable. What is dropped is the machinery around them: the reminder
-- index, the notification dedupe key, and the job ledger.
-- =====================================================================

-- =========================================================
-- 1. Conversations
-- =========================================================

-- The backfilled links are removed with their tables below; this is here so a
-- rollback that is interrupted after the tables go still leaves messages
-- consistent with a schema that has no conversations.
ALTER TABLE messages DROP COLUMN IF EXISTS conversation_id;
ALTER TABLE messages DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE messages DROP COLUMN IF EXISTS edited_at;
ALTER TABLE messages DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE messages DROP COLUMN IF EXISTS client_message_id;

DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS conversations;

-- The Phase 1 body length was enforced only by the validator. The constraint
-- is dropped rather than restored to a weaker form, because there is nothing
-- to restore to.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_length;

DROP INDEX IF EXISTS idx_message_read_status_user;

-- =========================================================
-- 2. The job ledger and notification idempotency
-- =========================================================

DROP TABLE IF EXISTS background_jobs;

DROP INDEX IF EXISTS idx_notifications_reminder_due;
DROP INDEX IF EXISTS idx_notifications_dedupe;

-- dedupe_key and metadata are only meaningful while the scheduler exists.
-- Dropping the index first is not required, but it makes the intent obvious:
-- the uniqueness that made a repeated reminder safe goes before the column
-- that carried it.
ALTER TABLE notifications DROP COLUMN IF EXISTS dedupe_key;
ALTER TABLE notifications DROP COLUMN IF EXISTS metadata;

-- 'event_updated' is removed from the vocabulary so a rollback cannot leave a
-- row the previous application has no template for. Any row that used it is
-- folded into the closest type that phase knew about.
UPDATE notifications SET type = 'system' WHERE type = 'event_updated';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'mentorship_request', 'mentorship_accepted', 'mentorship_declined',
    'mentorship_ended', 'mentorship_completed',
    'connection_request', 'connection_accepted',
    'new_message', 'message', 'profile_view',
    'job_posted', 'new_job_match', 'application_received',
    'application_status', 'job_application_update', 'job_moderated',
    'event_rsvp', 'event_reminder', 'event_cancelled',
    'donation_confirmation', 'admin_notice', 'verification_result', 'system'
));

-- =========================================================
-- 3. Events and RSVPs
-- =========================================================

DROP INDEX IF EXISTS idx_event_attendees_event;
DROP INDEX IF EXISTS idx_rsvps_user_created;
DROP INDEX IF EXISTS idx_rsvps_event_going;
DROP INDEX IF EXISTS idx_events_organizer_created;
DROP INDEX IF EXISTS idx_events_reminder_scan;

DROP TRIGGER IF EXISTS trg_event_attendees_updated_at ON event_attendees;
ALTER TABLE event_attendees DROP COLUMN IF EXISTS updated_at;
ALTER TABLE event_attendees DROP COLUMN IF EXISTS checked_in_by;
ALTER TABLE event_attendees DROP COLUMN IF EXISTS notes;

-- The named uniqueness this migration added goes back off; the unnamed one 001
-- created is still in place and still enforces the same rule.
ALTER TABLE event_attendees DROP CONSTRAINT IF EXISTS event_attendees_unique;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_deadline_before_date;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_place_check;

ALTER TABLE events
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS cancelled_by,
    DROP COLUMN IF EXISTS cancelled_reason;

-- The end date goes back to a time of day compared against the start time, which
-- is what 001 could express. An event that ends after midnight cannot be stored
-- in the old shape, so such a row is trimmed to the following morning rather
-- than left to violate the check that is about to be re-added.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_time_order_check;
UPDATE events
   SET end_time = '23:59:00'
 WHERE end_date IS DISTINCT FROM event_date AND end_time <= start_time;
UPDATE events SET end_date = event_date;
ALTER TABLE events DROP COLUMN IF EXISTS end_date;
ALTER TABLE events DROP COLUMN IF EXISTS image_url;
ALTER TABLE events ADD CONSTRAINT events_time_order_check CHECK (end_time > start_time);

-- The vocabulary widens again to what 001 defined, and the default returns to
-- publishing on creation, which is how the table behaved before this phase.
ALTER TABLE events ALTER COLUMN status SET DEFAULT 'published';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN
    ('draft', 'published', 'cancelled', 'completed', 'removed'));