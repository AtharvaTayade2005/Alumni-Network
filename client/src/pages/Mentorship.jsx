import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { mentorship, profiles } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorState,
  Field, Input, LoadingBlock, Select, Textarea, cx,
} from '../components/ui.jsx'

/**
 * Mentorship serves two main roles with distinct UX flows:
 * - ALUMNI / PROFESSOR: Focuses on incoming student requests, active mentees,
 *   and mentorship availability/capacity settings, with optional peer browsing.
 * - STUDENT: Focuses on finding mentors, tracking submitted requests, and
 *   ongoing mentorship pairings.
 */

const STACK = 'flex flex-col gap-6'
const ROW = 'flex flex-wrap items-center gap-2'
const GRID = 'grid gap-4 md:grid-cols-2'
const MUTED = 'text-sm text-swiss-muted'
const MUTED_SMALL = 'text-xs text-swiss-label'
const FLUSH = 'rounded-sm border border-swiss-border bg-swiss-surface p-5'

const MENTOR_TABS = [
  ['incoming_requests', 'Student requests'],
  ['active_mentees', 'Active mentees'],
  ['availability', 'Mentorship settings'],
  ['find', 'Browse peers'],
]

const STUDENT_TABS = [
  ['find', 'Find a mentor'],
  ['my_requests', 'My requests'],
  ['active', 'Active mentorships'],
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
  rejected: 'slate',
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

function PersonHeading({ peer, caption, to, badge }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
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
      {badge}
    </div>
  )
}

