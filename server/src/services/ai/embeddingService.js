import { query } from '../../config/database.js'
import { getAiProvider } from './aiProvider.js'

/**
 * Calculates cosine similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for embeddings).
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0
  }

  const len = Math.min(vecA.length, vecB.length)
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < len; i++) {
    const a = vecA[i]
    const b = vecB[i]
    dot += a * b
    normA += a * a
    normB += b * b
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Generates an embedding vector for arbitrary text using the active AI provider.
 */
export async function generateEmbedding(text) {
  const provider = getAiProvider()
  return provider.generateEmbedding(text)
}

/**
 * Stores or updates a vector embedding in the ai_embeddings PostgreSQL table.
 */
export async function upsertEmbedding({ entityType, entityId, title, content, embedding, metadata = {} }) {
  const dimensions = embedding?.length || 768
  const cleanType = String(entityType || 'PEOPLE').toUpperCase()
  // Ensure idempotency: remove previous embedding for the same entity
  await query(
    `DELETE FROM ai_embeddings WHERE entity_type = $1 AND entity_id = $2`,
    [cleanType, entityId]
  )
  const { rows } = await query(
    `INSERT INTO ai_embeddings (entity_type, entity_id, title, content, embedding, dimensions, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, NOW())
     RETURNING id, entity_type, entity_id, title, dimensions, created_at`,
    [
      cleanType,
      entityId,
      title || null,
      content,
      JSON.stringify(embedding),
      dimensions,
      JSON.stringify(metadata),
    ],
  )
  return rows[0]
}

/**
 * Reads stored embeddings from the database for vector similarity comparisons.
 */
export async function listStoredEmbeddings({ entityType = null, limit = 100 } = {}) {
  let sql = `SELECT id, entity_type, entity_id, title, content, embedding, dimensions, metadata, created_at
             FROM ai_embeddings`
  const params = []

  if (entityType && entityType !== 'ALL') {
    sql += ` WHERE entity_type = $1`
    params.push(entityType.toUpperCase())
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
  params.push(limit)

  const { rows } = await query(sql, params)
  return rows.map((r) => ({
    ...r,
    embedding: typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding,
  }))
}
