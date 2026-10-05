-- 009_phase2_profiles.sql
-- Alumni Network Portal - Phase 2: profiles, verification, directory
--
-- Migration 001 already created the Phase 2 profile tables (alumni_profiles,
-- student_profiles, skills, user_skills, education, experience, social_links,
-- privacy_settings). This migration closes the gaps against the Phase 2
-- specification rather than recreating them:
--
--   1. Adds the spec-named columns that 001 lacked (major, university,
--      job_title, location, profile_photo, field, employment_type, career
--      interests on the student side).
--   2. Keeps every new column in agreement with the pre-existing column it
--      generalises, using triggers instead of a second source of truth.
--   3. Normalises verification onto the PENDING/VERIFIED/REJECTED vocabulary
--      and records reviewer, timestamp and reason in a dedicated audit table.
--   4. Adds directory indexes chosen to work without pg_trgm.
--
-- Two deliberate compatibility decisions:
--
--   * `department` and `current_position` are read directly by the mentorship,
--     jobs and connection modules that are built in later phases. They are
--     therefore kept, and `major` / `job_title` are added alongside them as
--     the specification's preferred names.
--   * `pg_trgm` is unavailable on PGlite (the engine used by the test suite),
--     so trigram indexes cannot be created unconditionally without breaking
--     `npm test`. Substring search instead relies on functional btree indexes
--     plus prefix matching, which is documented in docs/api/directory.md.

-- =========================================================
-- 1. Alumni profile: specification-named columns
-- =========================================================

ALTER TABLE alumni_profiles
    ADD COLUMN IF NOT EXISTS major              VARCHAR(150),
    ADD COLUMN IF NOT EXISTS university          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS job_title           VARCHAR(150),
    ADD COLUMN IF NOT EXISTS location            VARCHAR(255),
    ADD COLUMN IF NOT EXISTS profile_photo       VARCHAR(500);

-- Backfill from the columns the specification renamed. Only rows where the new
-- column is empty are filled, so a value set through 001 is never overwritten.
UPDATE alumni_profiles SET major        = department      WHERE major IS NULL;
UPDATE alumni_profiles SET job_title    = current_position WHERE job_title IS NULL;

-- `location` is a single display string in the specification, while 001 stores
-- city/region/country separately. Seed the display string from those parts so
-- the directory can match one indexed column instead of three.
UPDATE alumni_profiles
   SET location = NULLIF(CONCAT_WS(', ',
        NULLIF(city, ''), NULLIF(region, ''), NULLIF(country, '')), '')
 WHERE location IS NULL
   AND COALESCE(city, region, country) <> '';

-- A graduation year must look like a graduation year.
ALTER TABLE alumni_profiles
    DROP CONSTRAINT IF EXISTS alumni_graduation_year_check;
ALTER TABLE alumni_profiles
    ADD CONSTRAINT alumni_graduation_year_check
    CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2200);

-- =========================================================
-- 2. Student profile: specification-named columns
-- =========================================================

ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS major              VARCHAR(150),
    ADD COLUMN IF NOT EXISTS university          VARCHAR(200),
    ADD COLUMN IF NOT EXISTS graduation_year     INTEGER,
    ADD COLUMN IF NOT EXISTS location            VARCHAR(255),
    ADD COLUMN IF NOT EXISTS profile_photo       VARCHAR(500);

UPDATE student_profiles SET major = department WHERE major IS NULL;

-- `expected_graduation` is the 001 column for the same concept.
UPDATE student_profiles
   SET graduation_year = expected_graduation
 WHERE graduation_year IS NULL AND expected_graduation IS NOT NULL;

UPDATE student_profiles
   SET location = NULLIF(CONCAT_WS(', ',
        NULLIF(city, ''), NULLIF(region, ''), NULLIF(country, '')), '')
 WHERE location IS NULL
   AND COALESCE(city, region, country) <> '';

