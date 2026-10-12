import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { connections, directory } from '../services/api.js'
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
  const [pendingRequests, setPendingRequests] = useState([])
  const [filterOptions, setFilterOptions] = useState(null)
  const [busy, setBusy] = useState({})
  const [message, setMessage] = useState(null)

  useEffect(() => {
    directory.filters()
      .then((response) => setFilterOptions(response.data))
      .catch(() => setFilterOptions(null))
  }, [])

  const loadPending = useCallback(async () => {
    try {
      const res = await connections.pending()
      setPendingRequests(res.data ?? [])
    } catch {
      // Keep silent on background pending requests read error
    }
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
      const [dirRes] = await Promise.all([
        directory.search(params),
        loadPending(),
      ])
      setResult({ rows: dirRes.data ?? [], meta: dirRes.meta ?? null })
      setState({ loading: false, error: null })
    } catch (error) {
      setResult({ rows: [], meta: null })
      setState({ loading: false, error })
    }
  }, [loadPending])

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

  async function handleConnect(userId, name) {
    setBusy((prev) => ({ ...prev, [userId]: true }))
    setMessage(null)
    try {
      await connections.request(userId)
      // Optimistically update the connection state on this row
      setResult((prev) => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.id === userId ? { ...row, connectionState: 'pending_outgoing' } : row
        )),
      }))
      setMessage({ tone: 'success', text: `Connection request sent to ${name}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to send connection request.' })
    } finally {
      setBusy((prev) => ({ ...prev, [userId]: false }))
    }
  }

  async function handleAccept(connectionId, userId, name) {
    const key = userId || connectionId
    setBusy((prev) => ({ ...prev, [key]: true }))
    setMessage(null)
    try {
      await connections.respond(connectionId, 'accept')
      setResult((prev) => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.id === userId || row.connectionId === connectionId
            ? { ...row, connectionState: 'connected' }
            : row
        )),
      }))
      setPendingRequests((prev) => prev.filter((p) => p.id !== connectionId))
      setMessage({ tone: 'success', text: `You are now connected with ${name}!` })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to accept connection.' })
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function handleDecline(connectionId, userId, name) {
    const key = userId || connectionId
    setBusy((prev) => ({ ...prev, [key]: true }))
    setMessage(null)
    try {
      await connections.respond(connectionId, 'decline')
      setResult((prev) => ({
        ...prev,
        rows: prev.rows.map((row) => (
          row.id === userId || row.connectionId === connectionId
            ? { ...row, connectionState: 'none', connectionId: null }
            : row
        )),
      }))
      setPendingRequests((prev) => prev.filter((p) => p.id !== connectionId))
      setMessage({ tone: 'info', text: `Connection request from ${name} declined.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to decline connection.' })
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }))
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
          Search across the network by name, company, skill, or location. Connect with alumni and students.
        </p>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Incoming Connection Requests Banner */}
      {pendingRequests.length > 0 && (
        <Card className="border-l-4 border-l-blue-600 bg-blue-950/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm text-swiss-text">
                INCOMING CONNECTION REQUESTS ({pendingRequests.length})
              </p>
              <p className="text-xs text-swiss-muted mt-0.5">
                Fellow members waiting to connect with you.
              </p>
            </div>
            <Badge tone="blue">ACTION REQUIRED</Badge>
          </div>
          <div className="divide-y divide-swiss-border">
            {pendingRequests.map((req) => (
              <div key={req.id} className="pt-3 pb-2 first:pt-1 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={req.peer?.name} src={req.peer?.avatarUrl} size="sm" />
                  <div>
                    <Link to={`/alumni/${req.peer?.id}`} className="font-semibold text-xs text-swiss-text hover:underline">
                      {req.peer?.name}
                    </Link>
                    <p className="text-[11px] text-swiss-muted">
                      {req.peer?.currentPosition || req.peer?.degree || 'Member'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={busy[req.peer?.id || req.id]}
                    onClick={() => handleAccept(req.id, req.peer?.id, req.peer?.name)}
                  >
                    {busy[req.peer?.id || req.id] ? <Spinner /> : 'Accept'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy[req.peer?.id || req.id]}
                    onClick={() => handleDecline(req.id, req.peer?.id, req.peer?.name)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                  const isSelf = person.id === user?.id || person.connectionState === 'self'
                  const matchingPending = pendingRequests.find((p) => p.peer?.id === person.id)
                  const connectionState = person.connectionState || (matchingPending ? 'pending_incoming' : 'none')
                  const connectionId = person.connectionId || matchingPending?.id

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

                        {/* Connection Action Buttons */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isSelf ? (
                            <Badge tone="slate">You</Badge>
                          ) : connectionState === 'connected' ? (
                            <div className="flex items-center gap-2">
                              <Badge tone="green">Connected</Badge>
                              <Link to={`/messages/${person.id}`}>
                                <Button size="sm" variant="ghost">Message</Button>
                              </Link>
                            </div>
                          ) : connectionState === 'pending_outgoing' ? (
                            <Button size="sm" variant="secondary" disabled>
                              Pending
                            </Button>
                          ) : connectionState === 'pending_incoming' ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => handleAccept(connectionId, person.id, person.name)}
                                disabled={busy[person.id]}
                              >
                                {busy[person.id] ? <Spinner /> : 'Accept'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDecline(connectionId, person.id, person.name)}
                                disabled={busy[person.id]}
                              >
                                Decline
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleConnect(person.id, person.name)}
                              disabled={busy[person.id]}
                            >
                              {busy[person.id] ? <Spinner /> : 'Connect'}
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
