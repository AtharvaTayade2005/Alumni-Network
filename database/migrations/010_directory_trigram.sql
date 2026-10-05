-- 010_directory_trigram.sql
--
-- Trigram indexes for the alumni directory's substring search.
--
-- Why this is guarded rather than plain DDL:
--
-- The directory matches keywords with to_tsvector for whole words and falls
-- back to ILIKE '%term%' so that partial and misspelt terms still return
-- something. A btree index cannot serve a leading-wildcard LIKE: the pattern is
-- unknown at plan time. Trigram GIN indexes can, which is why they exist.
--
-- pg_trgm is a compiled extension. It is present on stock PostgreSQL but absent
-- from PGlite, which is what the test suite runs on. An unguarded
-- `CREATE EXTENSION pg_trgm` would therefore fail the whole migration chain in
-- tests, and a bare `gin_trgm_ops` index class would fail on any server where a
-- DBA has declined to install the extension.
--
-- So the extension is created only when it is actually installable, and the
-- indexes are created only when the extension ended up present. On a server
-- without pg_trgm the migration still succeeds and the directory keeps working
-- through the btree indexes from 009 and the sequential-scan LIKE fallback --
-- slower, but correct. Run npm run perf:directory to see the timings on the
-- engine you actually have.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
        RAISE NOTICE
            'pg_trgm is not available on this server; skipping trigram indexes. '
            'Directory substring search will use a sequential scan.';
        RETURN;
    END IF;

    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm';
EXCEPTION WHEN OTHERS THEN
    -- Never let an optional optimisation fail the migration.
    RAISE WARNING 'could not enable pg_trgm (%); skipping trigram indexes', SQLERRM;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        RETURN;
    END IF;

    -- Name search. The functional index matches the expression the directory
    -- query actually uses, so the planner can match it exactly.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_name_trgm
        ON users USING GIN ((first_name || '' '' || last_name) gin_trgm_ops)';

    -- The other free-text columns the keyword filter falls back to.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alumni_company_trgm
        ON alumni_profiles USING GIN (current_company gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alumni_job_title_trgm
        ON alumni_profiles USING GIN (job_title gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alumni_major_trgm
        ON alumni_profiles USING GIN (COALESCE(major, department) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alumni_university_trgm
        ON alumni_profiles USING GIN (university gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alumni_location_trgm
        ON alumni_profiles USING GIN (COALESCE(location, city) gin_trgm_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_skills_name_trgm
        ON skills USING GIN (name gin_trgm_ops)';
END
$$;