-- 008_user_account_status.sql
-- Alumni Network Portal - explicit account lifecycle vocabulary (SRS 4.1, 4.4)
--
-- Adds the two fields the authentication surface is specified against:
--
--   full_name       single display name for the account
--   account_status  ACTIVE | INACTIVE | SUSPENDED | PENDING_VERIFICATION
--
-- The is_active / is_suspended / is_email_verified booleans predate this
-- migration and are still read and written directly by code that landed in
-- earlier phases. Rewriting every one of those call sites in a schema migration
-- would couple this change to modules outside the authentication phase, so the
-- booleans stay the stored detail and account_status is maintained from them.
--
-- The trigger below is deliberately one-directional: it derives account_status
-- from the booleans and never writes back. A single direction means the two
-- representations cannot drift apart, and any later UPDATE that flips
-- is_active or is_suspended - including the existing admin service - moves
-- account_status with it automatically.

CREATE TYPE account_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'PENDING_VERIFICATION'
);

ALTER TABLE users ADD COLUMN full_name VARCHAR(200);
ALTER TABLE users ADD COLUMN account_status account_status;

-- Backfill existing accounts. Suspension is reported ahead of deactivation
-- because it is the more restrictive state, and an unverified account is only
-- pending once it is otherwise usable.
UPDATE users
SET full_name = BTRIM(first_name || ' ' || last_name);

UPDATE users
SET account_status = CASE
    WHEN is_suspended                    THEN 'SUSPENDED'::account_status
    WHEN NOT is_active                   THEN 'INACTIVE'::account_status
    WHEN NOT is_email_verified           THEN 'PENDING_VERIFICATION'::account_status
    ELSE 'ACTIVE'::account_status
END;

ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN account_status SET NOT NULL;

-- A newly inserted account has not verified its address yet. The trigger sets
-- this on every INSERT as well, so the default only matters for rows written by
-- tooling that bypasses the application.
ALTER TABLE users ALTER COLUMN account_status
    SET DEFAULT 'PENDING_VERIFICATION'::account_status;

CREATE OR REPLACE FUNCTION sync_user_account_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.full_name := BTRIM(NEW.first_name || ' ' || NEW.last_name);

    NEW.account_status := CASE
        WHEN NEW.is_suspended          THEN 'SUSPENDED'::account_status
        WHEN NOT NEW.is_active         THEN 'INACTIVE'::account_status
        WHEN NOT NEW.is_email_verified THEN 'PENDING_VERIFICATION'::account_status
        ELSE 'ACTIVE'::account_status
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_account_status
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION sync_user_account_status();

-- Supports the admin filters that select on lifecycle state directly.
CREATE INDEX idx_users_account_status ON users (account_status);