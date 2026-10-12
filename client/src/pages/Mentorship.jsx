import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { mentorship } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState,
  Field, Input, LoadingBlock, Select, Textarea, cx,
} from '../components/ui.jsx'

/**
 * Mentorship serves three audiences on one screen: finding a mentor, answering
 * incoming requests, and the mentorships you are already part of. The active
 * tab is kept in the query string so the view survives a refresh and can be
 * linked to.
 */

const STACK = 'flex flex-col gap-6'
const ROW = 'flex flex-wrap items-center gap-2'
const GRID = 'grid gap-4 md:grid-cols-2'
const MUTED = 'text-sm text-swiss-muted'
const MUTED_SMALL = 'text-xs text-swiss-label'
const FLUSH = 'rounded-sm border border-swiss-border bg-swiss-surface p-5 border border-swiss-border'

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
      ? 'bg-slate-900 text-white'
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
      {error ? <Alert>{error.message}</Alert> : null}
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
          placeholder="Engineering management"
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
          placeholder="Optional"
        />
      </Field>
      <div className={ROW}>
        <Button type="submit" disabled={busy}>{busy ? 'Sending' : 'Send request'}</Button>
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
          caption={[mentor.currentPosition, mentor.currentCompany, mentor.graduationYear]
            .filter(Boolean).join(' at ') || 'Alumni mentor'}
        />
        <Badge tone={full ? 'slate' : 'green'}>
          {full ? 'No open slots' : `${mentor.openSlots} open`}
        </Badge>
      </div>

      {mentor.bio ? <p className={cx('mb-3', MUTED)}>{mentor.bio}</p> : null}
      {mentor.industry ? <p className={cx('mb-3', MUTED_SMALL)}>{mentor.industry}</p> : null}

      {done ? (
        <Alert tone="success" title="Request sent">
          {mentor.name} has been notified. You will hear back here.
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
        </div>
      )}
    </article>
  )
}

