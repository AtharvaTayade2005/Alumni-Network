-- 018_announcements.sql
-- Campus & Department Announcements for faculty and administrators

CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    department VARCHAR(100) NOT NULL DEFAULT 'Computer Science',
    target_audience VARCHAR(50) NOT NULL DEFAULT 'ALL',
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    views_count INT NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published
    ON announcements (status, is_pinned DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_announcements_author
    ON announcements (author_id);

CREATE INDEX IF NOT EXISTS idx_announcements_department
    ON announcements (department);
