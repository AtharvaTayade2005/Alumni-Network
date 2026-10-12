import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { connections, directory } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Pagination, Select, Spinner,
} from '../components/ui.jsx'

const PAGE_SIZE = 12

const emptyFilters = {
  search: '',
  graduationYear: '',
  industry: '',
  country: '',
  skills: '',
  openToMentor: false,
  verifiedOnly: false,
}

export default function Directory() {
  const { user } = useAuth()
  const [filters, setFilters] = useState(emptyFilters)
  const [applied, setApplied] = useState({ ...emptyFilters, page: 1 })
  const [state, setState] = useState({ loading: true, error: null })
  const [result, setResult] = useState({ rows: [], meta: null })
  const [filterOptions, setFilterOptions] = useState(null)
  const [busy, setBusy] = useState({})
  const [connectionStates, setConnectionStates] = useState({})
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    directory.filters()
      .then((response) => setFilterOptions(response.data))
      .catch(() => setFilterOptions(null))
  }, [])

  const search = useCallback(async (criteria) => {
    setState({ loading: true, error: null })
    try {
      const params = {
        search: criteria.search,
        graduationYear: criteria.graduationYear,
        industry: criteria.industry,
        country: criteria.country,
        skills: criteria.skills,
        openToMentor: criteria.openToMentor || undefined,
        verifiedOnly: criteria.verifiedOnly || undefined,
        limit: PAGE_SIZE,
        page: criteria.page,
      }
      const response = await directory.search(params)
      const rows = response.data ?? []
      setResult({ rows, meta: response.meta ?? null })
      setConnectionStates((prev) => {
        const next = { ...prev }
        for (const person of rows) {
          if (person.connectionState) {
            next[person.id] = person.connectionState
          }
        }
        return next
      })
      setState({ loading: false, error: null })
    } catch (error) {
      setResult({ rows: [], meta: null })
      setState({ loading: false, error })
    }
  }, [])

  useEffect(() => { search(applied) }, [applied, search])

  function onSubmit(event) {
    event.preventDefault()
    setApplied({ ...filters, page: 1 })
  }

  function reset() {
    setFilters(emptyFilters)
    setApplied({ ...emptyFilters, page: 1 })
  }

  function goToPage(page) {
    setApplied((prev) => ({ ...prev, page }))
  }

  async function connect(person) {
    const userId = person.id
    setBusy((prev) => ({ ...prev, [userId]: 'request' }))
    setNotice(null)
    try {
      await connections.request(userId)
      setConnectionStates((prev) => ({ ...prev, [userId]: 'pending_outgoing' }))
      setNotice({ tone: 'success', text: `Connection request sent to ${person.name}.` })
      await search(applied)
    } catch (err) {
      const msg = err.message || ''
      if (
        msg.toLowerCase().includes('already sent') ||
        msg.toLowerCase().includes('already exists') ||
        err.status === 409
      ) {
        setConnectionStates((prev) => ({ ...prev, [userId]: 'pending_outgoing' }))
        setNotice({ tone: 'info', text: `Connection request is already pending with ${person.name}.` })
      } else if (msg.toLowerCase().includes('already connected')) {
        setConnectionStates((prev) => ({ ...prev, [userId]: 'connected' }))
        setNotice({ tone: 'info', text: `You are already connected with ${person.name}.` })
      } else {
        setNotice({ tone: 'error', text: err.message || 'Failed to send connection request.' })
      }
    } finally {
      setBusy((prev) => ({ ...prev, [userId]: null }))
    }
  }

  const activeCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => (
      key !== 'search' && Boolean(value)
    )).length,
    [filters],
  )

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">02 &mdash; DIRECTORY</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">ALUMNI DIRECTORY</h1>
        <p className="mt-2 text-sm text-swiss-muted">
          Search across the network by name, company, skill, or location.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-swiss-text">Filters</h2>
              {activeCount > 0 ? (
                <p className="mt-0.5 text-xs text-swiss-label">
                  {activeCount} active
                </p>
              ) : null}
            </div>

            <Field label="Search">
              <Input
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Name, company, keyword"
              />
            </Field>

            <Field label="Graduation year">
              <Select
                value={filters.graduationYear}
                onChange={(e) => setFilters({ ...filters, graduationYear: e.target.value })}
              >
                <option value="">Any year</option>
                {(filterOptions?.graduationYears ?? []).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </Select>
            </Field>

            <Field label="Industry">
              <Select
                value={filters.industry}
                onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
              >
                <option value="">Any industry</option>
                {(filterOptions?.industries ?? []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </Field>

            <Field label="Country">
              <Select
                value={filters.country}
                onChange={(e) => setFilters({ ...filters, country: e.target.value })}
              >
                <option value="">Anywhere</option>
                {(filterOptions?.countries ?? []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </Field>

            <Field label="Skill" hint="One skill">
              <Input
                value={filters.skills}
                onChange={(e) => setFilters({ ...filters, skills: e.target.value })}
                placeholder="e.g. React"
              />
            </Field>

            <div className="space-y-2.5">
              <Checkbox
                label="Open to mentoring"
                checked={filters.openToMentor}
                onChange={(e) => setFilters({ ...filters, openToMentor: e.target.checked })}
              />
              <Checkbox
                label="Verified members only"
                checked={filters.verifiedOnly}
                onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">Search</Button>
              <Button variant="secondary" onClick={reset} type="button">Clear</Button>
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden">
          {notice && (
            <div className="p-4 border-b border-swiss-border">
              <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Alert>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-swiss-border px-5 py-3">
            <p className="text-sm text-swiss-muted">
              {state.loading ? 'Searching' : (
                <>
                  <span className="font-semibold text-swiss-text">{result.meta?.total ?? 0}</span>{' '}
                  member{result.meta?.total === 1 ? '' : 's'} found
                </>
              )}
            </p>
          </div>

          {state.error ? <ErrorState error={state.error} onRetry={() => search(applied)} /> : null}

          {!state.error && state.loading ? <LoadingBlock rows={6} /> : null}

          {!state.error && !state.loading && result.rows.length === 0 ? (
            <EmptyState
              title="No members match those filters"
              description="Try widening the year, industry, or location."
              action={<Button variant="secondary" onClick={reset}>Clear filters</Button>}
            />
          ) : null}

          {!state.error && !state.loading && result.rows.length > 0 ? (
            <>
              <ul className="divide-y divide-swiss-border">
                {result.rows.map((person) => {
                  const status = connectionStates[person.id] || person.connectionState || 'none'
                  const isSelf = person.id === user?.id || status === 'self'

                  return (
                    <li key={person.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-4">
                        <Avatar name={person.name} src={person.avatarUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/alumni/${person.id}`}
                              className="font-medium text-swiss-text underline-offset-2 hover:underline"
                            >
                              {person.name}
                            </Link>
                            {person.verified ? <Badge tone="green">Verified</Badge> : null}
                            {person.openToMentor ? (
                              <Badge tone="blue">Open to mentor</Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-sm text-swiss-muted">
                            {[person.currentPosition, person.currentCompany]
                              .filter(Boolean).join(' at ') || 'No role listed'}
                          </p>
                          <p className="mt-0.5 text-xs text-swiss-label">
                            {[
                              person.degree,
                              person.graduationYear ? `Class of ${person.graduationYear}` : null,
                              person.yearOfStudy ? `Year ${person.yearOfStudy}` : null,
                              [person.city, person.country].filter(Boolean).join(', '),
                            ].filter(Boolean).join(' · ')}
                          </p>
                          {person.skills?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {person.skills.slice(0, 6).map((skill) => (
                                <Badge key={skill.id ?? skill.name}>{skill.name}</Badge>
                              ))}
                              {person.skills.length > 6 ? (
                                <Badge tone="slate">+{person.skills.length - 6}</Badge>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {isSelf ? (
                            <span className="inline-block px-2 py-1 text-[11px] font-mono uppercase font-bold text-swiss-muted bg-swiss-surface-alt border border-swiss-border rounded-xs">
                              You
                            </span>
                          ) : status === 'connected' ? (
                            <Badge tone="green">CONNECTED</Badge>
                          ) : status === 'pending_outgoing' ? (
                            <Badge tone="amber">PENDING</Badge>
                          ) : status === 'pending_incoming' ? (
                            <Badge tone="blue">REQUEST RECEIVED</Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => connect(person)}
                              disabled={busy[person.id] === 'request'}
                            >
                              {busy[person.id] === 'request' ? <Spinner /> : 'Connect'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <Pagination meta={result.meta} onChange={goToPage} />
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
