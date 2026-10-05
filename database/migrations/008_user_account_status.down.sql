-- 008_user_account_status.sql (down)
-- Removes the full_name / account_status projection. The booleans it was
-- derived from are untouched, so no account data is lost.

DROP INDEX IF EXISTS idx_users_account_status;

DROP TRIGGER IF EXISTS trg_users_account_status ON users;
DROP FUNCTION IF EXISTS sync_user_account_status();

ALTER TABLE users DROP COLUMN IF EXISTS account_status;
ALTER TABLE users DROP COLUMN IF EXISTS full_name;

DROP TYPE IF EXISTS account_status;