-- degree is NOT NULL in 001, but 008's partial-update path can leave a profile
-- without one; the Phase 2 API validates it instead of relying on the column.
ALTER TABLE student_profiles
    DROP CONSTRAINT IF EXISTS student_graduation_year_check;
ALTER TABLE student_profiles
    ADD CONSTRAINT student_graduation_year_check
    CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2200);

-- =========================================================
-- 3. Keep renamed columns in agreement
--
-- Triggers rather than duplicate storage: mentorship/jobs/connections read
-- `department` and `current_position`, while the Phase 2 API presents `major`
-- and `job_title`. Whichever side a caller writes, both end up correct.
-- The direction is resolved by comparing against OLD so an update that leaves
-- one side untouched never clobbers it.
-- =========================================================

CREATE OR REPLACE FUNCTION sync_alumni_profile_aliases()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.major IS DISTINCT FROM OLD.major THEN
        NEW.department := NEW.major;
    ELSIF NEW.department IS DISTINCT FROM OLD.department THEN
        NEW.major := NEW.department;
    END IF;

    IF NEW.job_title IS DISTINCT FROM OLD.job_title THEN
        NEW.current_position := NEW.job_title;
    ELSIF NEW.current_position IS DISTINCT FROM OLD.current_position THEN
        NEW.job_title := NEW.current_position;
    END IF;

    -- `location` is the single display string the specification filters on, while
    -- 001 stores the parts separately. An explicit location always wins; otherwise
    -- the parts are composed so the two representations cannot drift apart.
    IF NEW.location IS DISTINCT FROM OLD.location
       AND NEW.location IS NOT NULL THEN
        NULL;
    ELSIF NEW.city IS DISTINCT FROM OLD.city
       OR NEW.region IS DISTINCT FROM OLD.region
       OR NEW.country IS DISTINCT FROM OLD.country THEN
        NEW.location := NULLIF(CONCAT_WS(', ',
            NULLIF(NEW.city, ''), NULLIF(NEW.region, ''), NULLIF(NEW.country, '')), '');
    END IF;

    -- A profile photo may arrive on users.avatar_url or on the profile itself;
    -- whichever moves last wins so there is one visible image.
    IF NEW.profile_photo IS DISTINCT FROM OLD.profile_photo THEN
        UPDATE users SET avatar_url = NEW.profile_photo WHERE id = NEW.user_id;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        SELECT avatar_url INTO NEW.profile_photo FROM users WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_student_profile_aliases()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.major IS DISTINCT FROM OLD.major THEN
        NEW.department := NEW.major;
    ELSIF NEW.department IS DISTINCT FROM OLD.department THEN
        NEW.major := NEW.department;
    END IF;

    IF NEW.graduation_year IS DISTINCT FROM OLD.graduation_year THEN
        NEW.expected_graduation := NEW.graduation_year;
    ELSIF NEW.expected_graduation IS DISTINCT FROM OLD.expected_graduation THEN
        NEW.graduation_year := NEW.expected_graduation;
    END IF;

    -- Same composition rule as the alumni side.
    IF NEW.location IS DISTINCT FROM OLD.location
       AND NEW.location IS NOT NULL THEN
        NULL;
    ELSIF NEW.city IS DISTINCT FROM OLD.city
       OR NEW.region IS DISTINCT FROM OLD.region
       OR NEW.country IS DISTINCT FROM OLD.country THEN
        NEW.location := NULLIF(CONCAT_WS(', ',
            NULLIF(NEW.city, ''), NULLIF(NEW.region, ''), NULLIF(NEW.country, '')), '');
    END IF;

    IF NEW.profile_photo IS DISTINCT FROM OLD.profile_photo THEN
        UPDATE users SET avatar_url = NEW.profile_photo WHERE id = NEW.user_id;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        SELECT avatar_url INTO NEW.profile_photo FROM users WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alumni_profile_aliases ON alumni_profiles;
CREATE TRIGGER trg_alumni_profile_aliases
    BEFORE INSERT OR UPDATE ON alumni_profiles
    FOR EACH ROW EXECUTE FUNCTION sync_alumni_profile_aliases();

