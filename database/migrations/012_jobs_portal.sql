-- 012_jobs_portal.sql
-- Phase 4: the job portal's status vocabulary, its moderation invariants and the
-- metadata for resume files.
--
-- The jobs and applications tables arrived with the initial schema carrying the
-- vocabulary of an earlier draft of the specification: jobs were 'active',
-- 'hidden' or 'removed', and there was no review step. This migration replaces
-- that with the agreed workflow
--
--     draft -> pending_review -> published -> closed
--                          \-> rejected
--
-- and records who decided what. Rows are migrated rather than dropped, because a
-- live board may already have postings, applications and saved rows pointing at
-- them.

-- =========================================================
-- 1. Job status vocabulary
-- =========================================================

-- Decisions are recorded per status change. moderated_by is what makes the
-- moderation trail auditable, and moderation_note carries the reason a posting
-- was turned down.
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS moderated_by     UUID REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderated_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS industry         VARCHAR(120);

-- The industry is also denormalised onto the posting. Companies can be renamed or
-- merged, and the board filter must not change meaning underneath a member
-- because of it.
UPDATE jobs j
SET industry = c.industry
FROM companies c
WHERE c.id = j.company_id
  AND (j.industry IS NULL OR j.industry = '')
  AND c.industry IS NOT NULL;

-- The status constraint is dropped before the rows are renamed rather than after:
-- 'pending_review' and 'rejected' are not in the old vocabulary, so the old check
-- would reject exactly the rows it is about to be replaced for. A window with no
-- check exists for these statements only, and the constraint is restored below
-- before anything else in the file runs.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- 'active' was the live state and is now 'published'. 'hidden' and 'removed' were
-- both "a moderator took this down" and both collapse into 'rejected', which is
-- the only terminal non-published state this phase defines.
UPDATE jobs SET status = 'published' WHERE status = 'active';
UPDATE jobs SET status = 'rejected' WHERE status IN ('hidden', 'removed');

-- A posting that was live is recorded as having been published, dated from the
-- moment it stopped being a draft rather than from today.
UPDATE jobs
SET published_at = COALESCE(published_at, updated_at)
WHERE status = 'published' AND published_at IS NULL;

-- Anything that is not published must not claim a publication date, otherwise a
-- re-submitted posting would still look live to anything reading the column.
UPDATE jobs SET published_at = NULL WHERE status <> 'published';

-- A posting that is live must say who approved it. Rows migrated from the old
-- vocabulary cannot know that, so no attribution is invented for them here; the
-- trigger below only demands it when a posting actually changes state, which a
-- migrated row does not.
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN
    ('draft', 'pending_review', 'published', 'closed', 'rejected'));

-- =========================================================
-- 2. Moderation and eligibility guards
-- =========================================================

CREATE OR REPLACE FUNCTION job_poster_may_post()
RETURNS TRIGGER AS $$
DECLARE
    poster_is_student   BOOLEAN;
    poster_is_employer  BOOLEAN;
BEGIN
    -- A student account may never own a posting. This is the rule that keeps the
    -- internship portal honest: internships are posted by employers, and a
    -- student must not be able to publish one.
    SELECT
        COALESCE(bool_or(LOWER(r.name) = 'student'), FALSE),
        COALESCE(bool_or(LOWER(r.name) IN ('alumni', 'moderator', 'admin')), FALSE)
    INTO poster_is_student, poster_is_employer
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.posted_by;

    IF poster_is_student AND NOT poster_is_employer THEN
        RAISE EXCEPTION 'a student account cannot post a job'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_poster_may_post ON jobs;
CREATE TRIGGER trg_job_poster_may_post
    BEFORE INSERT OR UPDATE OF posted_by ON jobs
    FOR EACH ROW EXECUTE FUNCTION job_poster_may_post();

CREATE OR REPLACE FUNCTION job_status_requires_moderation()
RETURNS TRIGGER AS $$
DECLARE
    moderator_may_decide BOOLEAN;
