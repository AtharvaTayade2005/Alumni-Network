import { query } from '../../config/database.js'
import { cosineSimilarity, generateEmbedding, upsertEmbedding, listStoredEmbeddings } from './embeddingService.js'
import logger from '../../utils/logger.js'

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
  'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'who', 'what', 'where',
  'when', 'why', 'how', 'can', 'find', 'me', 'some', 'any', 'my', 'i', 'would', 'like', 'help',
])

function extractKeywords(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

/**
/**
 * Formats a raw similarity score into user-friendly relevance metadata.
 */
function formatRelevance(similarity) {
  const rawPct = Math.round(similarity * 100)
  const matchPercentage = Math.min(99, Math.max(1, rawPct))
  let tier = 'Relevant'
  let tone = 'blue'
  if (matchPercentage >= 80) {
    tier = 'Strong Match'
    tone = 'green'
  } else if (matchPercentage >= 60) {
    tier = 'Relevant'
    tone = 'blue'
  } else {
    tier = 'Moderate Match'
    tone = 'slate'
  }

  return {
    percentage: matchPercentage,
    label: `${matchPercentage}% Match`,
    tier,
    tone,
  }
}

/**
 * Generates an accurate, grounded match reason based only on actual entity attributes.
 */
function generateMatchReason(queryText, entity) {
  const qLower = String(queryText || '').toLowerCase()
  const qWords = qLower
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))

  const reasons = []
  const skills = Array.isArray(entity.skills) ? entity.skills : []
  const matchedSkills = skills.filter((s) => qLower.includes(String(s).toLowerCase()))
  if (matchedSkills.length > 0) {
    reasons.push(`Skills match: ${matchedSkills.slice(0, 3).join(', ')}`)
  }

  const company = String(entity.company || entity.companyName || '').toLowerCase()
  if (company && qLower.includes(company)) {
    reasons.push(`At ${entity.company || entity.companyName}`)
  }

  const roleOrTitle = String(entity.subtitle || entity.headline || entity.title || '').toLowerCase()
  const matchedTitleWords = qWords.filter((w) => roleOrTitle.includes(w))
  if (matchedTitleWords.length > 0 && reasons.length === 0) {
    reasons.push(`Role relevance: ${entity.headline || entity.title}`)
  }

  const loc = String(entity.location || '').toLowerCase()
  if (loc && qWords.some((w) => loc.includes(w))) {
    reasons.push(`Location: ${entity.location}`)
  }

  if (reasons.length > 0) {
    return reasons.join(' • ')
  }

  if (entity.entityType === 'PEOPLE') {
    return `Alumnus in ${entity.metadata?.industry || entity.company || 'Technology'}`
  } else if (entity.entityType === 'JOBS') {
    return `Relevant ${entity.workMode || 'opening'} in ${entity.location || 'technology'}`
  } else if (entity.entityType === 'EVENTS') {
    return `Campus event in ${entity.location || 'technology'}`
  }
  return 'Semantic match based on profile & domain'
}

/**
 * Hydrates candidate embeddings with real, active database entities from PostgreSQL.
 * Guarantees zero phantom or deleted entities.
 */