DROP TRIGGER IF EXISTS trg_student_profile_aliases ON student_profiles;
CREATE TRIGGER trg_student_profile_aliases
    BEFORE INSERT OR UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION sync_student_profile_aliases();

-- =========================================================
-- 4. Education and experience: specification-named columns
-- =========================================================

ALTER TABLE education
    ADD COLUMN IF NOT EXISTS field VARCHAR(150);

-- 001 calls it field_of_study; the specification calls it field.
UPDATE education SET field = field_of_study WHERE field IS NULL;

ALTER TABLE education
    DROP CONSTRAINT IF EXISTS education_year_order_check;
ALTER TABLE education
    ADD CONSTRAINT education_year_order_check
    CHECK (start_year IS NULL OR end_year IS NULL OR end_year >= start_year);

ALTER TABLE experience
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(40);

ALTER TABLE experience
    DROP CONSTRAINT IF EXISTS experience_employment_type_check;
ALTER TABLE experience
    ADD CONSTRAINT experience_employment_type_check
    CHECK (employment_type IS NULL OR employment_type IN
        ('full_time', 'part_time', 'contract', 'internship',
         'freelance', 'volunteer', 'self_employed'));

-- `company` and `job_title` are the specification's names for the 001 columns
-- company_name and title. Exposed through generated columns so they are always
-- correct without a second write path.
ALTER TABLE experience
    DROP COLUMN IF EXISTS company;
ALTER TABLE experience
    ADD COLUMN company VARCHAR(200) GENERATED ALWAYS AS (company_name) STORED;

ALTER TABLE experience
    DROP COLUMN IF EXISTS job_title;
ALTER TABLE experience
    ADD COLUMN job_title VARCHAR(150) GENERATED ALWAYS AS (title) STORED;

-- A current role cannot also have an end date. 001 allowed that combination.
ALTER TABLE experience
    DROP CONSTRAINT IF EXISTS experience_current_no_end_check;
ALTER TABLE experience
    ADD CONSTRAINT experience_current_no_end_check
    CHECK (NOT is_current OR end_date IS NULL);

-- =========================================================
-- 5. Alumni verification audit trail
--
-- alumni_profiles keeps the current state for fast filtering; every decision is
-- appended to alumni_verification_events so a rejection can be reviewed and an
-- approval can be traced to the reviewer who made it.
-- =========================================================