BEGIN
    -- An edit that leaves the state and the moderation trail exactly as they were
    -- is a content edit, and must not be forced to re-attribute a posting that was
    -- migrated from the older schema and never had an attribution to begin with.
    -- Touching any of these three is a decision, and is checked.
    IF TG_OP = 'UPDATE'
       AND OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.moderated_by IS NOT DISTINCT FROM NEW.moderated_by
       AND OLD.moderated_at IS NOT DISTINCT FROM NEW.moderated_at THEN
        RETURN NEW;
    END IF;

    IF NEW.status IN ('draft', 'pending_review') THEN
        -- Not live, so nothing may claim it went live. The moderation columns are
        -- deliberately left alone: a posting that was rejected and resubmitted
        -- keeps the record of the earlier decision.
        NEW.published_at = NULL;
        RETURN NEW;
    END IF;

    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at = NOW();
    END IF;

    -- 'published' and 'rejected' are both outcomes of a review, so both need an
    -- author. Without this a poster could promote their own draft to 'published'
    -- with a single statement and the review step would be decorative.
    IF NEW.moderated_by IS NULL OR NEW.moderated_at IS NULL THEN
        RAISE EXCEPTION 'moving a job to % requires the moderator who decided it',
            NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(bool_or(LOWER(r.name) IN ('moderator', 'admin')), FALSE)
    INTO moderator_may_decide
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = NEW.moderated_by;

    IF NOT moderator_may_decide THEN
        RAISE EXCEPTION 'only a moderator or admin may decide a job review'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'rejected' THEN
        NEW.published_at = NULL;
    END IF;

    -- 'closed' keeps everything: it was published, and the trail showing how it got
    -- there is still the answer to "why did this disappear from the board?".
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_status_requires_moderation ON jobs;
CREATE TRIGGER trg_job_status_requires_moderation
    -- The trigger watches the moderation columns as well as the status: the
    -- invariant is "a posting in a reviewed state names the moderator who decided
    -- it", so rewriting that attribution alone must be checked too.
    BEFORE INSERT OR UPDATE OF status, moderated_by, moderated_at ON jobs
    FOR EACH ROW EXECUTE FUNCTION job_status_requires_moderation();

-- =========================================================
-- 3. File storage metadata
-- =========================================================

-- One row per stored file. The bytes live in the storage driver; this table holds
-- only what is needed to serve them safely: who owns the file, what it is called
-- on the way out, and the key it is stored under.
--
-- storage_key is generated by the server and is the only value that ever reaches
-- a driver. original_filename is kept for display only and is never used to build
-- a path.
CREATE TABLE IF NOT EXISTS stored_files (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind               VARCHAR(20) NOT NULL DEFAULT 'resume',
    storage_driver     VARCHAR(30) NOT NULL DEFAULT 'local',
    storage_key        VARCHAR(255) NOT NULL,
    original_filename  VARCHAR(255) NOT NULL,
    content_type       VARCHAR(120) NOT NULL,
    byte_size          INTEGER NOT NULL,
    checksum_sha256    CHAR(64) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stored_files_kind_check CHECK (kind IN ('resume', 'attachment')),
    CONSTRAINT stored_files_size_check CHECK (byte_size > 0),
    CONSTRAINT stored_files_key_unique UNIQUE (storage_key),
    -- Defence in depth for the display name. It is never used to build a path, but
    -- it is echoed back in download headers, so it must not be able to carry a
    -- separator or a parent-directory reference into one. Written with strpos
    -- rather than LIKE so no escape-character handling is involved, and
    -- chr(92) for the backslash so the check cannot be broken by string escaping.
    CONSTRAINT stored_files_filename_safe CHECK (
        LENGTH(original_filename) > 0
        AND STRPOS(original_filename, '/') = 0
        AND STRPOS(original_filename, CHR(92)) = 0
        AND STRPOS(original_filename, '..') = 0
    )
);

CREATE INDEX IF NOT EXISTS idx_stored_files_owner_kind
    ON stored_files (owner_id, kind, created_at DESC);

-- =========================================================
-- 4. Applications reference an uploaded resume
-- =========================================================