function DetailList({ items }) {
  return (
    <dl className="grid gap-1.5 text-sm sm:grid-cols-[9rem_1fr] sm:gap-x-3">
      {items.filter(Boolean).map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-mono text-xs text-swiss-label uppercase tracking-wider">{term}</dt>
          <dd className="text-swiss-text text-sm font-medium">{value}</dd>
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

function MentorCard({ mentor, onRequested, isPeer = false }) {
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
          badge={
            <Badge tone={full ? 'slate' : 'green'}>
              {full ? 'No open slots' : `${mentor.openSlots} open slot${mentor.openSlots === 1 ? '' : 's'}`}
            </Badge>
          }
        />
      </div>

      {mentor.bio ? <p className={cx('mb-3', MUTED)}>{mentor.bio}</p> : null}
      {mentor.industry ? <p className={cx('mb-3', MUTED_SMALL)}>{mentor.industry}</p> : null}

      {done ? (
        <Alert tone="success" title="Request sent">
          {mentor.name} has been notified. You can track this under My Requests.
        </Alert>
      ) : open ? (
        <RequestForm
          mentor={mentor}
          onCancel={() => setOpen(false)}
          onDone={() => { setOpen(false); setDone(true); onRequested() }}
        />
      ) : (
        <div className={ROW}>
          {!isPeer ? (
            <Button onClick={() => setOpen(true)} disabled={full}>Request mentorship</Button>
          ) : null}
          <Link to={`/alumni/${mentor.id}`}>
            <Button variant={isPeer ? 'primary' : 'secondary'}>View profile →</Button>
          </Link>
        </div>
      )}
    </article>
  )
}

/** Card for incoming student request specifically for the mentor persona */
function StudentRequestCard({ request, onRespond, busy }) {
  const [note, setNote] = useState('')
  const peer = request.peer
  const academicDetails = [
    peer?.degree,
    peer?.department,
    peer?.yearOfStudy ? `Year ${peer.yearOfStudy}` : null,
  ].filter(Boolean).join(' • ') || 'Student Scholar'

  const modeLabel = MODES.find(([val]) => val === request.preferredMode)?.[1] || request.preferredMode || 'Video call'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-swiss-border pb-3">
        <PersonHeading
          peer={peer}
          to={`/alumni/${peer?.id}`}
          caption={academicDetails}
          badge={
            <Badge tone={STATUS_TONES[request.status?.toLowerCase()] ?? 'slate'}>
              {request.status?.toUpperCase()}
            </Badge>
          }
        />
      </div>

      <div className="mb-3">
        <DetailList items={[
          ['Goal / Topic', request.careerGoal || 'Guidance requested'],
          ['Focus Area', request.areaOfInterest || request.interestArea || 'General Mentorship'],
          ['Preferred Mode', modeLabel],
          ['Submitted', formatDate(request.createdAt)],
        ]} />
      </div>

      {request.message ? (
        <div className="mt-3 rounded-sm border-l-2 border-swiss-accent bg-swiss-surface-hover/30 p-3 text-sm italic text-swiss-muted">
          &ldquo;{request.message}&rdquo;
        </div>
      ) : null}

      {request.responseNote ? (
        <div className="mt-3 rounded-sm border-l-2 border-slate-400 bg-slate-50 p-2 text-xs text-swiss-muted">
          <span className="font-semibold text-swiss-text">Your note: </span>{request.responseNote}
        </div>
      ) : null}

      {request.status?.toLowerCase() === 'pending' ? (
        <div className={cx(STACK, 'mt-4 border-t border-swiss-border pt-4')}>
          <Field label="Response note (optional)" hint="e.g. Happy to help! Let's connect on Zoom this Friday.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Add welcoming note or session details..."
            />
          </Field>
          <div className={ROW}>
            <Button
              onClick={() => onRespond(request.id, 'ACCEPTED', note)}
              disabled={busy}
            >
              {busy ? 'Processing...' : 'Accept request'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRespond(request.id, 'REJECTED', note)}
              disabled={busy}
            >
              Decline
            </Button>
            <Link to={`/alumni/${peer?.id}`} className="ml-auto">
              <Button variant="ghost">View student profile →</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className={cx(ROW, 'mt-4 border-t border-swiss-border pt-3')}>
          {request.status?.toLowerCase() === 'accepted' ? (
            <Link to={`/messages/${peer?.id}`}>
              <Button size="sm">Message student</Button>
            </Link>
          ) : null}
          <Link to={`/alumni/${peer?.id}`}>
            <Button size="sm" variant="ghost">View student profile →</Button>
          </Link>
        </div>
      )}
    </article>
  )
}

/** Card for student view to manage their outgoing sent requests */
function SentRequestCard({ request, onCancel, busy }) {
  const peer = request.peer
  const theyAre = [peer?.currentPosition, peer?.currentCompany].filter(Boolean).join(' at ') || 'Mentor'
  const modeLabel = MODES.find(([val]) => val === request.preferredMode)?.[1] || request.preferredMode || 'Video call'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-swiss-border pb-3">
        <PersonHeading
          peer={peer}
          to={`/alumni/${peer?.id}`}
          caption={theyAre}
          badge={
            <Badge tone={STATUS_TONES[request.status?.toLowerCase()] ?? 'slate'}>
              {request.status?.toUpperCase()}
            </Badge>
          }
        />
      </div>

      <DetailList items={[
        ['Career goal', request.careerGoal],
        ['Focus area', request.areaOfInterest || request.interestArea || 'General Mentorship'],
        ['Preferred mode', modeLabel],
        ['Sent', formatDate(request.createdAt)],
      ]} />

      {request.message ? (
        <div className="mt-3 border-l-2 border-swiss-border pl-3 text-sm italic text-swiss-muted">
          &ldquo;{request.message}&rdquo;
        </div>
      ) : null}

      {request.responseNote ? (
        <div className="mt-3 rounded-sm border-l-2 border-green-500 bg-green-50 p-2 text-xs text-green-900">
          <span className="font-semibold">Mentor response: </span>{request.responseNote}
        </div>
      ) : null}

      <div className={cx(ROW, 'mt-4 border-t border-swiss-border pt-3')}>
        {request.status?.toLowerCase() === 'pending' ? (
          <Button variant="ghost" size="sm" onClick={() => onCancel(request.id)} disabled={busy}>
            {busy ? 'Cancelling...' : 'Cancel request'}
          </Button>
        ) : request.status?.toLowerCase() === 'accepted' ? (
          <Link to={`/messages/${peer?.id}`}>
            <Button size="sm">Message mentor</Button>
          </Link>
        ) : null}
        <Link to={`/alumni/${peer?.id}`} className="ml-auto">
          <Button variant="ghost" size="sm">View profile →</Button>
        </Link>
      </div>
    </article>
  )
}

