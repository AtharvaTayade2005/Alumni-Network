import { query } from '../config/database.js'
import * as privacyService from './privacyService.js'
import { toApiStatus } from './verificationService.js'

/**
 * Alumni directory search.
 *
 * Built for roughly 50,000 alumni with a sub-second target, which shapes three
 * decisions:
 *
 *   1. One parameterized statement. No user input is ever concatenated into SQL
 *      text; the sort column is the single exception and is chosen from a fixed
 *      allow-list.
 *   2. Skill filtering uses EXISTS rather than a JOIN. A JOIN multiplies rows
 *      and would both corrupt the page boundaries and force a second count.
 *   3. Counted and paged in a single query using a window function, so a page
 *      costs one round trip instead of two.
 *
 * Members who opted out of the directory, and accounts that are inactive or
 * suspended, are excluded by the WHERE clause rather than filtered afterwards.
 */

const SORT_COLUMNS = {
  name: 'u.last_name',
  recent: 'u.created_at',
  graduation_year: 'ap.graduation_year',
  company: 'ap.current_company',
  industry: 'ap.industry',
  relevance: 'ap.verified_at',
}

/**
 * Postgres FTS configuration for person and employer names. A websearch
 * dictionary keeps partial and out-of-vocabulary names ("Andersen", "IIT")
 * searchable, which a plain `to_tsvector('english', ...)` would not.
 */
const NAME_TS_VECTOR = `to_tsvector('simple',
  COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'') || ' ' ||
  COALESCE(ap.current_company,'') || ' ' || COALESCE(ap.job_title,'') || ' ' ||
  COALESCE(ap.major, ap.department,''))`

export function buildDirectoryQuery(options) {
  const {
    search, graduationYear, graduationYearFrom, graduationYearTo,
    major, location, employer, industry, skills,
    openToMentor, verifiedOnly, hasLocation,
    sort, order,
  } = options

  // Defaults live here as well as in the request schema. This function builds raw
  // SQL, and an undefined page would otherwise become NaN in the OFFSET and
  // reach PostgreSQL as an invalid bigint rather than failing legibly.
  const page = Math.max(1, Number(options.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20))

  const params = []
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  const conditions = [
    'u.is_active = TRUE',
    'u.is_suspended = FALSE',
    'ap.user_id IS NOT NULL',
    "COALESCE(ps.show_profile_in_directory, TRUE) = TRUE",
  ]

  if (verifiedOnly) {
    conditions.push(`ap.verification_status = 'verified'`)
  }

  // Keyword search: full-text first (indexable), then an ILIKE fallback so a
  // partial or misspelt term still matches instead of returning nothing.
  let tsRankExpr = null
  if (search) {
    const tsQuery = add(toTsQuery(search))
    tsRankExpr = `ts_rank(${NAME_TS_VECTOR}, to_tsquery('simple', ${tsQuery}))`
    const like = add(`%${search}%`)
    conditions.push(`(
      ${NAME_TS_VECTOR} @@ to_tsquery('simple', ${tsQuery})
      OR u.first_name ILIKE ${like}
      OR u.last_name ILIKE ${like}
      OR ap.current_company ILIKE ${like}
      OR ap.job_title ILIKE ${like}
      OR ap.major ILIKE ${like}
      OR ap.university ILIKE ${like}
    )`)
  }

  if (graduationYear) {
    conditions.push(`ap.graduation_year = ${add(graduationYear)}`)
  }
  if (graduationYearFrom != null) {
    conditions.push(`ap.graduation_year >= ${add(graduationYearFrom)}`)
  }
  if (graduationYearTo != null) {
    conditions.push(`ap.graduation_year <= ${add(graduationYearTo)}`)
  }

  // Text filters are matched case-insensitively against indexed lower() values.
  if (major) {
    conditions.push(`LOWER(COALESCE(ap.major, ap.department)) = LOWER(${add(major)})`)
  }
  if (location) {
    // The pattern must be lowercased too: the column is compared with lower(),
    // and LIKE is case-sensitive, so "Punjab" would otherwise never match
    // "lahore, punjab, pakistan".
    const p = add(`%${location.toLowerCase()}%`)
    // The OR chain must be bracketed. AND binds tighter than OR, so without the
    // parentheses this condition becomes
    //   (opt-out AND account_status AND ... AND location) OR region OR country
    // which lets a location match return members who opted out of the directory,
    // and returns a row count that does not match the filtered rows.
    conditions.push(`(
      LOWER(COALESCE(ap.location, ap.city, '')) LIKE ${p}
      OR LOWER(COALESCE(ap.region, '')) LIKE ${p}
      OR LOWER(COALESCE(ap.country, '')) LIKE ${p}
    )`)
  }
  if (employer) {
    conditions.push(`LOWER(ap.current_company) LIKE ${add(`%${employer.toLowerCase()}%`)}`)
  }
  if (industry) {
    conditions.push(`LOWER(ap.industry) = LOWER(${add(industry)})`)
  }
  if (openToMentor) {
    conditions.push(`ap.is_open_to_mentor = TRUE`)
    conditions.push("COALESCE(ps.show_mentorship_availability, TRUE) = TRUE")
  }
  if (hasLocation) {
    conditions.push(`ap.latitude IS NOT NULL AND ap.longitude IS NOT NULL`)
    conditions.push("COALESCE(ps.show_location, TRUE) = TRUE")
  }

  // Multi-skill filter. A member matches when they hold ANY of the requested
  // skills; requiring all of them would make the EXISTS clause quadratic.
  if (skills) {
    const list = [...new Set(
      String(skills).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    )]
    if (list.length) {
      const p = add(list)
      conditions.push(`EXISTS (
        SELECT 1 FROM user_skills us
        JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = ap.user_id
          AND LOWER(s.name) = ANY(${p})
      )`)
    }
  }

  const sortColumn = SORT_COLUMNS[sort] ?? SORT_COLUMNS.relevance
  const direction = order === 'desc' ? 'DESC' : 'ASC'

  // A relevance sort is only meaningful with a search term to rank against.
  const orderBy = tsRankExpr
    ? `${tsRankExpr} DESC, ap.graduation_year DESC NULLS LAST, u.last_name ASC`
    : `${sortColumn} ${direction} NULLS LAST, u.last_name ASC, ap.user_id ASC`

  return {
    where: conditions.join(' AND '),
    params,
    orderBy,
    limitParam: add(limit),
    offsetParam: add((page - 1) * limit),
  }
}