async function hydrateCandidates(scoredCandidates) {
  if (!scoredCandidates.length) return []

  const peopleIds = scoredCandidates.filter((c) => c.entityType === 'PEOPLE').map((c) => c.id)
  const jobIds = scoredCandidates.filter((c) => c.entityType === 'JOBS').map((c) => c.id)
  const eventIds = scoredCandidates.filter((c) => c.entityType === 'EVENTS').map((c) => c.id)

  const peopleMap = new Map()
  const jobMap = new Map()
  const eventMap = new Map()

  if (peopleIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT u.id, u.first_name, u.last_name, u.avatar_url,
                ap.current_position AS headline, ap.current_company, ap.industry, ap.bio,
                ap.city, ap.country, ap.graduation_year, ap.is_open_to_mentor,
                COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
         FROM users u
         JOIN alumni_profiles ap ON ap.user_id = u.id
         LEFT JOIN privacy_settings ps ON ps.user_id = u.id
         LEFT JOIN user_skills us ON us.user_id = u.id
         LEFT JOIN skills s ON s.id = us.skill_id
         WHERE u.id = ANY($1::uuid[])
           AND u.is_active = true
           AND u.is_suspended = false
           AND (ps.show_profile_in_directory IS NULL OR ps.show_profile_in_directory = true)
         GROUP BY u.id, ap.id`,
        [peopleIds]
      )
      for (const r of rows) peopleMap.set(r.id, r)
    } catch {
      // Non-fatal
    }
  }

  if (jobIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT j.id, j.title, j.company_name, j.description, j.location,
                j.work_mode, j.employment_type, j.experience_level,
                j.salary_min, j.salary_max, j.salary_currency, j.status,
                COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
         FROM jobs j
         LEFT JOIN job_skills js ON js.job_id = j.id
         LEFT JOIN skills s ON s.id = js.skill_id
         WHERE j.id = ANY($1::uuid[])
           AND LOWER(j.status) IN ('published', 'active')
         GROUP BY j.id`,
        [jobIds]
      )
      for (const r of rows) jobMap.set(r.id, r)
    } catch {
      // Non-fatal
    }
  }

  if (eventIds.length > 0) {
    try {
      const { rows } = await query(
        `SELECT e.id, e.title, e.description, e.event_date, e.start_time, e.end_time,
                e.venue, e.virtual_url, e.city, e.region, e.country, e.status
         FROM events e
         WHERE e.id = ANY($1::uuid[])
           AND LOWER(e.status) IN ('published', 'upcoming', 'active')`,
        [eventIds]
      )
      for (const r of rows) eventMap.set(r.id, r)
    } catch {
      // Non-fatal
    }
  }

  const hydrated = []
  for (const item of scoredCandidates) {
    if (item.entityType === 'PEOPLE') {
      const dbPerson = peopleMap.get(item.id)
      if (!dbPerson) continue
      const name = `${dbPerson.first_name || ''} ${dbPerson.last_name || ''}`.trim() || item.title || 'Alumni Member'
      const headline = dbPerson.headline || dbPerson.current_position || `${dbPerson.current_company || 'Industry'} Professional`
      const location = [dbPerson.city, dbPerson.country].filter(Boolean).join(', ') || item.metadata?.location || ''
      const skills = Array.isArray(dbPerson.skills) && dbPerson.skills.length > 0 ? dbPerson.skills : (item.metadata?.skills || [])

      hydrated.push({
        id: item.id,
        entityType: 'PEOPLE',
        title: name,
        subtitle: headline,
        headline,
        company: dbPerson.current_company || item.metadata?.company || '',
        location,
        skills,
        description: dbPerson.bio || item.metadata?.bio || '',
        avatarUrl: dbPerson.avatar_url || null,
        isOpenToMentor: !!dbPerson.is_open_to_mentor,
        graduationYear: dbPerson.graduation_year || item.metadata?.graduationYear || null,
        similarity: item.similarity,
        matchScore: item.matchScore,
        metadata: {
          ...item.metadata,
          name,
          headline,
          company: dbPerson.current_company || '',
          skills,
          location,
        },
        actions: [
          { label: 'View Profile', to: `/alumni/${item.id}`, variant: 'primary' },
          { label: 'Message', to: `/messages/${item.id}`, variant: 'secondary' },
        ],
      })
    } else if (item.entityType === 'JOBS') {
      const dbJob = jobMap.get(item.id)
      if (!dbJob) continue
      const title = dbJob.title || item.title
      const company = dbJob.company_name || item.metadata?.company || 'Company'
      const location = dbJob.location || item.metadata?.location || 'Remote'
      const skills = Array.isArray(dbJob.skills) && dbJob.skills.length > 0 ? dbJob.skills : (item.metadata?.skills || [])

      hydrated.push({
        id: item.id,
        entityType: 'JOBS',
        title,
        subtitle: `${company} • ${location} (${dbJob.work_mode || 'onsite'})`,
        company,
        location,
        workMode: dbJob.work_mode,
        employmentType: dbJob.employment_type,
        experienceLevel: dbJob.experience_level,
        skills,
        description: dbJob.description || item.metadata?.description || '',
        similarity: item.similarity,
        matchScore: item.matchScore,
        metadata: {
          ...item.metadata,
          title,
          company,
          location,
          skills,
        },
        actions: [
          { label: 'View Job', to: `/jobs/${item.id}`, variant: 'primary' },
          { label: 'Apply', to: `/jobs/${item.id}`, variant: 'secondary' },
        ],
      })
    } else if (item.entityType === 'EVENTS') {
      const dbEvent = eventMap.get(item.id)
      if (!dbEvent) continue
      const title = dbEvent.title || item.title
      const location = [dbEvent.city, dbEvent.country].filter(Boolean).join(', ') || (dbEvent.virtual_url ? 'Online' : dbEvent.venue || 'Campus')
      const eventDate = dbEvent.event_date ? new Date(dbEvent.event_date).toLocaleDateString() : 'Upcoming'

      hydrated.push({
        id: item.id,
        entityType: 'EVENTS',
        title,
        subtitle: `${eventDate} • ${location}`,
        eventDate: dbEvent.event_date,
        startTime: dbEvent.start_time,
        location,
        venue: dbEvent.venue,
        description: dbEvent.description || '',
        isVirtual: !!dbEvent.virtual_url,
        similarity: item.similarity,
        matchScore: item.matchScore,
        metadata: {
          ...item.metadata,
          title,
          location,
          eventDate: dbEvent.event_date,
        },
        actions: [
          { label: 'View Event', to: `/events/${item.id}`, variant: 'primary' },
          { label: 'RSVP', to: `/events/${item.id}`, variant: 'secondary' },
        ],
      })
    }
  }

  return hydrated
}