function MentorshipCard({ item, isMentor, onEnd, onComplete, busy }) {
  const theyAre = [item.peer?.currentPosition, item.peer?.currentCompany].filter(Boolean).join(' at ') || (isMentor ? 'Mentee' : 'Mentor')

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-swiss-border pb-3">
        <PersonHeading
          peer={item.peer}
          to={`/alumni/${item.peer?.id}`}
          caption={isMentor ? `Mentee: ${theyAre}` : `Mentor: ${theyAre}`}
          badge={
            <Badge tone={STATUS_TONES[item.status?.toLowerCase()] ?? 'slate'}>
              {item.status?.toUpperCase()}
            </Badge>
          }
        />
      </div>

      <DetailList items={[
        ['Started', formatDate(item.startedAt)],
        ['Ended', item.endedAt ? formatDate(item.endedAt) : null],
        [isMentor ? 'Mentee' : 'Mentor', theyAre],
        ['Status detail', item.endReason || 'Active 1-on-1 collaboration'],
      ]} />

      {item.status?.toLowerCase() === 'active' ? (
        <div className={cx(ROW, 'mt-4 border-t border-swiss-border pt-3')}>
          <Link to={`/messages/${item.peer?.id}`}>
            <Button size="sm">Message {isMentor ? 'mentee' : 'mentor'}</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => onComplete(item.id)} disabled={busy}>
            Mark complete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEnd(item.id)} disabled={busy}>
            End mentorship
          </Button>
          <Link to={`/alumni/${item.peer?.id}`} className="ml-auto">
            <Button size="sm" variant="ghost">View profile →</Button>
          </Link>
        </div>
      ) : null}
    </article>
  )
}

