-- 015_ai_embeddings.down.sql
--
-- Reverts 015_ai_embeddings.sql by dropping the embeddings table.

DROP TABLE IF EXISTS ai_embeddings CASCADE;