-- An application may point at a file the applicant uploaded through this API
-- rather than at a URL they typed. The owner's own uploads are the only ones
-- accepted; the service checks that, and the foreign key keeps the row valid.
ALTER TABLE job_applications
    ADD COLUMN IF NOT EXISTS resume_file_id UUID REFERENCES stored_files (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status_note    TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by    UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS applications_has_attachment;
ALTER TABLE job_applications ADD CONSTRAINT applications_has_attachment CHECK (
    resume_file_id IS NOT NULL OR resume_url IS NOT NULL OR external_url IS NOT NULL
);

-- The Phase 4 pipeline is submitted -> under review -> shortlisted -> accepted or
-- rejected, with 'withdrawn' kept from migration 006 for the applicant stepping
-- away. The spelling is repeated in full so this constraint states the whole
-- vocabulary rather than a delta.
ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE job_applications ADD CONSTRAINT applications_status_check CHECK (status IN
    ('submitted', 'under_review', 'shortlisted', 'rejected', 'accepted', 'withdrawn'));

-- The legacy profile endpoint stores a student's resume on their profile. It used
-- to write a URL into student_profiles.resume_url that nothing ever served, so the
-- file id is recorded instead and the resume_url column is left for display.
ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS resume_file_id UUID REFERENCES stored_files (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_profiles_resume_file
    ON student_profiles (resume_file_id)
    WHERE resume_file_id IS NOT NULL;

-- A review must record who reviewed and when, for the same reason a job decision
-- must. Only the states a reviewer actually moves an application into are covered.
CREATE OR REPLACE FUNCTION application_review_is_attributed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('under_review', 'shortlisted', 'accepted', 'rejected') THEN
        -- The applicant may only ever create a 'submitted' application, so every
        -- one of these states is a decision somebody made and it has to name them.
        IF NEW.reviewed_by IS NULL THEN
            RAISE EXCEPTION 'an application moved to % must record who reviewed it',
                NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.reviewed_at IS NULL THEN
            NEW.reviewed_at = NOW();
        END IF;
    ELSE
        NEW.reviewed_by = NULL;
        NEW.reviewed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_application_review_is_attributed ON job_applications;
CREATE TRIGGER trg_application_review_is_attributed
    BEFORE INSERT OR UPDATE OF status ON job_applications
    FOR EACH ROW EXECUTE FUNCTION application_review_is_attributed();

-- =========================================================
-- 5. Indexes for the board's queries
-- =========================================================

-- The board always reads published rows, so every supporting index is partial on
-- that state. The earlier indexes from 006 and 007 were built the same way but
-- against the vocabulary this migration replaces, which left them matching
-- nothing; they are recreated here against 'published'.
DROP INDEX IF EXISTS idx_jobs_work_mode;
DROP INDEX IF EXISTS idx_jobs_employment_type;
DROP INDEX IF EXISTS idx_jobs_experience_level;
DROP INDEX IF EXISTS idx_jobs_deadline;
DROP INDEX IF EXISTS idx_jobs_company;

CREATE INDEX IF NOT EXISTS idx_jobs_published_deadline
    ON jobs (deadline)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_work_mode
    ON jobs (work_mode, created_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_employment
    ON jobs (employment_type, created_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_experience
    ON jobs (experience_level, created_at DESC)
    WHERE status = 'published';

-- Filtering by location and industry compares lowercased text so that "Lahore"
-- and "lahore" select the same rows regardless of how they were typed.
CREATE INDEX IF NOT EXISTS idx_jobs_published_location
    ON jobs (LOWER(location))
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_industry
    ON jobs (LOWER(industry))
    WHERE status = 'published';

-- Company and creator are matched by name and by id respectively. Sorting the
-- board by salary needs the column in the index because the sort is on a
-- nullable value.
CREATE INDEX IF NOT EXISTS idx_jobs_published_company
    ON jobs (LOWER(company_name))
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_company_id
    ON jobs (company_id)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_jobs_published_salary
    ON jobs (salary_max DESC NULLS LAST)
    WHERE status = 'published';

-- "My postings" and the moderation queue both read a single creator's rows across
-- every state, so this index is deliberately not partial.
CREATE INDEX IF NOT EXISTS idx_jobs_poster_created
    ON jobs (posted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_review_queue
    ON jobs (status, created_at)
    WHERE status = 'pending_review';

-- =========================================================
-- 6. Application and saved-job indexes
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_applications_job_status
    ON job_applications (job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_status
    ON job_applications (applicant_id, status, created_at DESC);
-- "Has this file already been attached to an application?" is asked on every
-- upload replacement and every delete, so it gets its own index rather than
-- relying on the unique constraint's leading column.
CREATE INDEX IF NOT EXISTS idx_applications_resume_file
    ON job_applications (resume_file_id)
    WHERE resume_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_created
    ON saved_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job
    ON saved_jobs (job_id);

-- =========================================================
-- 7. updated_at for the new table
-- =========================================================

DROP TRIGGER IF EXISTS trg_stored_files_updated_at ON stored_files;
CREATE TRIGGER trg_stored_files_updated_at BEFORE UPDATE ON stored_files
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
