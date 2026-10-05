-- 010_directory_trigram.sql (down)
--
-- Drops the trigram indexes and the extension.
--
-- The extension is only dropped when no other object in the database depends on
-- it. pg_trgm is a shared, install-wide extension: a future migration (or another
-- service in the same cluster) may already rely on it, and dropping it out from
-- under them would break them. Leaving the extension installed is harmless --
-- it costs nothing when no index uses it.

DROP INDEX IF EXISTS idx_users_name_trgm;
DROP INDEX IF EXISTS idx_alumni_company_trgm;
DROP INDEX IF EXISTS idx_alumni_job_title_trgm;
DROP INDEX IF EXISTS idx_alumni_major_trgm;
DROP INDEX IF EXISTS idx_alumni_university_trgm;
DROP INDEX IF EXISTS idx_alumni_location_trgm;
DROP INDEX IF EXISTS idx_skills_name_trgm;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_class c ON c.oid = d.objid
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE d.refobjid = (SELECT oid FROM pg_extension WHERE extname = 'pg_trgm')
    ) THEN
        RAISE NOTICE 'pg_trgm is still in use by another index; leaving it installed';
        RETURN;
    END IF;

    EXECUTE 'DROP EXTENSION IF EXISTS pg_trgm';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'could not drop pg_trgm (%); leaving it installed', SQLERRM;
END
$$;