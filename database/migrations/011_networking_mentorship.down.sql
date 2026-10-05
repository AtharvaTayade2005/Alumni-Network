-- 011_networking_mentorship.down.sql
-- Reverses 011_networking_mentorship.sql.
--
-- The widened status constraint has to go back to the 001 list, so any request
-- left in 'completed' is folded back to 'accepted' first: 'completed' only ever
-- meant "the relationship finished", and 'accepted' is the closest state the
-- previous schema can express. The same applies to the 'mentorship_completed'
-- notification type, folded back to 'mentorship_ended' below.

UPDATE mentorship_requests SET status = 'accepted' WHERE status = 'completed';

ALTER TABLE mentorship_requests
    DROP CONSTRAINT IF EXISTS mentorship_requests_status_check;

ALTER TABLE mentorship_requests
    ADD CONSTRAINT mentorship_requests_status_check CHECK (status IN
        ('pending', 'accepted', 'rejected', 'cancelled'));

DROP TRIGGER IF EXISTS alumni_mentor_listing_requires_verification ON alumni_profiles;
DROP FUNCTION IF EXISTS alumni_mentor_listing_requires_verification();

-- 'mentorship_completed' has no pre-011 equivalent either, and the constraint
-- cannot be restored while such a row exists, so the notifications are folded
-- back to 'mentorship_ended' first. Both describe a finished mentorship, and
-- 'mentorship_ended' is the older type every earlier consumer already renders.
UPDATE notifications SET type = 'mentorship_ended' WHERE type = 'mentorship_completed';

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check CHECK (type IN
        ('mentorship_request', 'mentorship_accepted', 'mentorship_declined',
         'mentorship_ended',
         'connection_request', 'connection_accepted',
         'new_message', 'message', 'profile_view',
         'job_posted', 'new_job_match', 'application_received',
         'application_status', 'job_application_update', 'job_moderated',
         'event_rsvp', 'event_reminder', 'event_cancelled',
         'donation_confirmation',
         'admin_notice', 'verification_result', 'system'));

DROP INDEX IF EXISTS idx_notifications_user_type;
DROP INDEX IF EXISTS idx_mentorship_req_mentee_created;
DROP INDEX IF EXISTS idx_mentorship_req_mentor_status_created;
DROP INDEX IF EXISTS idx_connections_blocked_pair;
DROP INDEX IF EXISTS idx_mentorship_rel_active_mentor;
DROP INDEX IF EXISTS idx_mentorship_rel_active_mentee;

-- Restore the pre-011 mentor index exactly as 001 created it.
DROP INDEX IF EXISTS idx_alumni_mentor;
CREATE INDEX idx_alumni_mentor ON alumni_profiles (is_open_to_mentor)
    WHERE is_open_to_mentor = TRUE;

-- notifications never had an updated_at column while 001 attaches a trigger that
-- writes one, so removing the column puts the table back into the state where any
-- UPDATE of a notification row fails.
ALTER TABLE notifications DROP COLUMN IF EXISTS updated_at;

-- The column comments added by 011 have no pre-011 equivalent to restore.
COMMENT ON COLUMN connections.status IS NULL;
COMMENT ON COLUMN mentorship_requests.status IS NULL;
