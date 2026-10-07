-- 014_donations_moderation_audit.sql
--
-- The final backend phase extends the module tables that 001 already created:
--   1. donations / payment_transactions / donation_receipts aligned to the
--      specification's field names and status vocabulary
--   2. reports moved to the specification's status vocabulary and review fields
--   3. audit_logs gains the specification's target_type / target_id / timestamp
--      names, exposed as generated aliases for the columns it already had
--   4. content_moderation, the generic ledger behind the admin HIDE/REMOVE actions
--
-- Every statement is safe to re-run, so a partially applied sequence can be
-- recovered by running this file again.

-- ---------------------------------------------------------------------------
-- Donations: specification field names and status vocabulary
-- ---------------------------------------------------------------------------

-- The specification calls the donor column userId; 001 called it donor_id.
ALTER TABLE donations RENAME COLUMN donor_id TO user_id;

-- The board index follows the column rename; give it the specification's name.
DROP INDEX IF EXISTS idx_donations_donor;
CREATE INDEX IF NOT EXISTS idx_donations_user_created
    ON donations (user_id, created_at DESC);

-- Lowercase legacy vocabulary becomes the specification's capitals.
ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_status_check;
UPDATE donations
   SET status = CASE status
                    WHEN 'pending' THEN 'PENDING'
                    WHEN 'completed' THEN 'SUCCESS'
                    WHEN 'failed' THEN 'FAILED'
                    WHEN 'refunded' THEN 'REFUNDED'
                    ELSE UPPER(status)
                END
 WHERE status NOT IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED');
ALTER TABLE donations ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE donations ADD CONSTRAINT donations_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'));

ALTER TABLE donations ADD COLUMN IF NOT EXISTS provider
    VARCHAR(30) NOT NULL DEFAULT 'stripe';
ALTER TABLE donations DROP CONSTRAINT IF EXISTS donations_provider_check;
ALTER TABLE donations ADD CONSTRAINT donations_provider_check
    CHECK (provider IN ('stripe', 'paypal'));

-- ---------------------------------------------------------------------------
-- Payment transactions: specification columns
-- ---------------------------------------------------------------------------

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
UPDATE payment_transactions
   SET status = CASE status
                    WHEN 'created' THEN 'PENDING'
                    WHEN 'pending' THEN 'PROCESSING'
                    WHEN 'succeeded' THEN 'SUCCESS'
                    WHEN 'failed' THEN 'FAILED'
                    WHEN 'refunded' THEN 'REFUNDED'
                    ELSE UPPER(status)
                END
 WHERE status NOT IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED');
ALTER TABLE payment_transactions ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE payment_transactions ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'));

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS transactions_provider_check;
ALTER TABLE payment_transactions ADD CONSTRAINT transactions_provider_check
    CHECK (provider IN ('stripe', 'paypal', 'manual'));

-- 001 stored the provider's id under the name provider_reference. The
-- specification calls it transactionId.
ALTER TABLE payment_transactions RENAME COLUMN provider_reference TO transaction_id;

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS user_id
    UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS provider_status VARCHAR(60);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS failure_code VARCHAR(120);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS event_id VARCHAR(190);
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- A payment provides two idempotency anchors beyond the client request key 001
-- already makes unique: the provider's payment id and the webhook's event id.
-- A webhook event replayed twice cannot create a second row, and a provider id
-- cannot belong to two rows. The partial WHERE keeps rows that have not reached
-- the provider from competing with each other.
DROP INDEX IF EXISTS idx_transactions_provider_ref;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_provider_txn
    ON payment_transactions (provider, transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_provider_event
    ON payment_transactions (provider, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user
    ON payment_transactions (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Receipts: specification fields, backfilled from the donation that owns them
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1001;

ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS currency
    VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS donor_user_id
    UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS donor_name VARCHAR(200);
ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS donor_email VARCHAR(255);
ALTER TABLE donation_receipts ADD COLUMN IF NOT EXISTS updated_at
    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Anything 001 had already issued inherits the numbers it was issued against.
-- 001's list of set_updated_at() tables did not include receipts, so the
-- trigger joins them late rather than being redeclared.
UPDATE donation_receipts r
   SET amount = d.amount,
       currency = d.currency,
       donor_user_id = d.user_id
  FROM donations d
 WHERE d.id = r.donation_id
   AND r.amount IS NULL;

ALTER TABLE donation_receipts ALTER COLUMN amount SET NOT NULL;
ALTER TABLE donation_receipts DROP CONSTRAINT IF EXISTS donation_receipts_amount_check;
ALTER TABLE donation_receipts ADD CONSTRAINT donation_receipts_amount_check
    CHECK (amount > 0);

CREATE INDEX IF NOT EXISTS idx_donation_receipts_user
    ON donation_receipts (donor_user_id, issued_at DESC);

CREATE TRIGGER trg_donation_receipts_updated_at BEFORE UPDATE ON donation_receipts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reports: specification vocabulary and review fields
-- ---------------------------------------------------------------------------

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
UPDATE reports
   SET status = CASE status
                    WHEN 'open' THEN 'PENDING'
                    WHEN 'reviewing' THEN 'UNDER_REVIEW'
                    WHEN 'resolved' THEN 'RESOLVED'
                    WHEN 'dismissed' THEN 'DISMISSED'
                    ELSE UPPER(status)
                END
 WHERE status NOT IN ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');
ALTER TABLE reports ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'));

-- The specification names the free-text field "description"; 001 called it
-- "details". The row migrates over, and the old columns are retired.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS description TEXT;
UPDATE reports SET description = details
 WHERE description IS NULL AND details IS NOT NULL;
ALTER TABLE reports DROP COLUMN IF EXISTS details;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by
    UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- reviewed_by replaces the resolved_by/resolved_at pair 001 carried, and the
-- resolution note has no specification home.
ALTER TABLE reports DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE reports DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE reports DROP COLUMN IF EXISTS resolution;

CREATE INDEX IF NOT EXISTS idx_reports_review_queue
    ON reports (status, created_at DESC) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- Audit log: the specification names for what 001 already stores
-- ---------------------------------------------------------------------------

-- entity_type/entity_id/created_at are the source columns the specification's
-- names are aliases of. Generated columns keep audit rows append-only: the data
-- the API exposes can never drift from the row, because only the sources exist.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type
    VARCHAR(80) GENERATED ALWAYS AS (entity_type) STORED;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id
    VARCHAR(64) GENERATED ALWAYS AS (entity_id) STORED;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "timestamp"
    TIMESTAMPTZ GENERATED ALWAYS AS (created_at) STORED;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
    ON audit_logs (action, created_at DESC);

-- ---------------------------------------------------------------------------
-- Content moderation ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_moderation (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(30) NOT NULL,
    target_id   UUID NOT NULL,
    state       VARCHAR(20) NOT NULL DEFAULT 'hidden',
    actor_id    UUID REFERENCES users (id) ON DELETE SET NULL,
    reason      VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT content_moderation_state_check
        CHECK (state IN ('hidden')),
    CONSTRAINT content_moderation_target_check
        CHECK (target_type IN ('job', 'event', 'message', 'company'))
);
-- Hiding is the only reversible moderation outcome, and one target has exactly
-- one current state. Deleting the row restores the content.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_moderation_target
    ON content_moderation (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_moderation_actor
    ON content_moderation (actor_id, created_at DESC);

CREATE TRIGGER trg_content_moderation_updated_at BEFORE UPDATE ON content_moderation
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();