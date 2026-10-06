-- 014_donations_moderation_audit.down.sql
--
-- Reverts the final phase. Donation and moderation payments are part of the
-- 001 schema, so they are untangled back to the 001 column sets rather than
-- dropped. content_moderation, whose records exist only because of 014, is
-- removed outright.

DROP TABLE IF EXISTS content_moderation;

-- donations back to 001: donor_id, provider gone, and the lowercase lifecycle.
ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_status_check;
ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_provider_check;
UPDATE donations
   SET status = CASE status
                    WHEN 'PENDING' THEN 'pending'
                    WHEN 'PROCESSING' THEN 'pending'
                    WHEN 'SUCCESS' THEN 'completed'
                    WHEN 'FAILED' THEN 'failed'
                    WHEN 'REFUNDED' THEN 'refunded'
                    ELSE LOWER(status)
                END;
ALTER TABLE donations ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE donations ADD CONSTRAINT donations_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));
ALTER TABLE donations DROP COLUMN IF EXISTS provider;
DROP INDEX IF EXISTS idx_donations_user_created;
CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations (user_id, created_at DESC);
ALTER TABLE donations RENAME COLUMN user_id TO donor_id;

-- payment_transactions back to 001.
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS transactions_provider_check;
UPDATE payment_transactions
   SET status = CASE status
                    WHEN 'PENDING' THEN 'pending'
                    WHEN 'PROCESSING' THEN 'pending'
                    WHEN 'SUCCESS' THEN 'succeeded'
                    WHEN 'FAILED' THEN 'failed'
                    WHEN 'REFUNDED' THEN 'refunded'
                    ELSE LOWER(status)
                END;
ALTER TABLE payment_transactions ALTER COLUMN status SET DEFAULT 'created';
ALTER TABLE payment_transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'refunded'));
ALTER TABLE payment_transactions ADD CONSTRAINT transactions_provider_check
    CHECK (provider IN ('stripe', 'paypal', 'manual'));
ALTER TABLE payment_transactions RENAME COLUMN transaction_id TO provider_reference;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS user_id;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS provider_status;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS failure_code;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS event_id;
ALTER TABLE payment_transactions DROP COLUMN IF EXISTS metadata;
DROP INDEX IF EXISTS idx_payment_transactions_user;
DROP INDEX IF EXISTS uq_payment_transactions_provider_txn;
DROP INDEX IF EXISTS uq_payment_transactions_provider_event;
CREATE INDEX IF NOT EXISTS idx_transactions_provider_ref
    ON payment_transactions (provider, provider_reference);

-- donation_receipts back to 001.
ALTER TABLE donation_receipts DROP CONSTRAINT IF EXISTS donation_receipts_amount_check;
DROP INDEX IF EXISTS idx_donation_receipts_user;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS amount;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS currency;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS donor_user_id;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS donor_name;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS donor_email;
ALTER TABLE donation_receipts DROP COLUMN IF EXISTS updated_at;
DROP TRIGGER IF EXISTS trg_donation_receipts_updated_at ON donation_receipts;

-- reports back to 001.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
UPDATE reports
   SET status = CASE status
                    WHEN 'PENDING' THEN 'open'
                    WHEN 'UNDER_REVIEW' THEN 'reviewing'
                    WHEN 'RESOLVED' THEN 'resolved'
                    WHEN 'DISMISSED' THEN 'dismissed'
                    ELSE 'open'
                END;
ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed'));
ALTER TABLE reports DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE reports DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS details TEXT;
UPDATE reports SET details = description
 WHERE details IS NULL AND description IS NOT NULL;
ALTER TABLE reports DROP COLUMN IF EXISTS description;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by
    UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_reports_review_queue;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS "timestamp";
ALTER TABLE audit_logs DROP COLUMN IF EXISTS target_type;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS target_id;
DROP INDEX IF EXISTS idx_audit_logs_action_created;