/**
 * Searches stored embeddings using cosine similarity against the query embedding.
 */
export async function searchSimilar({ queryText, entityType = 'ALL', limit = 10, minSimilarity = 0.05, user = null } = {}) {
  if (!queryText || typeof queryText !== 'string') {
    return []
  }

  // Personalization: Incorporate user profile context if query is self-referential
  let effectiveQuery = queryText
  if (user?.id && /\b(for me|my skills|recommend me|jobs for me|relevant to me)\b/i.test(queryText)) {
    try {
      const { rows: skRows } = await query(
        `SELECT s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = $1 LIMIT 10`,
        [user.id]
      )
      const skillNames = skRows.map((r) => r.name)
      if (skillNames.length > 0) {
        effectiveQuery = `${queryText}. Context skills: ${skillNames.join(', ')}`
      }
    } catch {
      // Non-fatal
    }
  }

  // 1. Generate embedding vector for the search query
  const queryVec = await generateEmbedding(effectiveQuery)

  // 2. Fetch indexed embeddings from database
  let stored = await listStoredEmbeddings({ entityType, limit: 300 })

  // 3. If the vector index is completely empty, attempt an on-demand bootstrap sync
  if (stored.length === 0) {
    await syncEntitiesToIndex().catch(() => {})
    stored = await listStoredEmbeddings({ entityType, limit: 300 })
  }

  // 4. Score each candidate
  const scored = stored.map((item) => {
    const similarity = cosineSimilarity(queryVec, item.embedding)
    return {
      id: item.entity_id,
      entityType: item.entity_type,
      title: item.title || 'Untitled',
      content: item.content,
      similarity,
      matchScore: Math.min(99, Math.max(1, Math.round(similarity * 100))),
      metadata: item.metadata || {},
    }
  })

  // 5. Filter by minSimilarity and sort descending
  const filtered = scored
    .filter((s) => s.similarity >= minSimilarity || s.similarity > 0.01)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(limit * 2, 20))

  // 6. Hydrate candidates against live PostgreSQL records to guarantee zero hallucinated/stale entities
  let hydrated = await hydrateCandidates(filtered)

  // If initial hydration yielded nothing because index had deleted records, try re-syncing once
  if (hydrated.length === 0 && scored.length > 0) {
    await syncEntitiesToIndex().catch(() => {})
    const refreshed = await listStoredEmbeddings({ entityType, limit: 300 })
    const refreshedScored = refreshed.map((item) => ({
      id: item.entity_id,
      entityType: item.entity_type,
      title: item.title || 'Untitled',
      content: item.content,
      similarity: cosineSimilarity(queryVec, item.embedding),
      matchScore: Math.min(99, Math.max(1, Math.round(cosineSimilarity(queryVec, item.embedding) * 100))),
      metadata: item.metadata || {},
    }))
    const refreshedFiltered = refreshedScored
      .filter((s) => s.similarity >= minSimilarity || s.similarity > 0.01)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(limit * 2, 20))
    hydrated = await hydrateCandidates(refreshedFiltered)
  }

  // 7. Attach final relevance formatting and match explanation
  const finalResults = hydrated.map((entity) => {
    const relevance = formatRelevance(entity.similarity)
    const matchReason = generateMatchReason(queryText, entity)
    return {
      ...entity,
      matchScore: relevance.percentage,
      relevance,
      matchReason,
    }
  })

  return finalResults.slice(0, limit)
}

