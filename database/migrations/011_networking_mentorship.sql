-- 011_networking_mentorship.sql
-- Phase 3 hardening for connections and mentorship.
--
-- The three tables Phase 3 owns were created by 001 and widened by 003/005/007,
-- so this migration only closes the gaps the networking and mentorship rules
-- exposed. It is additive: no column is renamed or dropped, and every existing
-- row keeps its value.
--
-- Statuses stay lowercase in PostgreSQL and are uppercased in the API by the
-- service layer, which is the convention Phase 2 established for verification.

-- =========================================================
-- 1. A mentorship request can also reach COMPLETED
-- =========================================================
--
-- 001 allowed pending/accepted/rejected/cancelled, but a mentorship that runs
-- to completion leaves the request itself in 'accepted' forever, so the request
-- list cannot distinguish "still going" from "finished". Completing the
-- relationship now moves the request to 'completed' as well.

ALTER TABLE mentorship_requests
    DROP CONSTRAINT IF EXISTS mentorship_requests_status_check;

ALTER TABLE mentorship_requests
    ADD CONSTRAINT mentorship_requests_status_check CHECK (status IN
        ('pending', 'accepted', 'rejected', 'cancelled', 'completed'));

-- =========================================================
-- 2. Completing a mentorship has its own notification type
-- =========================================================
--
-- The constraint set in 005/007 has no 'mentorship_completed', because until now
-- a finished mentorship was indistinguishable from a live one. Completing one
-- writes that type, and an unlisted value is rejected by the CHECK, so the
-- statement and the whole transaction would fail.
--
-- 'mentorship_declined' is deliberately kept rather than replaced by
-- 'mentorship_rejected': it is already in the constraint, already stored in
-- existing rows, and already mapped by the client's notification badge styles.
-- Renaming it would rewrite history for no gain.

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN
        ('mentorship_request', 'mentorship_accepted', 'mentorship_declined',
         'mentorship_ended', 'mentorship_completed',
         'connection_request', 'connection_accepted',
         'new_message', 'message', 'profile_view',
         'job_posted', 'new_job_match', 'application_received',
         'application_status', 'job_application_update', 'job_moderated',
         'event_rsvp', 'event_reminder', 'event_cancelled',
         'donation_confirmation',
         'admin_notice', 'verification_result', 'system'));

-- =========================================================
-- 3. notifications is missing the column its own trigger writes
-- =========================================================
--
-- 001 attaches `trg_notifications_updated_at` to every table it lists, including
-- notifications, and set_updated_at() assigns NEW.updated_at. notifications never
-- got the column, so any UPDATE of a notification row raises
-- `record "new" has no field "updated_at"`. Marking one read is exactly such an
-- UPDATE, and so is the `ON DELETE SET NULL` that actor_id's foreign key performs
-- when a member who acted in a notification is deleted - which every connection
-- and mentorship notification now records. Adding the column is what makes the
-- existing trigger work; it is written for the existing rows.
--
-- The alternative, dropping the trigger, would leave the table as the only one
-- where a mutation leaves no timestamp at all, which is harder to notice later.

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =========================================================
-- 4. Only a verified alumnus may advertise mentorship
-- =========================================================
--
-- Mentorship eligibility was enforced in the service layer, which means a
-- direct UPDATE could leave an unverified alumnus advertising as a mentor, and
-- the rule needs to be a property of the data rather than of one caller.
--
-- This is an AFTER trigger rather than a CHECK constraint, and the reason is
-- specific. The profile service writes alumni profiles with
-- `INSERT ... ON CONFLICT (user_id) DO UPDATE`, and PostgreSQL validates CHECK
-- constraints against the candidate tuple *before* it resolves the conflict. That
-- candidate row carries verification_status at its column default ('pending')
-- while is_open_to_mentor comes from the caller, so a verified alumnus editing
-- their own profile would trip the check on a row that the UPDATE branch never
-- made unverified. CHECK constraints cannot be DEFERRABLE, so there is no way to
-- defer the test to the final state of the row.
--
-- An AFTER trigger is required, not merely preferred. A BEFORE INSERT trigger has
-- the same fault as the CHECK constraint, because it also fires on the candidate
-- tuple. An AFTER INSERT trigger fires only for a row that is really inserted and
-- an AFTER UPDATE trigger only for a row that is really updated, so on
-- `ON CONFLICT DO UPDATE` only the update path is checked, against the values that
-- persist.
--
-- The trigger only raises; it never rewrites the row. Raising rolls the
-- statement back, which is the intended outcome.