/** Tolerates user input that would otherwise raise a syntax error in to_tsquery. */
export function toTsQuery(search) {
  const tokens = String(search)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
  if (!tokens.length) return ' '
  return tokens.map((t) => `${t}:*`).join(' & ')
}

export async function search(options) {
  const built = buildDirectoryQuery(options)

  const { rows } = await query(
    `SELECT
       ap.user_id,
       u.first_name, u.last_name, u.avatar_url, u.created_at,
       ap.graduation_year, ap.degree,
       COALESCE(ap.major, ap.department) AS major,
       ap.university, ap.current_company, ap.job_title, ap.industry,
       ap.location, ap.city, ap.region, ap.country,
       ap.latitude, ap.longitude, ap.is_open_to_mentor,
       ap.verification_status, ap.verified_at,
       ps.show_location, ps.show_employer, ps.show_mentorship_availability,
       COUNT(*) OVER () AS total_count
     FROM alumni_profiles ap
     JOIN users u ON u.id = ap.user_id
     LEFT JOIN privacy_settings ps ON ps.user_id = ap.user_id
     WHERE ${built.where}
     ORDER BY ${built.orderBy}
     LIMIT ${built.limitParam} OFFSET ${built.offsetParam}`,
    built.params,
  )

  const total = rows.length ? Number(rows[0].total_count) : 0
  const userIds = rows.map((r) => r.user_id)

  // Skills are fetched for the whole page in one statement. A per-row lookup
  // would be the classic N+1 and is the reason this is a single extra query.
  const skillMap = await getSkillMap(userIds)

  return {
    rows: rows.map((r) => shape(r, skillMap)),
    total,
  }
}

async function getSkillMap(userIds) {
  if (!userIds.length) return new Map()
  const { rows } = await query(
    `SELECT us.user_id, s.id, s.name, s.category, us.proficiency
       FROM user_skills us
       JOIN skills s ON s.id = us.skill_id
      WHERE us.user_id = ANY($1::UUID[])
      ORDER BY s.name`,
    [userIds],
  )
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, [])
    map.get(row.user_id).push({
      id: row.id,
      name: row.name,
      category: row.category,
      proficiency: row.proficiency,
    })
  }
  return map
}

/**
 * Redacts each row against its owner's privacy settings. The flags arrive on the
 * row itself, so this needs no extra lookup.
 */
