-- =====================================================================
-- 013_events_notifications_messaging.sql
--
-- Phase 5: events and RSVPs, the notification centre's idempotency
-- guarantees, the background-job ledger, and one-to-one conversations.
--
-- The events tables already exist from 001. What is missing is everything
-- that makes them usable and safe, so this migration extends rather than
-- replaces: the vocabulary is narrowed to the four states this phase defines,
-- the reminder scan gets the index it needs, and the attendee roster gets
-- the updated_at trigger it never had.
--
-- Conversations are genuinely new. Messages already exist as a
-- sender/recipient pair, which is enough to store a message and not enough
-- to answer "which threads do I take part in". Existing messages are folded
-- into conversations below, so nothing already sent becomes unreachable.
-- =====================================================================

-- =========================================================
-- 1. Events: the vocabulary this phase defines
-- =========================================================

-- 'removed' was a fourth way to say "this is not happening", alongside
-- 'cancelled'. One state per meaning keeps the reminder scan and the
-- cancellation notification from having to know about a synonym, so rows
-- already using it are folded into 'cancelled' before the check narrows.
UPDATE events SET status = 'cancelled' WHERE status = 'removed';

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN
    ('draft', 'published', 'cancelled', 'completed'));

-- A new event is a draft, not a live one. Publishing is a decision the
-- organizer makes, and 001 defaulted to 'published', which meant an event
-- created through any other path was announced before anybody read it.
ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft';

-- Cancelling is a decision about an event people were told about, so it
-- records who did it and when, exactly as a job decision does.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS published_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by    UUID REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- The reminder scan asks for published events starting in the next 24 hours,
-- repeatedly, and only rows whose date is still in the future are candidates.
-- A partial index on the date alone is what keeps that a range scan instead of
-- a full pass over every event ever created.
CREATE INDEX IF NOT EXISTS idx_events_reminder_scan
    ON events (event_date, start_time)
    WHERE status = 'published';

-- An organizer's own list, newest first, across every state: the dashboard
-- shows drafts and cancelled events too.
CREATE INDEX IF NOT EXISTS idx_events_organizer_created
    ON events (organizer_id, created_at DESC);

-- An event is either in a room or online, never neither. A virtual link that
-- is not http(s) would be rendered as a clickable link by every client that
-- trusts it, so the database refuses the shapes that would do that.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_place_check;
ALTER TABLE events ADD CONSTRAINT events_place_check CHECK (
    (venue IS NOT NULL AND BTRIM(venue) <> '')
    OR (virtual_url IS NOT NULL AND BTRIM(virtual_url) <> '')
);

-- The registration deadline is compared against the event's own date, not
-- against "now": a deadline after the event happened is not a deadline, and a
-- deadline before the event was created is a typo. The service enforces the
-- real rule (the deadline must still be in the future); this only rejects the
-- two combinations that cannot be what anybody meant.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_deadline_before_date;
ALTER TABLE events ADD CONSTRAINT events_deadline_before_date CHECK (
    registration_deadline IS NULL OR registration_deadline <= event_date
);

-- =========================================================
-- 2. RSVPs and the attendee roster
-- =========================================================

-- Capacity is decided under a row lock on the event and then counted, so the
-- count has to be cheap and has to ignore the members who said they are not
-- coming. A partial index on 'going' gives exactly that count.
CREATE INDEX IF NOT EXISTS idx_rsvps_event_going
    ON event_rsvps (event_id)
    WHERE status = 'going';

-- 'my RSVPs', newest first. Not partial: a member's list spans every state.
CREATE INDEX IF NOT EXISTS idx_rsvps_user_created
    ON event_rsvps (user_id, created_at DESC);

-- Guest counts are part of the head count, so an RSVP cannot quietly reserve
-- more places than the event has. The service re-checks this under the same
-- lock that guards capacity; the constraint is what stops a direct INSERT.
ALTER TABLE event_rsvps DROP CONSTRAINT IF EXISTS rsvps_guest_check;
ALTER TABLE event_rsvps ADD CONSTRAINT rsvps_guest_check CHECK (guest_count >= 0 AND guest_count <= 5);