CREATE OR REPLACE FUNCTION alumni_mentor_listing_requires_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_open_to_mentor AND NEW.verification_status <> 'verified' THEN
        RAISE EXCEPTION
            'only a verified alumnus may advertise as a mentor'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'alumni_mentor_listing_requires_verification';
    END IF;
    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS alumni_mentor_listing_requires_verification ON alumni_profiles;

CREATE TRIGGER alumni_mentor_listing_requires_verification
    AFTER INSERT OR UPDATE OF is_open_to_mentor, verification_status
    ON alumni_profiles
    FOR EACH ROW
    EXECUTE FUNCTION alumni_mentor_listing_requires_verification();

-- =========================================================
-- 5. Indexes for the Phase 3 queries
-- =========================================================

-- The mentor discovery query filters on the listing flag AND the verification
-- state and orders by graduation year. idx_alumni_mentor as created by 001 keys
-- on the flag alone, so every advertising alumnus still had to be filtered by
-- verification_status one row at a time. Re-keying it keeps the same name and the
-- same partial predicate, so nothing that names the index has to change, and adds
-- graduation_year because that is the discovery query's ordering column.
DROP INDEX IF EXISTS idx_alumni_mentor;

CREATE INDEX idx_alumni_mentor
    ON alumni_profiles (verification_status, graduation_year DESC)
    WHERE is_open_to_mentor = TRUE;

-- The notification feed is read per user and often filtered by type, which the
-- existing (user_id, created_at DESC) index cannot serve: it still has to scan
-- every row for that user and filter the type afterwards.
CREATE INDEX IF NOT EXISTS idx_notifications_user_type
    ON notifications (user_id, type, created_at DESC);
-- A mentee's own list of requests is ordered by recency. idx_mentorship_req_mentee
-- covers filtering by status but not the plain "everything I asked for, newest
-- first" ordering that GET /api/mentorship/requests uses by default.
CREATE INDEX IF NOT EXISTS idx_mentorship_req_mentee_created
    ON mentorship_requests (mentee_id, created_at DESC);

-- The mentor inbox is a status filter over one mentor, newest first.
CREATE INDEX IF NOT EXISTS idx_mentorship_req_mentor_status_created
    ON mentorship_requests (mentor_id, status, created_at DESC);

-- Blocking rewrites an existing row so the blocker is always the requester, and
-- unblocking looks that row up by that exact pair. The partial index keeps this
-- off the general pair scan.
CREATE INDEX IF NOT EXISTS idx_connections_blocked_pair
    ON connections (requester_id, addressee_id) WHERE status = 'blocked';

-- A student's discovery screen lists relationships by state, and the capacity
-- check counts a mentor's live relationships.
CREATE INDEX IF NOT EXISTS idx_mentorship_rel_active_mentor
    ON mentorship_relationships (mentor_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_mentorship_rel_active_mentee
    ON mentorship_relationships (mentee_id) WHERE status = 'active';

-- =========================================================
-- 6. Comments recording the blocking convention
-- =========================================================
--
-- There is no separate blocks table: a block is a `connections` row with
-- status 'blocked' whose requester_id is always the blocker. That is what makes
-- "am I blocked, or did I block them?" answerable, and it is why blocking
-- rewrites requester_id and addressee_id rather than only flipping the status.
-- The blocked party must not learn they were blocked, so the API reports the
-- same 'blocked' state to both sides.

COMMENT ON COLUMN connections.status IS
    'pending | accepted | rejected | blocked. For a blocked row, requester_id is the blocker and addressee_id is the blocked user.';

COMMENT ON COLUMN mentorship_requests.status IS
    'pending | accepted | rejected | cancelled | completed. Reaches completed when the relationship is completed.';
