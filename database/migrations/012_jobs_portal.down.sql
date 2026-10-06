-- 012_jobs_portal.down.sql
-- Returns the jobs table to the vocabulary and the shape migration 012 replaced.
--
-- Jobs that only exist because of the review workflow are the interesting case:
-- 'pending_review' has no equivalent in the old vocabulary, so it is published,
-- and 'rejected' becomes 'removed'. Neither is reversible information loss that
-- matters, because the moderation decision itself is preserved in the audit log.
--
-- Resume metadata is dropped, but the stored bytes are left on the storage
-- driver's disk: a rollback is a schema operation, not a file deletion, and the
-- files may still be reachable through an older job_applications row.

-- The triggers go first. Both of them enforce rules for the *new* vocabulary, so
-- leaving them in place while rows are mapped back to the old names would either
-- block the mapping or apply the new rules to states the old schema knows nothing
-- about.
DROP TRIGGER IF EXISTS trg_application_review_is_attributed ON job_applications;
DROP FUNCTION IF EXISTS application_review_is_attributed();

DROP TRIGGER IF EXISTS trg_job_status_requires_moderation ON jobs;
DROP FUNCTION IF EXISTS job_status_requires_moderation();
DROP TRIGGER IF EXISTS trg_job_poster_may_post ON jobs;
DROP FUNCTION IF EXISTS job_poster_may_post();

-- Applications that carry a reviewer must give up that attribution before the
-- column that stores it can go, and their reviewed states have no reviewer to
-- attribute them to once the trigger is gone.
UPDATE job_applications
SET reviewed_by = NULL, reviewed_at = NULL, status = 'submitted'
WHERE status IN ('under_review', 'shortlisted', 'accepted', 'rejected');

-- An application whose only attachment was an uploaded file has no resume_url, and
-- the constraint this migration reinstates cannot see resume_file_id. Rewriting the
-- reference as the authenticated path that actually served those bytes keeps the
-- row intact and keeps pointing at something that works, rather than deleting an
-- applicant or inventing a public URL.
UPDATE job_applications
SET resume_url = '/api/files/' || resume_file_id::text || '/download'
WHERE resume_file_id IS NOT NULL AND resume_url IS NULL AND external_url IS NULL;

-- Same reasoning for a profile resume, which the older code reads from resume_url.
UPDATE student_profiles
SET resume_url = '/api/files/' || resume_file_id::text || '/download',
    resume_filename = COALESCE(resume_filename, 'document')
WHERE resume_file_id IS NOT NULL;

DROP INDEX IF EXISTS idx_student_profiles_resume_file;
ALTER TABLE student_profiles DROP COLUMN IF EXISTS resume_file_id;

ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE job_applications ADD CONSTRAINT applications_status_check CHECK (status IN
    ('submitted', 'under_review', 'shortlisted', 'rejected', 'accepted', 'withdrawn'));

ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS applications_has_attachment;
ALTER TABLE job_applications ADD CONSTRAINT applications_has_attachment CHECK (
    resume_url IS NOT NULL OR external_url IS NOT NULL
);

ALTER TABLE job_applications
    DROP COLUMN IF EXISTS resume_file_id,
    DROP COLUMN IF EXISTS status_note,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by;

DROP INDEX IF EXISTS idx_saved_jobs_job;
DROP INDEX IF EXISTS idx_saved_jobs_user_created;
DROP INDEX IF EXISTS idx_applications_resume_file;
DROP INDEX IF EXISTS idx_applications_applicant_status;
DROP INDEX IF EXISTS idx_applications_job_status;

DROP INDEX IF EXISTS idx_jobs_review_queue;
DROP INDEX IF EXISTS idx_jobs_poster_created;
DROP INDEX IF EXISTS idx_jobs_published_salary;
DROP INDEX IF EXISTS idx_jobs_published_company_id;
DROP INDEX IF EXISTS idx_jobs_published_company;
DROP INDEX IF EXISTS idx_jobs_published_industry;
DROP INDEX IF EXISTS idx_jobs_published_location;
DROP INDEX IF EXISTS idx_jobs_published_experience;
DROP INDEX IF EXISTS idx_jobs_published_employment;
DROP INDEX IF EXISTS idx_jobs_published_work_mode;
DROP INDEX IF EXISTS idx_jobs_published_deadline;

-- The status constraint is dropped before the mapping rather than after it: the
-- names being written back to ('active', 'removed') are not in the Phase 4
-- vocabulary, so the constraint would reject the very rows it is about to be
-- replaced for. A window with no check exists for these statements only.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Back to the old vocabulary. The order matters: a posting still in review is
-- published first, and only then is everything published mapped back to 'active',
-- so the two statements cannot undo each other.
UPDATE jobs SET status = 'published' WHERE status = 'pending_review';
UPDATE jobs SET status = 'removed'   WHERE status = 'rejected';
UPDATE jobs SET status = 'active'    WHERE status = 'draft';
UPDATE jobs SET status = 'active'    WHERE status = 'published';

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN
    ('draft', 'active', 'closed', 'hidden', 'removed'));

ALTER TABLE jobs
    DROP COLUMN IF EXISTS industry,
    DROP COLUMN IF EXISTS moderated_at,
    DROP COLUMN IF EXISTS moderated_by,
    DROP COLUMN IF EXISTS published_at;

-- Rebuild the partial indexes this migration replaced, against the state name the
-- old vocabulary used.
CREATE INDEX IF NOT EXISTS idx_jobs_deadline
    ON jobs (deadline) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_work_mode
    ON jobs (work_mode) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_employment_type
    ON jobs (employment_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_experience_level
    ON jobs (experience_level) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_jobs_company
    ON jobs (company_id) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_stored_files_updated_at ON stored_files;
DROP TABLE IF EXISTS stored_files;