/**
 * Retrieves real alumni from PostgreSQL matching user query or skills.
 */
export async function getAlumniRecommendations({ userId, queryText = '', skills = [], limit = 3 } = {}) {
  try {
    const safeUserId = userId || '00000000-0000-0000-0000-000000000000'
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, ap.current_position AS headline,
              ap.current_company, ap.current_position, ap.industry, ap.bio,
              COALESCE(array_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
       FROM users u
       JOIN alumni_profiles ap ON ap.user_id = u.id
       LEFT JOIN user_skills us ON us.user_id = u.id
       LEFT JOIN skills s ON s.id = us.skill_id
       WHERE u.id != $1
       GROUP BY u.id, ap.id
       LIMIT 50`,
      [safeUserId]
    )

    if (rows.length === 0) return []

    const queryWords = extractKeywords(queryText)
    const scored = rows.map((row) => {
      let score = 0
      const matched = []
      const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim()
      const searchableText = `${fullName} ${row.headline || ''} ${row.current_company || ''} ${row.current_position || ''} ${row.industry || ''} ${row.bio || ''} ${(row.skills || []).join(' ')}`.toLowerCase()

      for (const word of queryWords) {
        if (searchableText.includes(word)) {
          score += 2
          if (!matched.includes(word)) matched.push(word)
        }
      }

      for (const s of skills) {
        if (searchableText.includes(String(s).toLowerCase())) {
          score += 1
          if (!matched.includes(s)) matched.push(s)
        }
      }

      return {
        id: row.id,
        name: fullName || 'Alumni Member',
        headline: row.headline || row.current_position || `${row.current_company || 'Industry'} Professional`,
        currentCompany: row.current_company || 'Tech Partner',
        currentRole: row.current_position || row.headline || 'Software Engineer',
        skills: Array.isArray(row.skills) ? row.skills : [],
        score,
        matchReason: matched.length > 0
          ? `Matches ${matched.slice(0, 3).join(', ')}`
          : `Alumnus in ${row.industry || 'Technology'}`,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  } catch (err) {
    logger.error('getAlumniRecommendations error', { message: err.message })
    return []
  }
}

/**
 * Retrieves real available mentors from PostgreSQL matching user query or skills.
 */
export async function getMentorRecommendations({ userId, queryText = '', skills = [], limit = 3 } = {}) {
  try {
    const safeUserId = userId || '00000000-0000-0000-0000-000000000000'
    const { rows } = await query(
      `SELECT u.id, u.first_name, u.last_name, ap.current_position AS headline,
              ap.current_company, ap.current_position, ap.industry, ap.bio,
              COALESCE(array_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
       FROM users u
       JOIN alumni_profiles ap ON ap.user_id = u.id
       LEFT JOIN user_skills us ON us.user_id = u.id
       LEFT JOIN skills s ON s.id = us.skill_id
       WHERE ap.is_open_to_mentor = true AND u.id != $1
       GROUP BY u.id, ap.id
       LIMIT 50`,
      [safeUserId]
    )

    if (rows.length === 0) return []

    const queryWords = extractKeywords(queryText)
    const scored = rows.map((row) => {
      let score = 0
      const matched = []
      const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim()
      const searchableText = `${fullName} ${row.headline || ''} ${row.current_company || ''} ${row.current_position || ''} ${row.industry || ''} ${row.bio || ''} ${(row.skills || []).join(' ')}`.toLowerCase()

      for (const word of queryWords) {
        if (searchableText.includes(word)) {
          score += 2
          if (!matched.includes(word)) matched.push(word)
        }
      }

      for (const s of skills) {
        if (searchableText.includes(String(s).toLowerCase())) {
          score += 1
          if (!matched.includes(s)) matched.push(s)
        }
      }

      const expertise = (row.skills || []).length > 0
        ? row.skills.slice(0, 3).join(', ')
        : row.current_position || 'Software Systems'

      return {
        id: row.id,
        name: fullName || 'Alumni Mentor',
        expertise,
        company: row.current_company || 'Tech Partner',
        role: row.current_position || 'Senior Engineer',
        skills: Array.isArray(row.skills) ? row.skills : [],
        score,
        matchReason: matched.length > 0
          ? `Experienced with ${matched.slice(0, 3).join(', ')}`
          : `Verified mentor in ${row.industry || 'Technology'}`,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  } catch (err) {
    logger.error('getMentorRecommendations error', { message: err.message })
    return []
  }
}

/**
 * Retrieves real active jobs from PostgreSQL matching user query or skills.
 */
export async function getJobRecommendations({ userId, queryText = '', skills = [], limit = 3 } = {}) {
  try {
    const { rows } = await query(
      `SELECT j.id, j.title, j.company_name, j.description, j.location, j.work_mode, j.employment_type,
              COALESCE(array_agg(s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
       FROM jobs j
       LEFT JOIN job_skills js ON js.job_id = j.id
       LEFT JOIN skills s ON s.id = js.skill_id
       WHERE LOWER(j.status) IN ('published', 'active')
       GROUP BY j.id
       LIMIT 50`
    )

    if (rows.length === 0) return []

    const queryWords = extractKeywords(queryText)
    const scored = rows.map((row) => {
      let score = 0
      const matched = []
      const searchableText = `${row.title || ''} ${row.company_name || ''} ${row.description || ''} ${row.location || ''} ${(row.skills || []).join(' ')}`.toLowerCase()

      for (const word of queryWords) {
        if (searchableText.includes(word)) {
          score += 2
          if (!matched.includes(word)) matched.push(word)
        }
      }

      for (const s of skills) {
        if (searchableText.includes(String(s).toLowerCase())) {
          score += 1
          if (!matched.includes(s)) matched.push(s)
        }
      }

      return {
        id: row.id,
        title: row.title,
        companyName: row.company_name || 'Tech Company',
        location: row.location || 'Remote',
        skills: Array.isArray(row.skills) ? row.skills : [],
        score,
        matchReason: matched.length > 0
          ? `Matches ${matched.slice(0, 3).join(', ')}`
          : `Relevant ${row.work_mode || 'opening'} in ${row.location || 'campus network'}`,
      }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  } catch (err) {
    logger.error('getJobRecommendations error', { message: err.message })
    return []
  }
}

/**
 * Bootstraps or refreshes indexable records from PostgreSQL into ai_embeddings.
 */
export async function syncEntitiesToIndex() {
  // Sync Alumni (PEOPLE)
  try {
    const { rows: alumni } = await query(
      `SELECT u.id, u.first_name, u.last_name, u.avatar_url,
              ap.current_position AS headline, ap.current_company, ap.industry, ap.bio,
              ap.city, ap.country, ap.graduation_year, ap.is_open_to_mentor,
              COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
       FROM users u
       JOIN alumni_profiles ap ON ap.user_id = u.id
       LEFT JOIN privacy_settings ps ON ps.user_id = u.id
       LEFT JOIN user_skills us ON us.user_id = u.id
       LEFT JOIN skills s ON s.id = us.skill_id
       WHERE u.is_active = true
         AND u.is_suspended = false
         AND (ps.show_profile_in_directory IS NULL OR ps.show_profile_in_directory = true)
       GROUP BY u.id, ap.id
       ORDER BY ap.updated_at DESC
       LIMIT 100`
    )
    for (const a of alumni) {
      const name = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Alumni Member'
      const role = a.headline || a.current_position || 'Software Engineer'
      const company = a.current_company || 'Technology'
      const location = [a.city, a.country].filter(Boolean).join(', ')
      const skillsList = Array.isArray(a.skills) ? a.skills.join(', ') : ''
      const content = `Alumnus: ${name}. Current Role: ${role} at ${company}. Industry: ${a.industry || 'Technology'}. Location: ${location}. Skills: ${skillsList}. Bio: ${a.bio || ''}`
      const embedding = await generateEmbedding(content)
      await upsertEmbedding({
        entityType: 'PEOPLE',
        entityId: a.id,
        title: name,
        content,
        embedding,
        metadata: {
          name,
          role,
          company,
          industry: a.industry,
          location,
          skills: a.skills,
          avatarUrl: a.avatar_url,
          isOpenToMentor: !!a.is_open_to_mentor,
          graduationYear: a.graduation_year,
        },
      }).catch(() => {})
    }
  } catch (err) {
    logger.warn('Alumni sync to index failed', { message: err.message })
  }

  // Sync Jobs (JOBS)
  try {
    const { rows: jobs } = await query(
      `SELECT j.id, j.title, j.company_name, j.description, j.location,
              j.work_mode, j.employment_type, j.experience_level,
              COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills
       FROM jobs j
       LEFT JOIN job_skills js ON js.job_id = j.id
       LEFT JOIN skills s ON s.id = js.skill_id
       WHERE LOWER(j.status) IN ('published', 'active')
       GROUP BY j.id
       ORDER BY j.created_at DESC
       LIMIT 100`
    )
    for (const j of jobs) {
      const title = j.title
      const company = j.company_name || 'Tech Company'
      const location = j.location || 'Remote'
      const skillsList = Array.isArray(j.skills) ? j.skills.join(', ') : ''
      const content = `Job Opening: ${title} at ${company}. Location: ${location} (${j.work_mode || 'onsite'}). Employment Type: ${j.employment_type || 'full_time'}. Experience Level: ${j.experience_level || 'mid'}. Required Skills: ${skillsList}. Description: ${j.description || ''}`
      const embedding = await generateEmbedding(content)
      await upsertEmbedding({
        entityType: 'JOBS',
        entityId: j.id,
        title,
        content,
        embedding,
        metadata: {
          title,
          company,
          location,
          workMode: j.work_mode,
          employmentType: j.employment_type,
          experienceLevel: j.experience_level,
          skills: j.skills,
        },
      }).catch(() => {})
    }
  } catch (err) {
    logger.warn('Jobs sync to index failed', { message: err.message })
  }

  // Sync Events (EVENTS)
  try {
    const { rows: events } = await query(
      `SELECT id, title, description, venue, virtual_url, city, region, country, event_date, start_time, end_time
       FROM events
       WHERE LOWER(status) IN ('upcoming', 'published', 'active')
       ORDER BY event_date ASC
       LIMIT 100`
    )
    for (const ev of events) {
      const location = [ev.city, ev.country].filter(Boolean).join(', ') || (ev.virtual_url ? 'Online' : ev.venue || 'Campus')
      const content = `Event: ${ev.title}. Date: ${ev.event_date || 'Upcoming'}. Venue: ${ev.venue || 'Campus'}. Location: ${location}. Description: ${ev.description || ''}`
      const embedding = await generateEmbedding(content)
      await upsertEmbedding({
        entityType: 'EVENTS',
        entityId: ev.id,
        title: ev.title,
        content,
        embedding,
        metadata: {
          title: ev.title,
          eventDate: ev.event_date,
          startTime: ev.start_time,
          venue: ev.venue,
          location,
          isVirtual: !!ev.virtual_url,
        },
      }).catch(() => {})
    }
  } catch (err) {
    logger.warn('Events sync to index failed', { message: err.message })
  }
}

/**
 * Retrieves contextual networking entities for a given user from PostgreSQL.
 */
export async function getNetworkContextForUser(userId) {
  const [suggestedMentors, suggestedJobs] = await Promise.all([
    getMentorRecommendations({ userId, limit: 3 }).catch(() => []),
    getJobRecommendations({ userId, limit: 3 }).catch(() => []),
  ])

  return {
    suggestedMentors,
    suggestedJobs,
  }
}