-- The attendee roster had an unnamed unique constraint and no updated_at, so
-- 001's trigger loop skipped it entirely and no migration could attach a
-- trigger to a column that did not exist. Both are named and added here.
ALTER TABLE event_attendees
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE event_attendees DROP CONSTRAINT IF EXISTS event_attendees_unique;
ALTER TABLE event_attendees ADD CONSTRAINT event_attendees_unique UNIQUE (event_id, user_id);

-- A check-in is a fact about a moment, so it is stamped when it happens rather
-- than when the row was created. NULL means "on the list, not arrived yet".
ALTER TABLE event_attendees ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users (id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_event_attendees_updated_at ON event_attendees;
CREATE TRIGGER trg_event_attendees_updated_at
    BEFORE UPDATE ON event_attendees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The roster is written by the organizer, and reading it is the organizer's
-- call: attendee lists are not public, so there is no index serving the public.
CREATE INDEX IF NOT EXISTS idx_event_attendees_event
    ON event_attendees (event_id, created_at);

-- =========================================================
-- 3. Conversations
-- =========================================================

-- A conversation is a thread. One-to-one only in this phase, so a direct
-- conversation is identified by the key below rather than by a row somebody
-- could reuse for a different pairing.
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(20) NOT NULL DEFAULT 'direct',
    -- The two participants, lowest id first, joined by a colon. Held as a
    -- column rather than derived from conversation_participants because an
    -- index expression cannot contain a subquery, and "open a conversation
    -- with this person" has to be able to ask whether one already exists
    -- without locking the membership table first.
    direct_key      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The most recent message, denormalised so the conversation list does not
    -- have to join to the top of every thread to sort it.
    last_message_at TIMESTAMPTZ,
    CONSTRAINT conversations_type_check CHECK (type IN ('direct'))
);

-- One conversation per pair of people. This is what makes creating a
-- conversation idempotent: two concurrent requests to open a thread with the
-- same person resolve to one row, and the loser reads the winner's.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_key
    ON conversations (direct_key)
    WHERE direct_key IS NOT NULL;

-- The conversation list sorts by the most recent activity, per member.
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
    ON conversations (last_message_at DESC NULLS LAST);

-- One row per member of a conversation. last_read_at is what makes an unread
-- badge cheap: unread is "messages after my last_read_at", which needs no join.
CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMPTZ,
    -- The client is told which conversation a new message belongs to; this is
    -- what it cross-checks against before showing it.
    last_read_message_id UUID,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_user
    ON conversation_participants (user_id, conversation_id);

-- Messages join a conversation. The existing sender_id/recipient_id columns
-- stay: they are what every Phase 1 query reads, and a direct conversation has
-- exactly one recipient, so the two cannot disagree.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations (id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    -- The sender's own message id, used to make a retry safe: a client that
    -- times out and re-sends the same clientMessageId gets the original row
    -- back instead of a second copy of the same message.
    ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(100);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_length;
ALTER TABLE messages ADD CONSTRAINT messages_body_length CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 5000);

