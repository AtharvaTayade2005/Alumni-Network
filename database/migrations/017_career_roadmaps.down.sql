-- 017_career_roadmaps.down.sql
--
-- Reverts 017_career_roadmaps.sql by dropping roadmap tasks and career roadmaps.

DROP TABLE IF EXISTS roadmap_tasks CASCADE;
DROP TABLE IF EXISTS career_roadmaps CASCADE;
