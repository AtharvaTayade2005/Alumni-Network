-- 015_ai_embeddings.sql
--
-- AI Foundation: Vector embeddings and semantic retrieval storage.
-- Stores dense vector representations of alumni profiles, job postings, events,
-- and skills for similarity search, career advisory, and ATS analysis.

CREATE TABLE IF NOT EXISTS ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    title VARCHAR(255),
    content TEXT NOT NULL,
    embedding JSONB NOT NULL,
    dimensions INT NOT NULL DEFAULT 768,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_entity
    ON ai_embeddings (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_metadata
    ON ai_embeddings USING GIN (metadata);
