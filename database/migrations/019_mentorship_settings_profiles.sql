-- 019_mentorship_settings_profiles.sql
-- Dedicated settings and profile projection tables for multi-role interactions

CREATE TABLE IF NOT EXISTS mentorship_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE UNIQUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    capacity INTEGER NOT NULL DEFAULT 5,
    preferred_mode VARCHAR(50) DEFAULT 'video',
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE UNIQUE,
    headline VARCHAR(255),
    bio TEXT,
    department VARCHAR(150),
    location VARCHAR(255),
    graduation_year INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