/** Settings Tab for Alumni & Faculty Mentors to control their availability */
function MentorshipSettingsTab({ profile, onSaved, busy }) {
  const [form, setForm] = useState({
    isOpenToMentor: false,
    mentorshipCapacity: 3,
    bio: '',
    industry: '',
    skillsText: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (profile?.alumni) {
      const alum = profile.alumni
      const skills = (profile.skills || []).map((s) => s.name || s).join(', ')
      setForm({
        isOpenToMentor: Boolean(alum.is_open_to_mentor ?? alum.mentorshipAvailable),
        mentorshipCapacity: alum.mentorship_capacity ?? alum.mentorshipCapacity ?? 3,
        bio: alum.bio || '',
        industry: alum.industry || '',
        skillsText: skills,
      })
    }
  }, [profile])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const skillsArray = form.skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      await profiles.updateMe({
        isOpenToMentor: form.isOpenToMentor,
        mentorshipCapacity: Number(form.mentorshipCapacity) || 1,
        bio: form.bio || undefined,
        industry: form.industry || undefined,
        skills: skillsArray.length > 0 ? skillsArray : undefined,
      })
      setSuccess(true)
      await onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const isVerified = profile?.alumni?.verification_status === 'verified' || profile?.alumni?.verified

  return (
    <Card className="max-w-3xl p-6">
      <form onSubmit={handleSubmit} className={STACK}>
        <div className="border-b border-swiss-border pb-3">
          <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
            Mentorship Availability &amp; Preferences
          </h2>
          <p className="mt-1 text-sm text-swiss-muted">
            Configure how and when students can connect with you for mentorship.
          </p>
        </div>

        {error ? <Alert tone="error">{error.message || 'Failed to update settings'}</Alert> : null}
        {success ? <Alert tone="success" onDismiss={() => setSuccess(false)}>Your mentorship settings have been saved.</Alert> : null}

        {!isVerified ? (
          <Alert tone="warning" title="Verification Note">
            Only verified alumni profiles appear in the active mentor directory. Your verification status is currently {profile?.alumni?.verification_status || 'PENDING'}.
          </Alert>
        ) : null}

        <div className="rounded-sm border border-swiss-border bg-swiss-surface-hover/30 p-4">
          <Checkbox
            label="Open to mentoring students"
            description="When enabled, your profile is advertised in the student discovery directory with an option to request 1-on-1 guidance."
            checked={form.isOpenToMentor}
            onChange={(e) => setForm((prev) => ({ ...prev, isOpenToMentor: e.target.checked }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Max Mentorship Capacity"
            hint="Active students at once (1–10)"
            required
          >
            <Input
              type="number"
              min={1}
              max={10}
              value={form.mentorshipCapacity}
              onChange={(e) => setForm((prev) => ({ ...prev, mentorshipCapacity: e.target.value }))}
              required
            />
          </Field>

          <Field label="Industry / Primary Domain" hint="e.g. Technology, Finance, Healthcare">
            <Input
              value={form.industry}
              onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
              placeholder="e.g. Technology"
              maxLength={120}
            />
          </Field>
        </div>

        <Field
          label="Expertise & Mentoring Areas"
          hint="Comma-separated skills (e.g. System Design, Resume Review, Career Transition)"
        >
          <Input
            value={form.skillsText}
            onChange={(e) => setForm((prev) => ({ ...prev, skillsText: e.target.value }))}
            placeholder="e.g. Distributed Systems, Resume Review, Technical Interviewing"
          />
        </Field>

        <Field
          label="Mentorship Bio / Focus Notes"
          hint="Share your background, what you enjoy coaching students on, and typical availability."
        >
          <Textarea
            rows={4}
            value={form.bio}
            onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
            placeholder="Share how you can best support student mentees..."
            maxLength={2000}
          />
        </Field>

        <div className={ROW}>
          <Button type="submit" disabled={saving || busy}>
            {saving ? 'Saving settings...' : 'Save settings'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function resolveTab(rawTab, isMentor) {
  if (isMentor) {
    if (rawTab === 'incoming' || rawTab === 'incoming_requests' || rawTab === 'requests') return 'incoming_requests'
    if (rawTab === 'active' || rawTab === 'active_mentees') return 'active_mentees'
    if (rawTab === 'availability' || rawTab === 'settings') return 'availability'
    if (rawTab === 'find' || rawTab === 'peers') return 'find'
    return 'incoming_requests'
  }
  if (rawTab === 'find' || rawTab === 'peers') return 'find'
  if (rawTab === 'incoming' || rawTab === 'requests' || rawTab === 'my_requests' || rawTab === 'incoming_requests') return 'my_requests'
  if (rawTab === 'active' || rawTab === 'active_mentees') return 'active'
  return 'find'
}

export default function Mentorship() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, role } = useAuth()

  const isMentorRole = ['ALUMNI', 'PROFESSOR', 'FACULTY'].includes(
    (role || user?.role || user?.roles?.[0] || '').toUpperCase(),
  )

  const activeTabsList = isMentorRole ? MENTOR_TABS : STUDENT_TABS

  const queryTab = new URLSearchParams(location.search).get('tab')
  const [tab, setTab] = useState(() => resolveTab(queryTab, isMentorRole))

  const [state, setState] = useState({
    mentors: [],
    requests: [],
    mentorships: [],
    myProfile: null,
    loading: true,
    error: null,
  })
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)

  // Keep tab state synchronized with query param and role changes
  useEffect(() => {
    const nextTab = resolveTab(queryTab, isMentorRole)
    if (tab !== nextTab) {
      setTab(nextTab)
    }
    if (queryTab !== nextTab) {
      navigate({ pathname: '/mentorship', search: `?tab=${nextTab}` }, { replace: true })
    }
  }, [queryTab, isMentorRole, navigate, tab])

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [mentors, requests, mentorships, profileRes] = await Promise.all([
        mentorship.mentors({ limit: 20, search: search || undefined }),
        mentorship.requests({ limit: 50 }),
        mentorship.mentorships({ limit: 50 }),
        profiles.me().catch(() => ({ data: null })),
      ])
      setState({
        mentors: mentors.data ?? [],
        requests: requests.data ?? [],
        mentorships: mentorships.data ?? [],
        myProfile: profileRes?.data ?? null,
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
      setNotice({ tone: 'error', text: error.message || 'Action failed' })
    } finally {
      setBusyId(null)
    }
  }

  const incomingRequests = state.requests.filter((r) => r.direction === 'incoming')
  const outgoingRequests = state.requests.filter((r) => r.direction === 'outgoing')
  const pendingIncomingCount = incomingRequests.filter((r) => r.status?.toLowerCase() === 'pending').length
  const pendingOutgoingCount = outgoingRequests.filter((r) => r.status?.toLowerCase() === 'pending').length

  const activeMentorships = state.mentorships.filter((m) => m.status?.toLowerCase() === 'active')
  const activeMentees = isMentorRole
    ? state.mentorships.filter((m) => m.status?.toLowerCase() === 'active' && m.role === 'mentor')
    : activeMentorships

  const badges = isMentorRole
    ? {
      incoming_requests: pendingIncomingCount,
      active_mentees: activeMentees.length,
    }
    : {
      my_requests: pendingOutgoingCount,
      active: activeMentorships.length,
    }

  return (
    <div className={STACK}>
      <header className="border-b border-swiss-border pb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">04 &mdash; MENTORSHIP</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">MENTORSHIP</h1>
        <p className="mt-2 text-sm text-swiss-muted max-w-2xl leading-relaxed">
          {isMentorRole
            ? 'Guide and empower students through 1-on-1 career advice, portfolio critiques, and technical roadmaps.'
            : 'Connect with industry leaders for 1-on-1 career guidance, portfolio reviews, and graduate school advising.'}
        </p>
      </header>

      {notice ? (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Alert>
      ) : null}

      {/* Role-Aware Tabs Navigation */}
      <nav className={ROW} role="tablist">
        {activeTabsList.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tabClass(tab === value)}
            onClick={() => changeTab(value)}
          >
            {label}
            {badges[value] > 0 ? (
              <Badge tone={value.includes('request') ? 'amber' : 'green'}>
                {badges[value]}
              </Badge>
            ) : null}
          </button>
        ))}
      </nav>

      {state.error ? <Card><ErrorState error={state.error} onRetry={load} /></Card> : null}

      {/* ========================================================
          ALUMNI / PROFESSOR TAB 1: INCOMING STUDENT REQUESTS
          ======================================================== */}
      {isMentorRole && tab === 'incoming_requests' ? (
        <div className={STACK}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-swiss-border pb-3">
            <div>
              <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
                Incoming Student Requests
              </h2>
              <p className="text-sm text-swiss-muted mt-1">
                Review and respond to mentorship applications specifically directed to you by students.
              </p>
            </div>
            <span className="font-mono text-xs text-swiss-label">
              {incomingRequests.length} TOTAL REQUEST{incomingRequests.length === 1 ? '' : 'S'}
            </span>
          </div>

          {state.loading ? <Card><LoadingBlock rows={4} label="Loading student requests" /></Card> : null}

          {!state.loading && incomingRequests.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="No incoming student requests"
                description="You currently have no pending mentorship applications from students awaiting your review."
                action={
                  <Button variant="secondary" onClick={() => changeTab('availability')}>
                    Review availability settings →
                  </Button>
                }
              />
            </Card>
          ) : null}

          {!state.loading && incomingRequests.length > 0 ? (
            <div className="space-y-4">
              {incomingRequests.map((request) => (
                <StudentRequestCard
                  key={request.id}
                  request={request}
                  busy={busyId === request.id}
                  onRespond={(id, status, note) => act(
                    id,
                    () => mentorship.respond(id, {
                      status: status.toUpperCase(),
                      responseNote: note ? note.trim() : undefined,
                    }),
                    status.toUpperCase() === 'ACCEPTED'
                      ? 'Mentorship request accepted. You can now coordinate milestones.'
                      : 'Mentorship request declined.',
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ========================================================
          ALUMNI / PROFESSOR TAB 2: ACTIVE MENTEES
          ======================================================== */}
      {isMentorRole && tab === 'active_mentees' ? (
        <div className={STACK}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-swiss-border pb-3">
            <div>
              <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
                Active Mentees
              </h2>
              <p className="text-sm text-swiss-muted mt-1">
                Students currently being mentored. Message them directly or mark mentorship milestones.
              </p>
            </div>
            <span className="font-mono text-xs text-swiss-label">
              {activeMentees.length} ACTIVE PAIRING{activeMentees.length === 1 ? '' : 'S'}
            </span>
          </div>

          {state.loading ? <Card><LoadingBlock rows={3} label="Loading active mentees" /></Card> : null}

          {!state.loading && activeMentees.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="No active mentees yet"
                description="Accept incoming student requests to begin ongoing 1-on-1 mentorship pairings."
                action={
                  <Button onClick={() => changeTab('incoming_requests')}>
                    View student requests →
                  </Button>
                }
              />
            </Card>
          ) : null}

          <div className="space-y-4">
            {activeMentees.map((item) => (
              <MentorshipCard
                key={item.id}
                item={item}
                isMentor
                busy={busyId === item.id}
                onComplete={(id) => act(id, () => mentorship.complete(id), 'Mentorship marked as completed.')}
                onEnd={(id) => act(id, () => mentorship.end(id, 'Concluded mentorship sessions.'), 'Mentorship ended.')}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ========================================================
          ALUMNI / PROFESSOR TAB 3: MENTORSHIP SETTINGS / AVAILABILITY
          ======================================================== */}
      {isMentorRole && tab === 'availability' ? (
        <div className={STACK}>
          <MentorshipSettingsTab
            profile={state.myProfile}
            onSaved={load}
            busy={state.loading}
          />
        </div>
      ) : null}

      {/* ========================================================
          STUDENT TAB 1: FIND A MENTOR (or ALUMNI peer browser)
          ======================================================== */}
      {tab === 'find' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
              {isMentorRole ? 'Browse Mentors & Peers' : 'Find a mentor'}
            </h2>
            <p className="text-sm text-swiss-muted mt-1">
              {isMentorRole
                ? 'Explore fellow mentors, faculty, and industry leaders within the alumni network.'
                : 'Explore experienced alumni and faculty, review their expertise, and request guidance for your career or studies.'}
            </p>
          </div>

          <Card className="p-4">
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
              <MentorCard
                key={mentor.id}
                mentor={mentor}
                isPeer={isMentorRole}
                onRequested={load}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ========================================================
          STUDENT TAB 2: MY REQUESTS (SENT REQUESTS)
          ======================================================== */}
      {!isMentorRole && tab === 'my_requests' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
              My Requests
            </h2>
            <p className="text-sm text-swiss-muted mt-1">
              Track mentorship applications you&apos;ve sent to mentors and review status updates.
            </p>
          </div>

          {state.loading ? <Card><LoadingBlock rows={4} label="Loading mentorship requests" /></Card> : null}

          {!state.loading && (
            <div className="space-y-4">
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
                    action={<Button onClick={() => changeTab('find')}>Find a mentor →</Button>}
                  />
                </Card>
              ) : (
                <div className="space-y-4">
                  {outgoingRequests.map((request) => (
                    <SentRequestCard
                      key={request.id}
                      request={request}
                      busy={busyId === request.id}
                      onCancel={(id) => act(id, () => mentorship.cancel(id), 'Request cancelled')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* ========================================================
          STUDENT TAB 3: ACTIVE MENTORSHIPS
          ======================================================== */}
      {!isMentorRole && tab === 'active' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
              Active Mentorships
            </h2>
            <p className="text-sm text-swiss-muted mt-1">
              Manage your active mentoring relationships and collaborate with the mentors guiding your progress.
            </p>
          </div>

          {state.loading ? <Card><LoadingBlock rows={3} label="Loading active mentorships" /></Card> : null}

          {!state.loading && activeMentorships.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="No mentorships yet"
                description="Accept an incoming request or have a mentor accept your request to begin."
                action={<Button onClick={() => changeTab('find')}>Find a mentor →</Button>}
              />
            </Card>
          ) : null}

          <div className="space-y-4">
            {activeMentorships.map((item) => (
              <MentorshipCard
                key={item.id}
                item={item}
                isMentor={false}
                busy={busyId === item.id}
                onComplete={(id) => act(id, () => mentorship.complete(id), 'Mentorship marked as complete')}
                onEnd={(id) => act(id, () => mentorship.end(id, 'Concluded mentorship sessions.'), 'Mentorship ended')}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

