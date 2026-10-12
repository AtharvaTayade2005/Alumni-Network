import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { mentorship } from '../services/api.js'
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState,
  Field, Input, LoadingBlock, Select, Textarea, cx,
} from '../components/ui.jsx'

/**
 * Mentorship serves three audiences on one screen: finding a mentor, answering
 * incoming and tracking sent requests, and the active mentorship relationships
 * you are currently participating in. The active tab is kept in the query string
 * so the view survives a refresh and can be linked to.
 */

const STACK = 'flex flex-col gap-6'
const ROW = 'flex flex-wrap items-center gap-2'
const GRID = 'grid gap-4 md:grid-cols-2'
const MUTED = 'text-sm text-swiss-muted'
const MUTED_SMALL = 'text-xs text-swiss-label'
const FLUSH = 'rounded-sm border border-swiss-border bg-swiss-surface p-5'

const TABS = [
  ['find', 'Find a mentor'],
  ['incoming', 'Requests'],
  ['active', 'My mentorships'],
]

const MODES = [
  ['video', 'Video call'],
  ['chat', 'Chat'],
  ['in_person', 'In person'],
  ['any', 'No preference'],
]

const STATUS_TONES = {
  active: 'green',
  completed: 'blue',
  ended: 'slate',
  pending: 'amber',
  accepted: 'green',
  declined: 'slate',
  cancelled: 'slate',
}

function tabClass(isActive) {
  return cx(
    'inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-slate-900 text-white font-bold'
      : 'text-swiss-muted hover:bg-swiss-surface hover:text-swiss-text',
  )
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function PersonHeading({ peer, caption, to }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={peer?.name} src={peer?.avatarUrl} />
      <div className="min-w-0">
        {to ? (
          <Link to={to} className="block truncate font-semibold text-swiss-text hover:underline">
            {peer?.name ?? 'Member'}
          </Link>
        ) : (
          <span className="block truncate font-semibold text-swiss-text">
            {peer?.name ?? 'Member'}
          </span>
        )}
        <p className={cx('truncate', MUTED_SMALL)}>{caption}</p>
      </div>
    </div>
  )
}

