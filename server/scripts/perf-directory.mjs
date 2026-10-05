#!/usr/bin/env node
/**
 * Directory performance check at the scale the specification targets (~50,000
 * alumni) with a sub-second budget.
 *
 * This exists because "it is fast on my laptop with twelve rows" proves nothing.
 * It seeds a realistic population in a single set-based INSERT, runs ANALYZE so
 * the planner sees the true distribution, then times the queries the directory
 * service actually issues and prints the chosen plan for each.
 *
 * Usage:  npm run perf:directory
 *
 * Caveat worth reading before trusting the numbers: this runs on PGlite, not
 * PostgreSQL. PGlite has no pg_trgm, so migration 010 skips its trigram indexes
 * and the substring/ILIKE fallback degrades to a sequential scan. The report says
 * so explicitly per run rather than quietly reporting a green run that production
 * would not reproduce.
 */
import 'dotenv/config'

process.env.NODE_ENV = 'test'
process.env.PORT = '54331'

const { startTestDatabase, stopTestDatabase } = await import('../tests/helpers/testDatabase.js')

const ROWS = Number(process.env.PERF_ROWS ?? 50_000)
const BUDGET_MS = Number(process.env.PERF_BUDGET_MS ?? 1000)

await startTestDatabase()

const { query, closePool } = await import('../src/config/database.js')
const directory = await import('../src/services/alumniDirectoryService.js')

/**
 * A spread of real-world values rather than a constant in every column: a
 * planner will happily use an index on a column where every value is identical,
 * and the resulting plan tells us nothing.
 *
 * These are two statements rather than one: the extended query protocol accepts
 * only a single command per prepared statement.
 */
const SEED_USERS = `
INSERT INTO users (email, password_hash, first_name, last_name, is_email_verified)
SELECT
  'perf' || g || '@example.edu',
  'x',
  (ARRAY['Ada','Grace','Alan','Edsger','Barbara','Ken','Radia','Linus','Margaret','Donald'])[1 + (g % 10)],
  (ARRAY['Lovelace','Hopper','Turing','Dijkstra','Liskov','Thompson','Perlman','Torvalds','Hamilton','Knuth'])[1 + (g % 10)],
  TRUE
FROM generate_series(1, $1) AS g`

const SEED_PROFILES = `
INSERT INTO alumni_profiles (user_id, graduation_year, degree, department, major,
  current_company, job_title, industry, city, region, country,
  latitude, longitude, is_open_to_mentor, verification_status)
SELECT
  u.id,
  1970 + (g % 55),
  (ARRAY['BSc','MSc','PhD','MBA'])[1 + (g % 4)],
  (ARRAY['Computing','Physics','Economics','Medicine','Law'])[1 + (g % 5)],
  (ARRAY['Computing','Physics','Economics','Medicine','Law'])[1 + (g % 5)],
  'Company ' || (g % 500),
  'Engineer ' || (g % 50),
  (ARRAY['Software','Finance','Healthcare','Education'])[1 + (g % 4)],
  'City ' || (g % 400),
  'Region ' || (g % 40),
  (ARRAY['Pakistan','United Kingdom','Canada','Germany','Nigeria'])[1 + (g % 5)],
  24 + (g % 60) * 0.1,
  60 + (g % 90) * 0.1,
  -- Only a verified alumnus may advertise, since migration 011; the trigger would
  -- reject the whole INSERT otherwise. Every sixth row is therefore both verified
  -- and opted in, which is still a large, varied subset for the planner.
  g % 6 = 0,
  CASE WHEN g % 3 = 0 THEN 'verified' WHEN g % 3 = 1 THEN 'pending' ELSE 'rejected' END
FROM generate_series(1, $1) AS g
JOIN users u ON u.email = 'perf' || g || '@example.edu'`

console.log(`Seeding ${ROWS.toLocaleString()} alumni...`)
const seedStart = performance.now()
await query(SEED_USERS, [ROWS])
await query(SEED_PROFILES, [ROWS])
console.log(`  seeded in ${Math.round(performance.now() - seedStart)}ms`)

const t0 = performance.now()
await query('ANALYZE users, alumni_profiles, privacy_settings')
console.log(`ANALYZE took ${Math.round(performance.now() - t0)}ms\n`)

/** Cases chosen to cover every index the directory can be expected to use. */
const CASES = [
  ['unfiltered page 1', {}],
  ['deep page (offset 45000)', { page: 451 }],
  ['keyword search', { search: 'Turing' }],
  ['substring search (ILIKE fallback)', { search: 'ompany 12' }],
  ['graduation year range', { graduationYearFrom: 2010, graduationYearTo: 2015 }],
  ['major filter', { major: 'Computing' }],
  ['location filter', { location: 'Region 12' }],
  ['employer filter', { employer: 'Company 42' }],
  ['industry + openToMentor', { industry: 'Software', openToMentor: true }],
  ['verifiedOnly', { verifiedOnly: true }],
  ['sorted by graduation year desc', { sort: 'graduationYear', order: 'desc' }],
]

const results = []

for (const [label, options] of CASES) {
  const started = performance.now()
  const result = await directory.search({ limit: 20, ...options })
  const elapsed = performance.now() - started

  results.push({
    label,
    ms: Math.round(elapsed),
    rows: result.rows.length,
    total: result.total,
    ok: elapsed <= BUDGET_MS,
  })
}

/** Plan shape for the two queries whose index usage is least obvious. */
async function explain(label, sql, params) {
  const { rows } = await query(`EXPLAIN ${sql}`, params)
  return { label, plan: rows.map((r) => r['QUERY PLAN']).filter(Boolean) }
}

const searchSql = directory.buildDirectoryQuery({ search: 'Turing', limit: 20 })
const plan = await explain(
  'keyword search',
  `SELECT ap.user_id FROM alumni_profiles ap
     JOIN users u ON u.id = ap.user_id
     LEFT JOIN privacy_settings ps ON ps.user_id = ap.user_id
    WHERE ${searchSql.where}
    ORDER BY ${searchSql.orderBy}
    LIMIT ${searchSql.limitParam} OFFSET ${searchSql.offsetParam}`,
  searchSql.params,
)

const width = Math.max(...results.map((r) => r.label.length))
console.log('directory query timings (budget %dms)\n', BUDGET_MS)
for (const r of results) {
  const status = r.ok ? 'PASS' : 'SLOW'
  console.log(
    `  ${status.padEnd(4)}  ${r.label.padEnd(width)}  ${String(r.ms).padStart(6)}ms  `
    + `${r.rows} rows / ${r.total} total`,
  )
}

console.log(`\nplan for ${plan.label}:`)
for (const line of plan.plan) console.log(`  ${line}`)

const slow = results.filter((r) => !r.ok)
if (slow.length) {
  console.error(
    `\n${slow.length} quer${slow.length === 1 ? 'y' : 'ies'} exceeded the budget: `
    + slow.map((r) => `${r.label} (${r.ms}ms)`).join(', '),
  )
}

console.log(
  '\nNote: pg_trgm is unavailable on PGlite, so migration 010 skipped its trigram\n'
  + 'indexes and the keyword/ILIKE cases above run as sequential scans. On stock\n'
  + 'PostgreSQL those indexes exist; re-run this script there before trusting the\n'
  + 'LIKE cases, and check the plan for "Bitmap Index Scan".',
)

await closePool()
await stopTestDatabase()

process.exit(slow.length ? 1 : 0)