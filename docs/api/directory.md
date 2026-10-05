# Alumni Directory API

The directory lists alumni profiles that their owners have chosen to publish. It
requires authentication; it is not a public, unauthenticated endpoint.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/alumni` | Search, filter, sort, paginate |
| `GET` | `/api/alumni/facets` | Distinct filter values with counts |
| `GET` | `/api/alumni/locations` | Locations for a map view |

`/api/alumni` serves three different things on one prefix, disambiguated by
shape: `/me` and `/me/*` are the caller's own profile routes, `/facets` and
`/locations` are the two helper endpoints, and everything else falls through to
the directory itself.

## Query parameters

| Parameter | Type | Notes |
| --- | --- | --- |
| `search` | string ≤120 | Keyword, see below |
| `graduationYear` | year | Exact match |
| `graduationYearFrom` | year | Inclusive lower bound |
| `graduationYearTo` | year | Inclusive upper bound |
| `major` | string | Case-insensitive exact match on major/department |
| `location` | string | Substring of location, city, region or country |
| `employer` | string | Substring of current company |
| `industry` | string | Case-insensitive exact match |
| `skills` | string | Comma-separated; matches members holding **any** |
| `openToMentor` | boolean | |
| `verifiedOnly` | boolean | Default `false` |
| `hasLocation` | boolean | Only members with coordinates |
| `page` | integer ≥1 | Default `1` |
| `limit` | integer 1–100 | Default `20` |
| `sort` | enum | `relevance`, `name`, `recent`, `graduation_year`, `company`, `industry` |
| `order` | enum | `asc` or `desc`, default `asc` |

All parameters are validated before any SQL is built. `sort` is an allow-list
rather than a column name, so it cannot be used to inject SQL through `ORDER BY`.
Out-of-range `page`/`limit` and unknown `sort` values are `422`.

## Response

```json
{
  "success": true,
  "data": [
    {
      "userId": "3f1b...",
      "name": "Ada Lovelace",
      "avatarUrl": "/uploads/photos/...",
      "memberSince": "2024-02-01T10:00:00.000Z",
      "verified": true,
      "verificationStatus": "VERIFIED",
      "openToMentor": true,
      "skills": [{ "id": 7, "name": "TypeScript", "category": "language", "proficiency": "advanced" }],
      "graduationYear": 2015,
      "degree": "BSc",
      "major": "Computer Science",
      "university": "LUMS",
      "currentCompany": "Acme",
      "jobTitle": "Senior Engineer",
      "industry": "Software",
      "location": "Lahore, Punjab, Pakistan",
      "country": "Pakistan"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50000,
    "totalPages": 2500,
    "hasNext": true,
    "hasPrev": false
  }
}
```

Email and phone are never in a directory response, whatever the owner's settings
are: the directory query does not select those columns at all.

## Facets and locations

`GET /api/alumni/facets` returns the distinct values for each filter dimension
with counts, so the filter controls can be built without a hard-coded list:

```json
{
  "graduationYear": [{ "value": 2015, "count": 420 }],
  "industry": [{ "value": "software", "count": 9100 }],
  "employer": [{ "value": "acme", "count": 33 }],
  "major": [{ "value": "computer science", "count": 12800 }],
  "country": [{ "value": "pakistan", "count": 22400 }]
}
```

Facet values are lowercased, matching the case-insensitive filters that consume
them.

`GET /api/alumni/locations?limit=50` returns grouped, lowercased locations with
counts, for a location autocomplete:

```json
[{ "location": "karachi", "count": 5100 }, { "location": "lahore", "count": 4400 }]
```

`limit` defaults to 50 and is capped at 500. Note that these are grouped city
names, not map points: a map would need per-member coordinates, which are withheld
for anyone with `show_location = false`.

Fields the owner has hidden are **absent** from the object, not `null`. A client
must not treat a missing `location` as `""`.

## Keyword search

`search` runs a full-text match over the concatenation of first name, last name,
company, job title and major using the `simple` configuration, so there is no
stop-word list and no stemming to surprise anyone. Tokens are matched as
prefixes, and input is tokenised on non-alphanumerics, so `to_tsquery` never sees
user syntax and cannot raise a syntax error.

When there is no full-text match, the same terms are retried as `ILIKE '%term%'`
so a partial or misspelt term returns something instead of nothing.

With a `search` term, `sort` is ignored and results are ordered by relevance, then
graduation year descending, then last name.

## Filtering semantics

- `skills` is an **any** match. Requiring all listed skills would make the
  `EXISTS` clause quadratic in the number of requested skills. Asking for
  `?skills=typescript,rust` returns members with either.
- `location` matches a substring of the composed `location`, or of `city`,
  `region` or `country`.
- `major` falls back to the legacy `department` column, so profiles created
  before Phase 2 still match.
- `graduationYear` and a range are not mutually exclusive; supplying both applies
  both.

## Privacy

Redaction happens in the database round trip, not in the client:

- Members who set `show_profile_in_directory` to false never appear, under any
  filter.
- Suspended or inactive accounts never appear.
- `show_location = false` removes location, city, region, country and
  coordinates.
- `show_employer = false` removes company, job title and industry.
- `show_mentorship_availability = false` removes `openToMentor`.

This is enforced in the `WHERE` clause, so an opted-out member cannot be reached
by a filter combination that happens to match them. There is a regression test
for exactly this: an unbracketed `OR` chain in the location filter once made
`AND`/`OR` precedence let a location match bypass the opt-out check and return
hidden members. Every filter's `OR` chain is parenthesised, and the test asserts
both the exclusion and that `meta.total` matches the returned rows.

## Performance

Measured with `npm run perf:directory`, which seeds 50,000 alumni, runs
`ANALYZE`, and times the real queries with a 1000ms budget. On PGlite:

| Query | Time |
| --- | --- |
| Unfiltered page 1 | ~192ms |
| Deep page (offset 45000) | ~256ms |
| Keyword search | ~462ms |
| Substring search (ILIKE fallback) | ~452ms |
| Graduation year range | ~27ms |
| Major filter | ~35ms |
| Location filter | ~66ms |
| Employer filter | ~32ms |
| Industry + openToMentor | ~38ms |
| Verified only | ~46ms |
| Sorted by graduation year | ~172ms |

Three structural decisions carry that:

- **The page is fetched in one statement.** `COUNT(*) OVER ()` returns the total
  alongside the page, so pagination costs no extra round trip.
- **Skills are fetched for the whole page in one statement.** A per-row lookup
  would be the classic N+1, and `?skills=` filters on the same table.
- **The directory indexes are not partial on `verification_status`.** They were
  partial at first, on the reasoning that verified rows are the subset worth
  indexing, but `verifiedOnly` defaults to `false` — so the *default* query
  matched no index and sorted the entire table. Dropping the predicate roughly
  halved the filter timings (`major` 74ms → 35ms, `industry` 85ms → 38ms,
  `location` 97ms → 66ms). `verifiedOnly` is now just one extra predicate on an
  index that serves both cases.

PGlite does not have `pg_trgm`, so migration 010 skips its trigram GIN indexes
and the keyword and ILIKE cases above run as sequential scans — which is exactly
why they are the two slowest. On stock PostgreSQL those indexes exist and the
planner switches to a bitmap index scan. Re-run the script against real
PostgreSQL before trusting the two search rows; the script prints the plan so
the difference is visible.

Migration 010 is deliberately guarded: it enables `pg_trgm` only when the
extension is actually installable and creates indexes only if the extension
ended up present, so the chain still applies on a server without it. The
directory degrades to sequential scans rather than failing to migrate.

## Sorting note

Deep pagination uses `OFFSET`, so page 2500 still has to walk 50,000 rows. That
is acceptable here and was measured at ~292ms, but if the directory grows well
past 50,000 members, a cursor on `(sort_key, user_id)` is the change to make.
The `ORDER BY` always ends with `ap.user_id ASC`, which gives a stable order for
paging and would make a keyset cursor straightforward.