function DetailList({ items }) {
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-3">
      {items.filter(Boolean).map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-medium text-swiss-muted">{term}</dt>
          <dd className="text-swiss-muted">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The request form shown inside a mentor card. */
function RequestForm({ mentor, onDone, onCancel }) {
  const [form, setForm] = useState({
    careerGoal: '',
    areaOfInterest: '',
    message: '',
    preferredMode: 'video',
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await mentorship.request({ mentorId: mentor.id, ...form })
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={STACK} onSubmit={submit}>
      {error ? <Alert tone="error">{error.message}</Alert> : null}
      <Field
        label="What do you want to achieve?"
        hint="A sentence or two. At least 20 characters."
        required
      >
        <Textarea rows={3} value={form.careerGoal} onChange={set('careerGoal')} maxLength={1000} required />
      </Field>
      <Field label="Area of interest">
        <Input
          value={form.areaOfInterest}
          onChange={set('areaOfInterest')}
          maxLength={200}
          placeholder="e.g. Distributed systems, product management"
        />
      </Field>
      <Field label="How would you like to meet?">
        <Select value={form.preferredMode} onChange={set('preferredMode')}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Introduce yourself">
        <Textarea
          rows={2}
          value={form.message}
          onChange={set('message')}
          maxLength={1000}
          placeholder="Brief introduction for the mentor (optional)"
        />
      </Field>
      <div className={ROW}>
        <Button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send request'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  )
}

function MentorCard({ mentor, onRequested }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const full = mentor.openSlots <= 0

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={mentor}
          to={`/alumni/${mentor.id}`}
          caption={[mentor.currentPosition, mentor.currentCompany, mentor.graduationYear ? `Class of ${mentor.graduationYear}` : null]
            .filter(Boolean).join(' at ') || 'Alumni mentor'}
        />
        <Badge tone={full ? 'slate' : 'green'}>
          {full ? 'No open slots' : `${mentor.openSlots} open slot${mentor.openSlots === 1 ? '' : 's'}`}
        </Badge>
      </div>

      {mentor.bio ? <p className={cx('mb-3', MUTED)}>{mentor.bio}</p> : null}
      {mentor.industry ? <p className={cx('mb-3', MUTED_SMALL)}>{mentor.industry}</p> : null}

      {done ? (
        <Alert tone="success" title="Request sent">
          {mentor.name} has been notified. You can track this under the Requests tab.
        </Alert>
      ) : open ? (
        <RequestForm
          mentor={mentor}
          onCancel={() => setOpen(false)}
          onDone={() => { setOpen(false); setDone(true); onRequested() }}
        />
      ) : (
        <div className={ROW}>
          <Button onClick={() => setOpen(true)} disabled={full}>Request mentorship</Button>
          <Link to={`/alumni/${mentor.id}`}>
            <Button variant="secondary">View profile →</Button>
          </Link>
        </div>
      )}
    </article>
  )
}

function RequestCard({ request, onRespond, onCancel, busy }) {
  const [note, setNote] = useState('')
  const incoming = request.direction === 'incoming'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={request.peer}
          to={`/alumni/${request.peer?.id}`}
          caption={incoming
            ? 'Requested your mentorship'
            : `You requested mentorship from ${request.peer?.name ?? 'them'}`}
        />
        <Badge tone={STATUS_TONES[request.status] ?? 'slate'}>{request.status.toUpperCase()}</Badge>
      </div>

      <DetailList items={[
        ['Career goal', request.careerGoal],
        ['Focus area', request.areaOfInterest],
        ['Preferred mode', request.preferredMode],
        ['Sent', formatDate(request.createdAt)],
      ]} />

      {request.message ? (
        <p className="mt-3 border-l-2 border-swiss-border pl-3 text-sm italic text-swiss-muted">
          &ldquo;{request.message}&rdquo;
        </p>
      ) : null}

      {incoming && request.status === 'pending' ? (
        <div className={cx(STACK, 'mt-4')}>
          <Field label="Response note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="e.g. Happy to help! Let's connect on Tuesdays."
            />
          </Field>
          <div className={ROW}>
            <Button onClick={() => onRespond(request.id, 'accepted', note)} disabled={busy}>
              {busy ? 'Processing...' : 'Accept request'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRespond(request.id, 'declined', note)}
              disabled={busy}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : null}

      {!incoming && request.status === 'pending' ? (
        <div className={cx(ROW, 'mt-4')}>
          <Button variant="ghost" onClick={() => onCancel(request.id)} disabled={busy}>
            {busy ? 'Cancelling...' : 'Cancel request'}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function MentorshipCard({ item, onEnd, onComplete, busy }) {
  const mine = item.role === 'mentor'
  const theyAre = [item.peer?.currentPosition, item.peer?.currentCompany]
    .filter(Boolean).join(' at ')

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={item.peer}
          to={`/alumni/${item.peer?.id}`}
          caption={mine ? 'You are mentoring' : 'You are being mentored'}
        />
        <Badge tone={STATUS_TONES[item.status] ?? 'slate'}>{item.status.toUpperCase()}</Badge>
      </div>

      <DetailList items={[
        ['Started', formatDate(item.startedAt)],
        ['Ended', item.endedAt ? formatDate(item.endedAt) : null],
        ['They are', theyAre],
        ['Reason', item.endReason],
      ]} />

      {item.status === 'active' ? (
        <div className={cx(ROW, 'mt-4')}>
          <Link to={`/messages/${item.peer?.id}`}>
            <Button size="sm">Message</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => onComplete(item.id)} disabled={busy}>
            Mark complete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEnd(item.id)} disabled={busy}>
            End mentorship
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export default function Mentorship() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState(
    () => new URLSearchParams(location.search).get('tab') || 'find',
  )
  const [state, setState] = useState({
    mentors: [], requests: [], mentorships: [], loading: true, error: null,
  })
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [mentors, requests, mentorships] = await Promise.all([
        mentorship.mentors({ limit: 20, search: search || undefined }),
        mentorship.requests({ limit: 50 }),
        mentorship.mentorships({ limit: 50 }),
      ])
      setState({
        mentors: mentors.data ?? [],
        requests: requests.data ?? [],
        mentorships: mentorships.data ?? [],
        loading: false,
        error: null,
      })
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error }))
    }
  }, [search])

  useEffect(() => { load() }, [load])

  function changeTab(next) {
    setTab(next)
    navigate({ pathname: '/mentorship', search: `?tab=${next}` }, { replace: true })
  }

  async function act(id, fn, successMessage) {
    setBusyId(id)
    setNotice(null)
    try {
      await fn()
      setNotice({ tone: 'success', text: successMessage })
      await load()
    } catch (error) {
      setNotice({ tone: 'error', text: error.message })
    } finally {
      setBusyId(null)
    }
  }

  const incomingRequests = state.requests.filter((r) => r.direction === 'incoming')
  const outgoingRequests = state.requests.filter((r) => r.direction === 'outgoing')
  const pendingIncomingCount = incomingRequests.filter((r) => r.status === 'pending').length
  const activeCount = state.mentorships.filter((m) => m.status === 'active').length

  const badges = { incoming: pendingIncomingCount, active: activeCount }

  return (
    <div className={STACK}>
      <header className="border-b border-swiss-border pb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">04 &mdash; MENTORSHIP</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">MENTORSHIP</h1>
        <p className="mt-2 text-sm text-swiss-muted max-w-2xl leading-relaxed">
          Connect with industry leaders for 1-on-1 career guidance, portfolio reviews, and graduate school advising.
        </p>
      </header>

      {notice ? (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Alert>
      ) : null}

      {/* Tabs Navigation */}
      <nav className={ROW} role="tablist">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tabClass(tab === value)}
            onClick={() => changeTab(value)}
          >
            {label}
            {badges[value] > 0 ? <Badge tone="amber">{badges[value]}</Badge> : null}
          </button>
        ))}
      </nav>

      {state.error ? <Card><ErrorState error={state.error} onRetry={load} /></Card> : null}

      {/* TAB 1: FIND A MENTOR */}
      {tab === 'find' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">Find a mentor</h2>
            <p className="text-sm text-swiss-muted mt-1">
              Explore experienced alumni and faculty, review their expertise, and request guidance for your career or studies.
            </p>
          </div>

          <Card>
            <form className={ROW} onSubmit={(e) => { e.preventDefault(); load() }}>
              <div className="min-w-64 flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, company, skill or industry"
                  aria-label="Search mentors"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
          </Card>

          {state.loading ? <Card><LoadingBlock rows={4} label="Finding available mentors" /></Card> : null}

          {!state.loading && state.mentors.length === 0 ? (
            <Card>
              <EmptyState
                title="No mentors available"
                description="Nobody matches that search query yet. Try a broader search term or clear the filter."
              />
            </Card>
          ) : null}

          <div className={GRID}>
            {state.mentors.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} onRequested={load} />
            ))}
          </div>
        </div>
      ) : null}

      {/* TAB 2: REQUESTS (INCOMING & SENT) */}
      {tab === 'incoming' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">Mentorship Requests</h2>
            <p className="text-sm text-swiss-muted mt-1">
              Track mentorship requests you&apos;ve sent and respond to requests you&apos;ve received.
            </p>
          </div>

          {state.loading ? <Card><LoadingBlock rows={4} label="Loading mentorship requests" /></Card> : null}

          {!state.loading && (
            <>
              {/* Section 1: Incoming requests received by the user */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-swiss-border pb-2">
                  <h3 className="text-xs font-bold font-mono tracking-widest text-swiss-text uppercase">
                    INCOMING REQUESTS ({incomingRequests.length})
                  </h3>
                  <span className="text-[11px] font-mono text-swiss-label">Scholars seeking your guidance</span>
                </div>

                {incomingRequests.length === 0 ? (
                  <Card className="p-6">
                    <EmptyState
                      title="No incoming requests"
                      description="You have no pending mentorship requests awaiting your response."
                    />
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {incomingRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        busy={busyId === request.id}
                        onRespond={(id, status, note) => act(
                          id,
                          () => mentorship.respond(id, { status, responseNote: note || undefined }),
                          status === 'accepted' ? 'Mentorship accepted' : 'Request declined',
                        )}
                        onCancel={(id) => act(id, () => mentorship.cancel(id), 'Request cancelled')}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Sent requests initiated by the user */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between border-b border-swiss-border pb-2">
                  <h3 className="text-xs font-bold font-mono tracking-widest text-swiss-text uppercase">
                    SENT REQUESTS ({outgoingRequests.length})
                  </h3>
                  <span className="text-[11px] font-mono text-swiss-label">Requests you sent to mentors</span>
                </div>

                {outgoingRequests.length === 0 ? (
                  <Card className="p-6">
                    <EmptyState
                      title="No sent requests"
                      description="You haven't sent any mentorship requests yet."
                      action={<Button variant="secondary" onClick={() => changeTab('find')}>Find a mentor →</Button>}
                    />
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {outgoingRequests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        busy={busyId === request.id}
                        onRespond={(id, status, note) => act(
                          id,
                          () => mentorship.respond(id, { status, responseNote: note || undefined }),
                          status === 'accepted' ? 'Mentorship accepted' : 'Request declined',
                        )}
                        onCancel={(id) => act(id, () => mentorship.cancel(id), 'Request cancelled')}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* TAB 3: MY MEMBERSHIPS */}
      {tab === 'active' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">My Mentorships</h2>
            <p className="text-sm text-swiss-muted mt-1">
              Manage your active mentoring relationships and revisit the people guiding your progress.
            </p>
          </div>

          {state.loading ? <Card><LoadingBlock rows={3} label="Loading active mentorships" /></Card> : null}

          {!state.loading && state.mentorships.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="No mentorships yet"
                description="Accept an incoming request or have a mentor accept your request to begin."
                action={<Button onClick={() => changeTab('find')}>Find a mentor →</Button>}
              />
            </Card>
          ) : null}

          <div className="space-y-4">
            {state.mentorships.map((item) => (
              <MentorshipCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onComplete={(id) => act(id, () => mentorship.complete(id), 'Mentorship marked as complete')}
                onEnd={(id) => act(id, () => mentorship.end(id), 'Mentorship ended')}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