function shape(row, skillMap) {
  const settings = {
    show_location: row.show_location,
    show_employer: row.show_employer,
    show_mentorship_availability: row.show_mentorship_availability,
  }

  const alumni = privacyService.redactAlumni({
    user_id: row.user_id,
    graduation_year: row.graduation_year,
    degree: row.degree,
    major: row.major,
    department: row.major,
    university: row.university,
    current_company: row.current_company,
    job_title: row.job_title,
    current_position: row.job_title,
    industry: row.industry,
    location: row.location,
    city: row.city,
    region: row.region,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    is_open_to_mentor: row.is_open_to_mentor,
  }, settings)

  // The camelCase names are the documented response shape. Redaction runs first
  // so a withheld field is absent from the output entirely rather than emitted
  // with a null value, which the two would otherwise do here.
  return {
    userId: row.user_id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    avatarUrl: row.avatar_url,
    memberSince: row.created_at,
    verified: row.verification_status === 'verified',
    verificationStatus: toApiStatus(row.verification_status),
    openToMentor: row.show_mentorship_availability === false
      ? undefined
      : Boolean(row.is_open_to_mentor),
    skills: skillMap.get(row.user_id) ?? [],
    ...alumni,
    graduationYear: alumni.graduation_year,
    major: alumni.major,
    university: alumni.university,
    currentCompany: alumni.current_company,
    jobTitle: alumni.job_title,
    industry: alumni.industry,
    location: alumni.location,
    country: alumni.country,
    region: alumni.region,
    city: alumni.city,
    degree: alumni.degree,
    latitude: alumni.latitude,
    longitude: alumni.longitude,
  }
}

/**
 * Distinct values for the filter controls. One round trip per dimension would
 * be five queries, so they are combined with UNION and grouped here.
 */
export async function getFacets() {
  // Privacy is applied per dimension, not just once: the employer facet would
  // otherwise reveal the company of a member who set show_employer = false, and
  // the country facet would reveal where a member who hid their location lives.
  //
  // Every arm groups by exactly the expression it selects. Selecting a column
  // while grouping by a different expression is what made an earlier version of
  // this query fail with SQLSTATE 42803.
  const { rows } = await query(`
    WITH visible AS (
      SELECT ap.graduation_year, ap.industry, ap.current_company,
             COALESCE(ap.major, ap.department) AS major, ap.country,
             COALESCE(ps.show_employer, TRUE) AS show_employer,
             COALESCE(ps.show_location, TRUE) AS show_location
        FROM alumni_profiles ap
        JOIN users u ON u.id = ap.user_id
        LEFT JOIN privacy_settings ps ON ps.user_id = ap.user_id
       WHERE u.is_active = TRUE
         AND u.is_suspended = FALSE
         AND COALESCE(ps.show_profile_in_directory, TRUE) = TRUE
    )
    SELECT 'graduationYear' AS dimension, graduation_year::TEXT AS value, COUNT(*)::int AS n
      FROM visible
     WHERE graduation_year IS NOT NULL
     GROUP BY graduation_year
    UNION ALL
    SELECT 'industry', LOWER(industry), COUNT(*)::int
      FROM visible
     WHERE industry IS NOT NULL AND industry <> '' AND show_employer
     GROUP BY LOWER(industry)
    UNION ALL
    SELECT 'employer', LOWER(current_company), COUNT(*)::int
      FROM visible
     WHERE current_company IS NOT NULL AND current_company <> '' AND show_employer
     GROUP BY LOWER(current_company)
    UNION ALL
    SELECT 'major', LOWER(major), COUNT(*)::int
      FROM visible
     WHERE major IS NOT NULL AND major <> ''
     GROUP BY LOWER(major)
    UNION ALL
    SELECT 'country', LOWER(country), COUNT(*)::int
      FROM visible
     WHERE country IS NOT NULL AND country <> '' AND show_location
     GROUP BY LOWER(country)
    ORDER BY 1, 2`)

  const facets = {}
  for (const row of rows) {
    const key = row.dimension
    if (row.value === '' || row.value === null) continue
    if (!facets[key]) facets[key] = []
    facets[key].push({
      value: row.dimension === 'graduationYear' ? Number(row.value) : row.value,
      count: row.n,
    })
  }
  return facets
}

/** Distinct locations for a location autocomplete. */
export async function getLocations(limit = 50) {
  // Privacy is applied here too, not just in the main directory query. Grouping
  // locations without it would leak that a member exists in a city they have
  // hidden, through an endpoint that looks like harmless reference data.
  const { rows } = await query(
    `SELECT LOWER(COALESCE(ap.city, ap.location)) AS location, COUNT(*)::int AS n
       FROM alumni_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN privacy_settings ps ON ps.user_id = ap.user_id
      WHERE COALESCE(ap.city, ap.location) IS NOT NULL
        AND COALESCE(ap.city, ap.location) <> ''
        AND u.is_active = TRUE
        AND u.is_suspended = FALSE
        AND COALESCE(ps.show_profile_in_directory, TRUE) = TRUE
        AND COALESCE(ps.show_location, TRUE) = TRUE
      GROUP BY LOWER(COALESCE(ap.city, ap.location))
      ORDER BY n DESC, location ASC
      LIMIT $1`,
    [limit],
  )
  return rows.map((r) => ({ location: r.location, count: r.n }))
}

export { SORT_COLUMNS }