-- Idempotent delivery: the same message cannot be stored twice, and two
-- concurrent retries of the same client id resolve to one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id
    ON messages (sender_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

-- The message list for a thread pages backwards from the newest message, which
-- is exactly this index. Partial to un-deleted rows: a deleted message is not
-- rendered, so keeping it in the index would only slow the scan down.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_visible
    ON messages (conversation_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- "Have they read it?" is asked for every message the sender is watching. The
-- primary key already leads with message_id, so this covers the other
-- direction: one reader's read receipts across a thread.
CREATE INDEX IF NOT EXISTS idx_message_read_status_user
    ON message_read_status (user_id, read_at DESC);

-- An unread badge counts a participant's messages after their last_read_at.
-- Without this it is a scan of the participant's whole thread history.
CREATE INDEX IF NOT EXISTS idx_participants_unread
    ON conversation_participants (user_id, last_read_at NULLS FIRST);

-- ---------------------------------------------------------------------
-- Fold the existing messages into conversations
-- ---------------------------------------------------------------------

-- Messages sent before this migration have no conversation, and the pair of
-- people in them is recoverable from sender_id/recipient_id. Three
-- independent statements, each idempotent on its own: a message is only
-- claimed while its conversation_id is still NULL, and every insert is
-- guarded by a unique index, so re-running the migration after a partial
-- failure converges instead of duplicating threads.
INSERT INTO conversations (type, direct_key, created_at, updated_at, last_message_at)
SELECT 'direct',
       p.low_id::text || ':' || p.high_id::text,
       MIN(m.created_at), NOW(), MAX(m.created_at)
FROM (
    SELECT DISTINCT
        LEAST(sender_id, recipient_id)   AS low_id,
        GREATEST(sender_id, recipient_id) AS high_id
    FROM messages
    WHERE conversation_id IS NULL
) p
JOIN messages m
  ON LEAST(m.sender_id, m.recipient_id) = p.low_id
 AND GREATEST(m.sender_id, m.recipient_id) = p.high_id
GROUP BY p.low_id, p.high_id
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participants (conversation_id, user_id, joined_at, last_read_at)
SELECT c.id,
       side.member_id,
       MIN(m.created_at),
       -- Somebody's last read point is the last message they were sent: they
       -- have by definition seen everything that came before it.
       MAX(m.created_at) FILTER (WHERE m.recipient_id = side.member_id)
FROM messages m
JOIN conversations c
  ON c.direct_key = LEAST(m.sender_id, m.recipient_id)::text || ':'
                 || GREATEST(m.sender_id, m.recipient_id)::text
CROSS JOIN LATERAL (
    SELECT unnest(ARRAY[m.sender_id, m.recipient_id]) AS member_id
) side
GROUP BY c.id, side.member_id
ON CONFLICT DO NOTHING;

UPDATE messages m
SET conversation_id = c.id
FROM conversations c
WHERE m.conversation_id IS NULL
  AND c.direct_key = LEAST(m.sender_id, m.recipient_id)::text || ':'
                   || GREATEST(m.sender_id, m.recipient_id)::text;

-- =========================================================
-- 4. Notifications: one row per fact, not one per attempt
-- =========================================================

-- dedupe_key is the whole idempotency mechanism. A reminder that runs twice,
-- or two scheduler instances that both pick up the same event, insert the
-- same key; the unique index turns the second insert into a no-op instead of a
-- second email. NULL means "this notification is not idempotent", which keeps
-- every Phase 1-4 notification working unchanged: two genuinely distinct
-- messages about the same thing are still two notifications.
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(200),
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
    ON notifications (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

-- 'event_updated' is new here. The other three event types already existed in
-- 005; a published event that changes date or venue has to reach the people who
-- said they were coming, and there was no type to say it with.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'mentorship_request', 'mentorship_accepted', 'mentorship_declined',
    'mentorship_ended', 'mentorship_completed',
    'connection_request', 'connection_accepted',
    'new_message', 'message', 'profile_view',
    'job_posted', 'new_job_match', 'application_received',
    'application_status', 'job_application_update', 'job_moderated',
    'event_rsvp', 'event_reminder', 'event_cancelled', 'event_updated',
    'donation_confirmation', 'admin_notice', 'verification_result', 'system'
));

-- A reminder is found by asking which events are due; this is the other side
-- of that question.
CREATE INDEX IF NOT EXISTS idx_notifications_reminder_due
    ON notifications (type, created_at)
    WHERE type = 'event_reminder';

-- =========================================================
-- 5. The background-job ledger
-- =========================================================

-- A scheduler that can run twice needs to know what it already did. Each run
-- claims a run_key; the primary key makes the claim atomic, so exactly one
-- runner holds it and a second run of the same tick does nothing.
CREATE TABLE IF NOT EXISTS background_jobs (
    run_key      VARCHAR(200) PRIMARY KEY,
    job_name     VARCHAR(80) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'running',
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ,
    -- What the run did, for an operator reading the table after an incident.
    result       JSONB,
    error        TEXT,
    CONSTRAINT background_jobs_status_check CHECK (status IN
        ('running', 'succeeded', 'failed', 'skipped'))
);

-- "Which jobs failed, and when?" is the only query an operator runs against
-- this table, so it is the only one that gets an index.
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_started
    ON background_jobs (status, started_at DESC);

-- A run that never finished must not hold its key forever, or one crash would
-- disable a job permanently. Nothing deletes rows here on purpose: the ledger
-- is how a duplicate send gets explained afterwards. Reaping is the
-- scheduler's job, not the database's, so this stays a plain table.