import { query } from '../config/database.js'

/**
 * Directory search over verified alumni and students.
 *
 * All filters are optional and combine with AND. The query is a single
 * parameterized statement; no user input is interpolated into SQL text. An
 * EXISTS subquery handles multi-value skill filtering without the row
 * multiplication a JOIN would cause, which keeps COUNT(*) accurate.
 */
export async function searchDirectory(filters, viewerId = null) {
  const {
    search, graduationYear, graduationYearFrom, graduationYearTo, degree,
    department, industry, company, country, region, city, skills,
    openToMentor, verifiedOnly, role, hasLocation,
    limit, offset, sort, order,
  } = filters

  const params = []
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  const conditions = ['u.is_active = TRUE', 'u.is_suspended = FALSE']

  // Restrict to people who opted into the directory.
  conditions.push(`COALESCE(ps.show_profile_in_directory, TRUE) = TRUE`)

  if (role) {
    conditions.push(`EXISTS (SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND UPPER(r.name) = ${add(role)})`)
  }

  if (verifiedOnly) {
    conditions.push(`COALESCE(ap.verification_status = 'verified'
      OR sp.verification_status = 'verified', FALSE) = TRUE`)
  }

  if (search) {
    const term = `%${search}%`
    const p = add(term)
    conditions.push(`(
      u.first_name ILIKE ${p} OR u.last_name ILIKE ${p}
      OR (u.first_name || ' ' || u.last_name) ILIKE ${p}
      OR ap.current_company ILIKE ${p}
      OR ap.bio ILIKE ${p}
      OR sp.career_interests ILIKE ${p}
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
  if (degree) {
    conditions.push(`(ap.degree ILIKE ${add(`%${degree}%`)}
      OR sp.degree ILIKE ${add(`%${degree}%`)})`)
  }
  if (department) {
    conditions.push(`(ap.department ILIKE ${add(`%${department}%`)}
      OR sp.department ILIKE ${add(`%${department}%`)})`)
  }
  if (industry) {
    conditions.push(`ap.industry ILIKE ${add(`%${industry}%`)}`)
  }
  if (company) {
    conditions.push(`ap.current_company ILIKE ${add(`%${company}%`)}`)
  }
  if (country) {
    conditions.push(`COALESCE(ap.country, sp.country) = ${add(country)}`)
  }
  if (region) {
    conditions.push(`COALESCE(ap.region, sp.region) = ${add(region)}`)
  }
  if (city) {
    conditions.push(`COALESCE(ap.city, sp.city) = ${add(city)}`)
  }
  if (openToMentor) {
    conditions.push(`ap.is_open_to_mentor = TRUE`)
  }
  if (hasLocation) {
    conditions.push(`ap.latitude IS NOT NULL AND ap.longitude IS NOT NULL
      AND COALESCE(ps.show_location, TRUE) = TRUE`)
  }

  if (skills) {
    const list = skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (list.length) {
      const p = add(list)
      conditions.push(`(
        SELECT COUNT(DISTINCT LOWER(s.name))
        FROM user_skills us JOIN skills s ON s.id = us.skill_id
        WHERE us.user_id = u.id AND LOWER(s.name) = ANY(${p})
      ) >= 1`)
    }
  }

  const where = conditions.join(' AND ')

  const sortColumn = {
    name: 'u.last_name',
    recent: 'u.created_at',
    graduation_year: 'ap.graduation_year',
    relevance: 'COALESCE(ap.verification_status = \'verified\', FALSE)',
  }[sort] ?? 'u.last_name'
  const direction = order === 'desc' ? 'DESC' : 'ASC'

  const limitP = add(limit)
  const offsetP = add(offset)

  const { rows } = await query(
    `SELECT
       u.id, u.first_name, u.last_name, u.avatar_url, u.created_at,
       u.email, u.phone,
       ap.graduation_year, ap.degree, ap.department, ap.current_company,
       ap.current_position, ap.industry, ap.city, ap.region, ap.country,
       ap.latitude, ap.longitude, ap.is_open_to_mentor,
       ap.verification_status AS alumni_verification,
       sp.degree AS student_degree, sp.year_of_study,
       sp.career_interests, sp.department AS student_department,
       sp.verification_status AS student_verification,
       COALESCE(ps.show_email, FALSE) AS show_email,
       COALESCE(ps.show_phone, FALSE) AS show_phone,
       COALESCE(ps.show_location, TRUE) AS show_location,
       COALESCE(ps.show_employer, TRUE) AS show_employer
     FROM users u
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN privacy_settings ps ON ps.user_id = u.id
     WHERE ${where}
     ORDER BY ${sortColumn} ${direction} NULLS LAST, u.last_name ASC
     LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  )

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM users u
     LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN privacy_settings ps ON ps.user_id = u.id
     WHERE ${where}`,
    params.slice(0, params.length - 2),
  )

  const userIds = rows.map((r) => r.id)
  const effectiveViewerId = viewerId || filters.viewerId || null
  const [skillMap, connectionMap] = await Promise.all([
    getSkillMap(userIds),
    getConnectionMap(userIds, effectiveViewerId),
  ])

  return {
    rows: rows.map((r) => shapeDirectoryRow(r, skillMap, connectionMap, effectiveViewerId)),
    total: countRows[0].total,
  }
}

async function getConnectionMap(userIds, viewerId) {
  if (!userIds.length || !viewerId) return new Map()
  const { rows } = await query(
    `SELECT id, requester_id, addressee_id, status
     FROM connections
     WHERE (requester_id = $1 AND addressee_id = ANY($2::UUID[]))
        OR (addressee_id = $1 AND requester_id = ANY($2::UUID[]))`,
    [viewerId, userIds],
  )
  const map = new Map()
  for (const c of rows) {
    const peerId = c.requester_id === viewerId ? c.addressee_id : c.requester_id
    map.set(peerId, c)
  }
  return map
}

async function getSkillMap(userIds) {
  if (!userIds.length) return new Map()
  const { rows } = await query(
    `SELECT us.user_id, s.name
     FROM user_skills us JOIN skills s ON s.id = us.skill_id
     WHERE us.user_id = ANY($1::UUID[])
     ORDER BY s.name`,
    [userIds],
  )
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, [])
    map.get(row.user_id).push(row.name)
  }
  return map
}

/** Applies each viewer's own privacy settings before data leaves the server. */
function shapeDirectoryRow(row, skillMap, connectionMap = null, viewerId = null) {
  const email = row.show_email ? row.email : null
  const phone = row.show_phone ? row.phone : null
  const showLocation = row.show_location
  const showEmployer = row.show_employer

  let connectionState = 'none'
  let connectionId = null

  if (viewerId && row.id === viewerId) {
    connectionState = 'self'
  } else if (viewerId && connectionMap) {
    const c = connectionMap.get(row.id)
    if (c) {
      connectionId = c.id
      if (c.status === 'accepted') connectionState = 'connected'
      else if (c.status === 'blocked') connectionState = 'blocked'
      else if (c.status === 'pending') {
        connectionState = c.requester_id === viewerId ? 'pending_outgoing' : 'pending_incoming'
      } else if (c.status === 'rejected') {
        connectionState = 'none'
      }
    }
  }

  return {
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    avatarUrl: row.avatar_url,
    memberSince: row.created_at,
    isAlumni: Boolean(row.graduation_year || row.current_company),
    verified: row.alumni_verification === 'verified'
      || row.student_verification === 'verified',
    openToMentor: row.is_open_to_mentor ?? false,
    graduationYear: row.graduation_year,
    degree: row.degree ?? row.student_degree,
    department: row.department ?? row.student_department,
    currentCompany: showEmployer ? row.current_company : null,
    currentPosition: row.current_position,
    industry: row.industry,
    city: showLocation ? row.city : null,
    region: showLocation ? row.region : null,
    country: showLocation ? row.country : null,
    latitude: showLocation ? row.latitude : null,
    longitude: showLocation ? row.longitude : null,
    yearOfStudy: row.year_of_study,
    careerInterests: row.career_interests,
    skills: skillMap.get(row.id) ?? [],
    email,
    phone,
    connectionState,
    connectionId,
  }
}

/** Distinct alumni locations for the map view. Honours opt-out and bounds. */
export async function getMapPoints({ country, region, limit }) {
  const params = []
  const conditions = [
    'u.is_active = TRUE', 'u.is_suspended = FALSE',
    'ap.latitude IS NOT NULL', 'ap.longitude IS NOT NULL',
    'ap.show_on_map = TRUE',
    "COALESCE(ps.show_location, TRUE) = TRUE",
    "COALESCE(ps.show_profile_in_directory, TRUE) = TRUE",
    'ap.verification_status = \'verified\'',
  ]
  const add = (v) => {
    params.push(v)
    return `$${params.length}`
  }
  if (country) conditions.push(`ap.country = ${add(country)}`)
  if (region) conditions.push(`ap.region = ${add(region)}`)
  params.push(limit)

  const { rows } = await query(
    `SELECT ap.latitude, ap.longitude, ap.city, ap.region, ap.country,
            COUNT(*)::int AS alumni_count
     FROM alumni_profiles ap
     JOIN users u ON u.id = ap.user_id
     LEFT JOIN privacy_settings ps ON ps.user_id = ap.user_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY ap.latitude, ap.longitude, ap.city, ap.region, ap.country
     ORDER BY alumni_count DESC
     LIMIT $${params.length}`,
    params,
  )

  return rows.map((r) => ({
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: r.city,
    region: r.region,
    country: r.country,
    alumniCount: r.alumni_count,
  }))
}

export async function getFilterOptions() {
  const { rows: years } = await query(
    `SELECT DISTINCT graduation_year FROM alumni_profiles
     WHERE graduation_year IS NOT NULL ORDER BY graduation_year DESC`,
  )
  const { rows: industries } = await query(
    `SELECT DISTINCT industry FROM alumni_profiles
     WHERE industry IS NOT NULL AND industry <> '' ORDER BY industry`,
  )
  const { rows: countries } = await query(
    `SELECT DISTINCT country FROM (
       SELECT country FROM alumni_profiles WHERE country IS NOT NULL
       UNION ALL
       SELECT country FROM student_profiles WHERE country IS NOT NULL
     ) c WHERE country <> '' ORDER BY country`,
  )
  const { rows: regions } = await query(
    `SELECT DISTINCT region FROM (
       SELECT region FROM alumni_profiles WHERE region IS NOT NULL
       UNION ALL
       SELECT region FROM student_profiles WHERE region IS NOT NULL
     ) r WHERE region <> '' ORDER BY region`,
  )
  const { rows: degrees } = await query(
    `SELECT DISTINCT degree FROM (
       SELECT degree FROM alumni_profiles WHERE degree IS NOT NULL
       UNION ALL
       SELECT degree FROM student_profiles WHERE degree IS NOT NULL
     ) d WHERE degree <> '' ORDER BY degree`,
  )
  const { rows: departments } = await query(
    `SELECT DISTINCT department FROM (
       SELECT department FROM alumni_profiles WHERE department IS NOT NULL
       UNION ALL
       SELECT department FROM student_profiles WHERE department IS NOT NULL
     ) d WHERE department <> '' ORDER BY department`,
  )

  return {
    graduationYears: years.map((r) => r.graduation_year),
    industries: industries.map((r) => r.industry),
    countries: countries.map((r) => r.country),
    regions: regions.map((r) => r.region),
    degrees: degrees.map((r) => r.degree),
    departments: departments.map((r) => r.department),
  }
}
