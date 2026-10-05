# Privacy

Privacy in this system is a **server-side serialization rule**, not a client-side
hiding behaviour. The database stores what a member entered; the API decides what
any given viewer is allowed to receive. No client is trusted to filter the
response, and no endpoint returns a withheld field with a `null` value.

## Settings

| Column | Default | Effect when false |
| --- | --- | --- |
| `show_email` | `false` | Email omitted from the profile response |
| `show_phone` | `false` | Phone omitted |
| `show_location` | `true` | Location, city, region, country and coordinates omitted |
| `show_employer` | `true` | Company, job title and industry omitted |
| `show_social_links` | `true` | All social links omitted |
| `show_profile_in_directory` | `true` | Profile absent from the directory and `404` on direct lookup |
| `show_mentorship_availability` | `true` | Mentorship opt-in flags omitted |
| `allow_connection_requests` | `true` | Connection requests refused |
| `allow_messages_from` | `connections` | Who may message: `everyone`, `connections`, `nobody` |

Contact details default to **hidden**. Location, employer, links and directory
listing default to **visible**, because an alumni directory that lists nobody by
default is not a directory. A member who wants the opposite flips each switch;
nothing about being an alumnus implies consent to publish contact details.

```http
GET  /api/profiles/me/privacy
PATCH /api/profiles/me/privacy
{ "show_location": false, "show_email": false }
```

A `PATCH` applies only the keys present. The full set is returned on `GET`, with
the database column names, so an unset key is distinguishable from a `false` one
by comparing against the defaults above.

## Withheld fields are absent, not null

This is the rule most easily broken by accident, so it is worth stating
explicitly. When a field is withheld:

```json
// show_location = false
{ "userId": "3f1b...", "name": "Ada Lovelace", "graduationYear": 2015 }
```

There is no `"location": null`. The distinction matters: `null` says "we know
this member has no location", while absence says "we are not telling you". A
member who has hidden their location should be indistinguishable from one who
never set it.

The alias helper that adds camelCase names to the response checks
`!== undefined` before copying each key for exactly this reason. An earlier
version defaulted a missing key back to `null`, which silently undid redaction
and leaked that a withheld field existed. Two regression tests assert that a
withheld `location` is `undefined` and not `null`.

## Who bypasses what

| Viewer | Directory listing | Withheld fields | Contact details |
| --- | --- | --- | --- |
| The owner | yes | never withheld | yes |
| `ADMIN` | yes | never withheld | yes |
| `MODERATOR` | yes | never withheld | yes |
| Any other member | if listed | per settings | if `show_email`/`show_phone` |

The owner always sees their own profile in full, including the `privacy` object
itself. On someone else's profile, `privacy` is `null` — a member cannot read
another member's settings, only the result of them.

## Hidden profiles return 404, not 403

`GET /api/profiles/:userId` for a member with `show_profile_in_directory = false`
returns `404`, the same response as an id that does not exist. `403` would confirm
the account exists and leak the fact that it has been hidden.

## Where redaction happens

| Surface | Mechanism |
| --- | --- |
| `GET /profiles/:userId`, `/alumni/:userId`, `/students/:userId` | `privacyService.redact*` per section |
| `GET /profiles/me` | Nothing withheld; the owner sees everything |
| `GET /alumni` | Redacted per row; privacy flags come back on the row itself |
| `GET /alumni/facets` | Per-dimension filtering; see below |
| `GET /alumni/locations` | Filters on `show_location` |
| Admin verification queue | `ADMIN` only; sees email to contact the member |

Redaction functions copy and delete. They never mutate the row they are given,
so a redacted response cannot affect a later, less restricted one within the same
request.

### Facets need privacy too

Facets aggregate over the entire population, which makes them an easy place for
privacy to leak. A naive implementation returns the company name of every member
in the system, including those who set `show_employer = false`, through an
endpoint that looks like harmless reference data.

The rules are therefore per-dimension:

| Dimension | Filter |
| --- | --- |
| `graduationYear`, `major` | Listed in the directory |
| `industry`, `employer` | Listed **and** `show_employer` |
| `country` | Listed **and** `show_location` |

`getLocations` filters on `show_location` and directory visibility for the same
reason. Regression tests cover both.

## Contact details are never in a directory response

Independent of every setting, the directory query does not select `email` or
`phone` at all. A member who sets `show_email = true` is visible by email on their
profile page, which is a deliberate act, but their address is never handed to a
list of fifty other members as a side effect of browsing.

## What this does not cover

Honest limits of the current implementation:

- **Profile photos are not covered by a privacy switch.** The photo path is not
  served statically (`GET /uploads/...` is `404` for everyone) and reads are
  meant to go through an authorized route, but there is no
  `show_profile_photo` setting and no test asserting one.
- **A hidden profile is still visible to someone who already has its id**, in the
  sense that the id resolves for an `ADMIN` or `MODERATOR`. That is intended.
- **Withheld fields are still stored in the database.** Redaction is a read-time
  rule. Anyone with database access sees everything; this system does not encrypt
  per-field data at rest.