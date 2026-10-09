-- 017_career_roadmaps.sql
--
-- AI Foundation: Career roadmaps, stage milestones, and persistent task completion.
-- Stores user career roadmaps, skill gap analyses, and actionable learning tasks.

CREATE TABLE IF NOT EXISTS career_roadmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    target_role VARCHAR(150) NOT NULL,
    job_id UUID REFERENCES jobs (id) ON DELETE SET NULL,
    readiness_score INT NOT NULL DEFAULT 0,
    summary TEXT,
    skills_gap JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roadmap_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID NOT NULL REFERENCES career_roadmaps (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    stage VARCHAR(100) NOT NULL,
    stage_order INT NOT NULL DEFAULT 1,
    task_order INT NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    skill_focus VARCHAR(100),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    estimated_duration VARCHAR(100),
    completion_criteria TEXT[] NOT NULL DEFAULT '{}'::text[],
    learning_activity TEXT,
    practice_project TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_roadmaps_user
    ON career_roadmaps (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_roadmaps_job
    ON career_roadmaps (job_id) WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_roadmap
    ON roadmap_tasks (roadmap_id, stage_order, task_order);

CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_user
    ON roadmap_tasks (user_id, is_completed);
