-- 009_phase2_profiles.down.sql
-- Reverses 009_phase2_profiles.sql.
--
-- The verification event history is dropped rather than archived: it is an audit
-- trail, and keeping rows that reference a column this migration removes would
-- leave the table unreadable by the reverted code. Alumni verification state on
-- alumni_profiles is preserved, so a rollback does not silently un-verify anyone.

DROP INDEX IF EXISTS idx_privacy_directory_visible;
DROP INDEX IF EXISTS idx_social_links_user_platform;
DROP INDEX IF EXISTS idx_experience_user_dates;
DROP INDEX IF EXISTS idx_education_user_year;
DROP INDEX IF EXISTS idx_student_major_lower;
DROP INDEX IF EXISTS idx_student_directory_graduation;
DROP INDEX IF EXISTS idx_alumni_open_to_mentor;
DROP INDEX IF EXISTS idx_student_location_lower;
DROP INDEX IF EXISTS idx_alumni_location_lower;
DROP INDEX IF EXISTS idx_users_first_name_prefix;
DROP INDEX IF EXISTS idx_users_last_name_prefix;
DROP INDEX IF EXISTS idx_users_name_search;
DROP INDEX IF EXISTS idx_alumni_name_lower;
DROP INDEX IF EXISTS idx_alumni_directory_graduation;
DROP INDEX IF EXISTS idx_alumni_directory_major;
DROP INDEX IF EXISTS idx_alumni_directory_company;
DROP INDEX IF EXISTS idx_alumni_directory_industry;
DROP INDEX IF EXISTS idx_alumni_directory_verified;
DROP INDEX IF EXISTS idx_user_skills_user_skill;
DROP INDEX IF EXISTS idx_skills_category;
DROP INDEX IF EXISTS idx_skills_name_prefix;
DROP INDEX IF EXISTS idx_verification_events_status;
DROP INDEX IF EXISTS idx_verification_events_reviewer;
DROP INDEX IF EXISTS idx_verification_events_user;

DROP TABLE IF EXISTS alumni_verification_events;

-- Restore 001's date rule, which permitted a current role to carry an end date.
ALTER TABLE experience DROP CONSTRAINT IF EXISTS experience_current_no_end_check;

ALTER TABLE experience DROP COLUMN IF EXISTS job_title;
ALTER TABLE experience DROP COLUMN IF EXISTS company;
ALTER TABLE experience DROP CONSTRAINT IF EXISTS experience_employment_type_check;
ALTER TABLE experience DROP COLUMN IF EXISTS employment_type;

ALTER TABLE education DROP CONSTRAINT IF EXISTS education_year_order_check;
ALTER TABLE education DROP COLUMN IF EXISTS field;

DROP TRIGGER IF EXISTS trg_student_profile_aliases ON student_profiles;
DROP FUNCTION IF EXISTS sync_student_profile_aliases();
DROP TRIGGER IF EXISTS trg_alumni_profile_aliases ON alumni_profiles;
DROP FUNCTION IF EXISTS sync_alumni_profile_aliases();

-- Copy the specification-named values back so a forward migration does not see
-- rows that 001-era code can read but that have no major/job_title of their own.
UPDATE alumni_profiles SET department = major      WHERE department IS NULL;
UPDATE alumni_profiles SET current_position = job_title WHERE current_position IS NULL;

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_graduation_year_check;
ALTER TABLE student_profiles
    DROP COLUMN IF EXISTS profile_photo,
    DROP COLUMN IF EXISTS location,
    DROP COLUMN IF EXISTS graduation_year,
    DROP COLUMN IF EXISTS university,
    DROP COLUMN IF EXISTS major;

ALTER TABLE alumni_profiles DROP CONSTRAINT IF EXISTS alumni_graduation_year_check;
ALTER TABLE alumni_profiles
    DROP COLUMN IF EXISTS profile_photo,
    DROP COLUMN IF EXISTS location,
    DROP COLUMN IF EXISTS job_title,
    DROP COLUMN IF EXISTS university,
    DROP COLUMN IF EXISTS major;