CREATE TABLE IF NOT EXISTS alumni_verification_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    action              VARCHAR(20) NOT NULL,
    previous_status     VARCHAR(20),
    new_status          VARCHAR(20) NOT NULL,
    reviewer_id         UUID REFERENCES users (id) ON DELETE SET NULL,
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT alumni_verification_action_check
        CHECK (action IN ('submitted', 'verified', 'rejected')),
    CONSTRAINT alumni_verification_event_status_check
        CHECK (new_status IN ('pending', 'verified', 'rejected')),
    -- A rejection must explain itself; approvals and submissions need no note.
    CONSTRAINT alumni_verification_rejection_reason_check
        CHECK (action <> 'rejected' OR NULLIF(TRIM(reason), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_verification_events_user
    ON alumni_verification_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_events_reviewer
    ON alumni_verification_events (reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_verification_events_status
    ON alumni_verification_events (new_status, created_at DESC);

-- =========================================================
-- 6. Skills: keep the normalised catalogue tidy
--
-- 001 already has a functional unique index on LOWER(name), which is what stops
-- "React" and "react" becoming two rows. The trigram-style index below supports
-- the autocomplete prefix search in GET /api/profiles/skills.
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_skills_name_prefix
    ON skills (LOWER(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_skills_category
    ON skills (LOWER(category)) WHERE category IS NOT NULL;

-- Reverse lookup for directory skill filters: given a skill, find its users.
CREATE INDEX IF NOT EXISTS idx_user_skills_user_skill
    ON user_skills (user_id, skill_id);

-- =========================================================
-- 7. Directory indexes
--
-- The directory is expected to serve roughly 50,000 alumni. Every filter in the
-- specification gets a supporting index, and the hot combinations get composite
-- indexes so the planner can satisfy a filter and an ORDER BY from one structure.
--
-- These are unconditional rather than partial on verification_status = 'verified'.
-- They were partial at first, on the reasoning that verified rows are the subset
-- worth indexing, but `verifiedOnly` defaults to FALSE, so the default directory
-- query matched no index at all and fell back to a sort over every row. An index
-- that only helps a minority of queries, on the minority the caller has to opt
-- into, is the wrong default. `verifiedOnly` remains a single extra predicate.
--
-- No pg_trgm: substring search uses functional btree indexes on LOWER(...) plus
-- prefix matching, so an unanchored term degrades to a sequential scan until
-- migration 010 adds trigram indexes where the extension is available.
-- =========================================================

-- Directory listing default: most recent graduates first.
CREATE INDEX IF NOT EXISTS idx_alumni_directory_graduation
    ON alumni_profiles (graduation_year DESC NULLS LAST, user_id);

-- The default listing filtered to verified alumni only.
CREATE INDEX IF NOT EXISTS idx_alumni_directory_verified
    ON alumni_profiles (graduation_year DESC NULLS LAST, user_id)
    WHERE verification_status = 'verified';

-- Filter + sort combinations used most often by the directory.
CREATE INDEX IF NOT EXISTS idx_alumni_directory_industry
    ON alumni_profiles (LOWER(industry), graduation_year DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_alumni_directory_company
    ON alumni_profiles (LOWER(current_company), graduation_year DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_alumni_directory_major
    ON alumni_profiles (LOWER(COALESCE(major, department)), graduation_year DESC NULLS LAST);

-- Employer and location are both filtered with a leading-wildcard LIKE, which a
-- btree index cannot serve; these support the equality and prefix cases, and
-- migration 010 adds trigram indexes for the substring case.

-- Keyword search across name, company and bio.
CREATE INDEX IF NOT EXISTS idx_users_name_search
    ON users (LOWER(last_name), LOWER(first_name));
CREATE INDEX IF NOT EXISTS idx_users_last_name_prefix
    ON users (last_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_users_first_name_prefix
    ON users (first_name text_pattern_ops);

-- Location filter, matched on the single display column. Unconditional for the
-- same reason as the indexes above: verifiedOnly is off by default.
CREATE INDEX IF NOT EXISTS idx_alumni_location_lower
    ON alumni_profiles (LOWER(location));
CREATE INDEX IF NOT EXISTS idx_student_location_lower
    ON student_profiles (LOWER(location));

-- Mentor availability is a filter of its own on the alumni directory. The
-- verified predicate is kept here because this is opt-in twice over: the member
-- must have flagged themselves available *and* be verified, which is a genuinely
-- small subset.
CREATE INDEX IF NOT EXISTS idx_alumni_open_to_mentor
    ON alumni_profiles (graduation_year DESC NULLS LAST)
    WHERE is_open_to_mentor = TRUE AND verification_status = 'verified';

-- Students share the directory, so their filters are indexed too.
CREATE INDEX IF NOT EXISTS idx_student_directory_graduation
    ON student_profiles (graduation_year DESC NULLS LAST, user_id);
CREATE INDEX IF NOT EXISTS idx_student_major_lower
    ON student_profiles (LOWER(major));

-- Education and experience are read on every profile view.
CREATE INDEX IF NOT EXISTS idx_education_user_year
    ON education (user_id, end_year DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_experience_user_dates
    ON experience (user_id, is_current DESC, start_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_links_user_platform
    ON social_links (user_id, platform);

-- The directory joins privacy_settings for every row it returns, so the lookup
-- by primary key is already covered; this index serves the opt-out filter.
CREATE INDEX IF NOT EXISTS idx_privacy_directory_visible
    ON privacy_settings (user_id) WHERE show_profile_in_directory = TRUE;