function RequestCard({ request, onRespond, onCancel, busy, isProfessor }) {
  const [note, setNote] = useState('')
  const incoming = request.direction === 'incoming'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={request.peer}
          to={request.peer?.id ? `/messages/${request.peer.id}` : undefined}
          caption={incoming
            ? (isProfessor ? `Student Advising (${request.peer?.currentCompany || 'Enrolled Student'})` : 'Wants to mentor you')
            : `You asked ${request.peer?.name ?? 'them'} to mentor you`}
        />
        <Badge tone={STATUS_TONES[request.status?.toLowerCase()] ?? 'slate'}>{request.status?.toUpperCase()}</Badge>
      </div>

      <DetailList items={[
        ['Candidate', request.peer?.name],
        ['Program / Cohort', request.peer?.currentCompany || 'Enrolled Student'],
        ['Career goal', request.careerGoal],
        ['Focus', request.areaOfInterest],
        ['Preferred mode', request.preferredMode],
        ['Sent', formatDate(request.createdAt)],
      ]} />

      {request.message ? (
        <p className="mt-3 border-l-2 border-swiss-border pl-3 text-sm italic text-swiss-muted">
          &ldquo;{request.message}&rdquo;
        </p>
      ) : null}

      {incoming && request.status?.toLowerCase() === 'pending' ? (
        <div className={cx(STACK, 'mt-4')}>
          <Field label="Reply Note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="e.g. Glad to guide you. Let's schedule an advising session."
            />
          </Field>
          <div className={ROW}>
            <Button onClick={() => onRespond(request.id, 'accepted', note)} disabled={busy}>
              {isProfessor ? 'Accept Advising' : 'Accept'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRespond(request.id, 'declined', note)}
              disabled={busy}
            >
              Decline
            </Button>
            {request.peer?.id && (
              <Link to={`/messages/${request.peer.id}`}>
                <Button variant="ghost">Message Student</Button>
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {!incoming && request.status?.toLowerCase() === 'pending' ? (
        <div className={cx(ROW, 'mt-4')}>
          <Button variant="ghost" onClick={() => onCancel(request.id)} disabled={busy}>
            Cancel request
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function MentorshipCard({ item, onEnd, onComplete, busy, isProfessor }) {
  const mine = item.role === 'mentor'
  const theyAre = [item.peer?.currentPosition, item.peer?.currentCompany]
    .filter(Boolean).join(' at ')

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={item.peer}
          to={item.peer?.id ? `/messages/${item.peer.id}` : undefined}
          caption={mine
            ? (isProfessor ? `Student Mentee · ${item.peer?.currentCompany || 'Undergraduate'}` : 'You are mentoring')
            : 'You are being mentored'}
        />
        <Badge tone={STATUS_TONES[item.status?.toLowerCase()] ?? 'slate'}>{item.status?.toUpperCase()}</Badge>
      </div>

      <DetailList items={[
        ['Started', formatDate(item.startedAt)],
        ['Ended', item.endedAt ? formatDate(item.endedAt) : null],
        ['Affiliation', theyAre || item.peer?.currentCompany || 'Enrolled Student'],
        ['Reason', item.endReason],
      ]} />

      <div className={cx(ROW, 'mt-4')}>
        {item.peer?.id && (
          <Link to={`/messages/${item.peer.id}`}>
            <Button size="sm" variant="secondary">Message Student</Button>
          </Link>
        )}
        {item.status?.toLowerCase() === 'active' ? (
          <>
            <Button variant="secondary" onClick={() => onComplete(item.id)} disabled={busy}>
              Mark complete
            </Button>
            <Button variant="ghost" onClick={() => onEnd(item.id)} disabled={busy}>
              End mentorship
            </Button>
          </>
        ) : null}
      </div>
    </article>
  )
}

export default function Mentorship() {
  const { user, role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isProfessor = role === 'PROFESSOR' || role === 'FACULTY' ||
    user?.role === 'professor' || user?.roles?.includes('PROFESSOR')

  const tabs = isProfessor ? [
    ['incoming', 'Advising Requests'],
    ['active', 'Active Mentees'],
    ['find', 'Faculty & Mentors'],
  ] : [
    ['find', 'Find a mentor'],
    ['incoming', 'Requests'],
    ['active', 'My mentorships'],
  ]

  const queryTab = new URLSearchParams(location.search).get('tab')
  const defaultTab = isProfessor ? 'incoming' : 'find'
  const [tab, setTab] = useState(() => queryTab || defaultTab)

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('tab')
    if (q && q !== tab) {
      setTab(q)
    }
  }, [location.search])

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

  const pendingCount = state.requests.filter(
    (r) => r.direction === 'incoming' && r.status?.toLowerCase() === 'pending',
  ).length
  const activeCount = state.mentorships.filter((m) => m.status?.toLowerCase() === 'active').length
  const badges = { incoming: pendingCount, active: activeCount }

  return (
    <div className={STACK}>
      <header className="mb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">04 &mdash; MENTORSHIP & ADVISING</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
          {isProfessor ? 'STUDENT ADVISING & MENTORSHIP' : 'MENTORSHIP'}
        </h1>
        <p className="mt-2 text-sm text-swiss-muted">
          {isProfessor
            ? 'Review incoming undergraduate guidance requests, coordinate research projects, and advise active mentees.'
            : 'Find an experienced alum or faculty advisor, or help someone take their next step.'}
        </p>
      </header>

      {notice ? (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Alert>
      ) : null}

      <nav className={ROW} role="tablist">
        {tabs.map(([value, label]) => (
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

      {tab === 'find' ? (
        <div className={STACK}>
          <Card>
            <form className={ROW} onSubmit={(e) => { e.preventDefault(); load() }}>
              <div className="min-w-64 flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, company or industry"
                  aria-label="Search mentors"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
          </Card>

          {state.loading ? <Card><LoadingBlock rows={4} label="Finding mentors" /></Card> : null}

          {!state.loading && state.mentors.length === 0 ? (
            <Card>
              <EmptyState
                title="No mentors available"
                description="Nobody matches that search yet. Try a broader term."
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

      {tab === 'incoming' ? (
        <div className={STACK}>
          {state.loading ? <Card><LoadingBlock rows={3} label="Loading requests" /></Card> : null}
          {!state.loading && state.requests.length === 0 ? (
            <Card>
              <EmptyState
                title="No requests yet"
                description="Requests you send or receive will show up here."
              />
            </Card>
          ) : null}
          {state.requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isProfessor={isProfessor}
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
      ) : null}

      {tab === 'active' ? (
        <div className={STACK}>
          {state.loading ? <Card><LoadingBlock rows={3} label="Loading mentorships" /></Card> : null}
          {!state.loading && state.mentorships.length === 0 ? (
            <Card>
              <EmptyState
                title="No mentorships yet"
                description={isProfessor ? "No active mentees currently. Accept an incoming advising request to begin." : "Accept a request to start one."}
                action={<Button onClick={() => changeTab(isProfessor ? 'incoming' : 'find')}>{isProfessor ? 'View Advising Requests' : 'Find a mentor'}</Button>}
              />
            </Card>
          ) : null}
          {state.mentorships.map((item) => (
            <MentorshipCard
              key={item.id}
              item={item}
              isProfessor={isProfessor}
              busy={busyId === item.id}
              onComplete={(id) => act(id, () => mentorship.complete(id), 'Marked as complete')}
              onEnd={(id) => act(id, () => mentorship.end(id), 'Mentorship ended')}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
