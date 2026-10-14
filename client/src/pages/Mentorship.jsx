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

const ALUMNI_TABS = [
  ['incoming_requests', 'Incoming requests'],
  ['active_mentees', 'Active mentees'],
  ['find', 'Find faculty mentors'],
  ['my_requests', 'My sent requests'],
  ['availability', 'Mentorship settings'],
]

const PROFESSOR_TABS = [
  ['incoming_requests', 'Advising requests'],
  ['active_mentees', 'Active mentees'],
  ['availability', 'Faculty settings'],
]

const STUDENT_TABS = [
  ['find', 'Find a mentor'],
  ['my_requests', 'My requests'],
  ['active', 'Active mentorships'],
]

const MODES = [
  ['video', 'Video call'],
  ['chat', 'Chat message'],
  ['call', 'Phone / Audio call'],
  ['email', 'Email'],
]

export function extractErrorMessage(err) {
  if (!err) return null
  if (typeof err === 'string') return err

  // Check direct ApiError fields map
  if (err.fields && typeof err.fields === 'object') {
    const msgs = Object.values(err.fields).filter(Boolean)
    if (msgs.length > 0) return msgs.join('. ')
  }

  // Check direct errors array
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const list = err.errors
      .map((item) => (typeof item === 'string' ? item : item.message || item.msg || item.field))
      .filter(Boolean)
    if (list.length > 0) return list.join('. ')
  }

  // Check direct details array
  if (Array.isArray(err.details) && err.details.length > 0) {
    const list = err.details
      .map((item) => (typeof item === 'string' ? item : item.message || item.msg || item.field))
      .filter(Boolean)
    if (list.length > 0) return list.join('. ')
  }

  // Check backend error response envelope
  const resData = err.response?.data || err.data
  if (resData) {
    const list = resData.errors || resData.error?.details || resData.details
    if (Array.isArray(list) && list.length > 0) {
      return list
        .map((item) => (typeof item === 'string' ? item : item.message || item.msg || item.field))
        .filter(Boolean)
        .join('. ')
    }
    if (typeof list === 'object' && list !== null) {
      const msgs = Object.values(list).filter(Boolean)
      if (msgs.length > 0) return msgs.join('. ')
    }
    if (resData.message && resData.message !== 'Validation failed') {
      return resData.message
    }
    if (resData.error?.message && resData.error.message !== 'Validation failed') {
      return resData.error.message
    }
  }

  if (err.message && err.message !== 'Validation failed') {
    return err.message
  }

  return 'Validation failed. Please verify the submitted information.'
}

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
  const defaultArea = mentor.industry || mentor.skills?.[0] || 'General Mentorship'
  const [form, setForm] = useState({
    careerGoal: '',
    areaOfInterest: defaultArea,
    message: '',
    preferredMode: 'video',
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const goalLength = form.careerGoal.trim().length
  const isGoalTooShort = goalLength > 0 && goalLength < 20

  async function submit(event) {
    event.preventDefault()
    const trimmedGoal = form.careerGoal.trim()
    if (trimmedGoal.length < 20) {
      setError(new Error(`Please describe what you want to achieve in at least 20 characters (currently ${trimmedGoal.length} characters).`))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        mentorId: mentor.id,
        mentor_id: mentor.id,
        careerGoal: trimmedGoal,
        career_goal: trimmedGoal,
        goal: trimmedGoal,
        objective: trimmedGoal,
        areaOfInterest: form.areaOfInterest.trim() || defaultArea,
        interestArea: form.areaOfInterest.trim() || defaultArea,
        area_of_interest: form.areaOfInterest.trim() || defaultArea,
        topics: [form.areaOfInterest.trim() || defaultArea],
        preferredMode: form.preferredMode || 'video',
        preferredCommunication: form.preferredMode || 'video',
        preferred_mode: form.preferredMode || 'video',
        frequency: 'monthly',
        preferred_frequency: 'monthly',
        message: form.message.trim(),
        notes: form.message.trim(),
      }
      await mentorship.request(payload)
      onDone()
    } catch (err) {
      console.error('Mentorship error details:', err.response?.data || err)
      const serverMessage = err.response?.data?.errors?.map((e) => `${e.path || e.param || e.field}: ${e.msg || e.message}`).join(', ')
        || (err.fields ? Object.entries(err.fields).map(([k, v]) => `${k}: ${v}`).join(', ') : null)
        || err.response?.data?.message
        || err.message
      setError(serverMessage)
    } finally {
      setBusy(false)
    }
  }

  const errorMessage = typeof error === 'string' ? error : extractErrorMessage(error)

  return (
    <form className={STACK} onSubmit={submit}>
      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}
      <Field
        label="What do you want to achieve?"
        hint={
          <span className={goalLength > 0 && goalLength < 20 ? 'text-amber-600 font-medium' : ''}>
            A sentence or two describing your career goal. Minimum 20 characters ({goalLength}/20 characters).
          </span>
        }
        required
      >
        <Textarea
          rows={3}
          value={form.careerGoal}
          onChange={set('careerGoal')}
          minLength={20}
          maxLength={1000}
          placeholder="e.g. Aspiring systems architect looking to master scalable backend design and high-throughput microservices."
          required
        />
        {isGoalTooShort ? (
          <p className="mt-1 text-xs text-amber-600 font-medium">
            Please add {20 - goalLength} more character{20 - goalLength === 1 ? '' : 's'} to meet the 20-character requirement.
          </p>
        ) : null}
      </Field>
      <Field label="Area of interest" hint="Topics or focus area for mentorship (defaults to mentor's domain)">
        <Input
          value={form.areaOfInterest}
          onChange={set('areaOfInterest')}
          maxLength={150}
          placeholder="e.g. Distributed systems, cloud architecture, system design"
        />
      </Field>
      <Field label="How would you like to meet?">
        <Select value={form.preferredMode} onChange={set('preferredMode')}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Introduce yourself (optional)">
        <Textarea
          rows={2}
          value={form.message}
          onChange={set('message')}
          maxLength={1000}
          placeholder="Brief note or introduction for the mentor (optional)"
        />
      </Field>
      <div className={ROW}>
        <Button type="submit" disabled={busy || goalLength < 20}>
          {busy ? 'Sending...' : 'Send request'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  )
}

function MentorCard({ mentor, onRequested, canRequest = true }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const full = mentor.openSlots <= 0
  const isProf = mentor.isProfessor || mentor.role === 'professor' || mentor.role === 'faculty'

  const roleLabel = isProf ? 'Professor' : 'Alumni'
  const defaultCaption = isProf ? 'University Professor & Faculty Advisor' : 'Alumni Mentor'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start gap-3">
        <PersonHeading
          peer={mentor}
          to={`/alumni/${mentor.id}`}
          caption={[mentor.currentPosition, mentor.currentCompany, mentor.graduationYear ? `Class of ${mentor.graduationYear}` : null]
            .filter(Boolean).join(' at ') || defaultCaption}
          badge={
            <div className="flex items-center gap-1.5">
              <Badge tone={isProf ? 'purple' : 'blue'}>
                {roleLabel}
              </Badge>
              <Badge tone={full ? 'slate' : 'green'}>
                {full ? 'No open slots' : `${mentor.openSlots} open slot${mentor.openSlots === 1 ? '' : 's'}`}
              </Badge>
            </div>
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
          {canRequest ? (
            <Button onClick={() => setOpen(true)} disabled={full}>Request mentorship</Button>
          ) : null}
          <Link to={`/alumni/${mentor.id}`}>
            <Button variant={canRequest ? 'secondary' : 'primary'}>View profile →</Button>
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
  const rawRole = peer?.role || (peer?.yearOfStudy || peer?.department ? 'Student' : 'Alumni')
  const roleDisplay = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase()

  const academicDetails = [
    peer?.department,
    peer?.degree,
    peer?.yearOfStudy ? `Year ${peer.yearOfStudy}` : (peer?.currentCompany ? `at ${peer.currentCompany}` : null),
  ].filter(Boolean).join(' • ') || (roleDisplay === 'Student' ? 'Student Scholar' : 'Alumni Member')

  const modeLabel = MODES.find(([val]) => val === request.preferredMode)?.[1] || request.preferredMode || 'Video call'

  return (
    <article className={FLUSH}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-swiss-border pb-3">
        <PersonHeading
          peer={peer}
          to={`/alumni/${peer?.id}`}
          caption={academicDetails}
          badge={
            <div className="flex items-center gap-1.5">
              <Badge tone={roleDisplay.toLowerCase() === 'student' ? 'blue' : 'amber'}>
                {roleDisplay}
              </Badge>
              <Badge tone={STATUS_TONES[request.status?.toLowerCase()] ?? 'slate'}>
                {request.status?.toUpperCase()}
              </Badge>
            </div>
          }
        />
      </div>

      <div className="mb-3">
        <DetailList items={[
          ['Requester Role', roleDisplay],
          ['Career Goal', request.careerGoal || 'Guidance requested'],
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
              {busy ? 'Processing...' : 'Accept'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRespond(request.id, 'REJECTED', note)}
              disabled={busy}
            >
              Decline
            </Button>
            <Link to={`/alumni/${peer?.id}`} className="ml-auto">
              <Button variant="ghost">View {roleDisplay.toLowerCase()} profile →</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className={cx(ROW, 'mt-4 border-t border-swiss-border pt-3')}>
          {request.status?.toLowerCase() === 'accepted' ? (
            <Link to={`/messages/${peer?.id}`}>
              <Button size="sm">Message {roleDisplay.toLowerCase()}</Button>
            </Link>
          ) : null}
          <Link to={`/alumni/${peer?.id}`}>
            <Button size="sm" variant="ghost">View {roleDisplay.toLowerCase()} profile →</Button>
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

        {error ? <Alert tone="error">{extractErrorMessage(error) || 'Failed to update settings'}</Alert> : null}
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

function resolveTab(rawTab, userRole) {
  const isProf = ['PROFESSOR', 'FACULTY'].includes(userRole)
  const isAlum = userRole === 'ALUMNI'

  if (isProf) {
    if (rawTab === 'incoming' || rawTab === 'incoming_requests' || rawTab === 'requests') return 'incoming_requests'
    if (rawTab === 'active' || rawTab === 'active_mentees') return 'active_mentees'
    if (rawTab === 'availability' || rawTab === 'settings') return 'availability'
    return 'incoming_requests'
  }

  if (isAlum) {
    if (rawTab === 'incoming' || rawTab === 'incoming_requests' || rawTab === 'requests') return 'incoming_requests'
    if (rawTab === 'active' || rawTab === 'active_mentees') return 'active_mentees'
    if (rawTab === 'find' || rawTab === 'mentors' || rawTab === 'faculty') return 'find'
    if (rawTab === 'my_requests' || rawTab === 'sent') return 'my_requests'
    if (rawTab === 'availability' || rawTab === 'settings') return 'availability'
    return 'incoming_requests'
  }

  // Student
  if (rawTab === 'find' || rawTab === 'mentors') return 'find'
  if (rawTab === 'incoming' || rawTab === 'requests' || rawTab === 'my_requests' || rawTab === 'incoming_requests') return 'my_requests'
  if (rawTab === 'active' || rawTab === 'active_mentees') return 'active'
  return 'find'
}

export default function Mentorship() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, role } = useAuth()

  const userRole = (role || user?.role || user?.roles?.[0] || '').toUpperCase()
  const isProfessor = ['PROFESSOR', 'FACULTY'].includes(userRole)
  const isAlumni = userRole === 'ALUMNI'
  const isMentorRole = isAlumni || isProfessor

  const activeTabsList = isProfessor
    ? PROFESSOR_TABS
    : (isAlumni ? ALUMNI_TABS : STUDENT_TABS)

  const queryTab = new URLSearchParams(location.search).get('tab')
  const [tab, setTab] = useState(() => resolveTab(queryTab, userRole))
  const [roleFilter, setRoleFilter] = useState('all')

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
    const nextTab = resolveTab(queryTab, userRole)
    if (tab !== nextTab) {
      setTab(nextTab)
    }
    if (queryTab !== nextTab) {
      navigate({ pathname: '/mentorship', search: `?tab=${nextTab}` }, { replace: true })
    }
  }, [queryTab, userRole, navigate, tab])

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const mentorsParams = {
        limit: 50,
        search: search || undefined,
        role: userRole === 'ALUMNI' ? 'professor' : (roleFilter !== 'all' ? roleFilter : undefined),
      }
      const [mentors, requests, mentorships, profileRes] = await Promise.all([
        mentorship.mentors(mentorsParams),
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
  }, [search, userRole, roleFilter])

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
      setNotice({ tone: 'error', text: extractErrorMessage(error) || 'Action failed' })
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

  const availableMentors = useMemo(() => {
    return state.mentors.filter((m) => {
      // 1. Filter out currently logged-in user
      if (m.id === user?.id) return false

      const mRole = (m.role || (m.isProfessor ? 'professor' : 'alumni')).toLowerCase()

      // 2. If student: only alumni or professor
      if (userRole === 'STUDENT') {
        if (!['alumni', 'professor', 'faculty'].includes(mRole)) return false
        if (roleFilter === 'alumni') return mRole === 'alumni'
        if (roleFilter === 'professor') return mRole === 'professor' || mRole === 'faculty'
        return true
      }

      // 3. If alumni: only professor (never fellow alumni, never students)
      if (userRole === 'ALUMNI') {
        return mRole === 'professor' || mRole === 'faculty'
      }

      // 4. Other roles: never peer-role or self
      return mRole !== userRole.toLowerCase()
    })
  }, [state.mentors, user?.id, userRole, roleFilter])

  const badges = {
    incoming_requests: pendingIncomingCount,
    my_requests: pendingOutgoingCount,
    active_mentees: activeMentees.length,
    active: activeMentorships.length,
  }

  return (
    <div className={STACK}>
      <header className="border-b border-swiss-border pb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">04 &mdash; MENTORSHIP</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
          {isProfessor ? 'STUDENT ADVISING & MENTORSHIP' : 'MENTORSHIP'}
        </h1>
        <p className="mt-2 text-sm text-swiss-muted max-w-2xl leading-relaxed">
          {isProfessor
            ? 'Review incoming undergraduate guidance requests, coordinate research projects, and advise active mentees.'
            : isMentorRole
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
          ALUMNI / PROFESSOR TAB 1: INCOMING REQUESTS
          ======================================================== */}
      {isMentorRole && tab === 'incoming_requests' ? (
        <div className={STACK}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-swiss-border pb-3">
            <div>
              <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
                {isProfessor ? 'Incoming Advising Requests' : 'Incoming Mentorship Requests'}
              </h2>
              <p className="text-sm text-swiss-muted mt-1">
                {isProfessor
                  ? 'Review and respond to academic advising and research guidance requests directed to you by students and alumni.'
                  : 'Review and respond to incoming mentorship applications specifically directed to you.'}
              </p>
            </div>
            <span className="font-mono text-xs text-swiss-label">
              {incomingRequests.length} TOTAL REQUEST{incomingRequests.length === 1 ? '' : 'S'}
            </span>
          </div>

          {state.loading ? <Card><LoadingBlock rows={4} label="Loading incoming requests" /></Card> : null}

          {!state.loading && incomingRequests.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="No incoming mentorship requests"
                description="You currently have no pending mentorship applications awaiting your review."
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
          DISCOVERY TAB: FIND A MENTOR (STUDENT or ALUMNI)
          ======================================================== */}
      {tab === 'find' ? (
        <div className={STACK}>
          <div className="border-b border-swiss-border pb-3">
            <h2 className="text-base font-bold text-swiss-text uppercase tracking-wide">
              {userRole === 'ALUMNI' ? 'Find Faculty Mentors & Research Advisors' : 'Find a mentor'}
            </h2>
            <p className="text-sm text-swiss-muted mt-1">
              {userRole === 'ALUMNI'
                ? 'Connect with university professors and senior faculty members for academic research, doctoral guidance, and institutional collaboration.'
                : 'Explore experienced alumni and university faculty, review their expertise, and request guidance for your career or studies.'}
            </p>
          </div>

          <Card className="p-4 space-y-3">
            <form className={ROW} onSubmit={(e) => { e.preventDefault(); load() }}>
              <div className="min-w-64 flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={userRole === 'ALUMNI' ? 'Search professors by name, department, or research domain' : 'Search by name, company, skill or industry'}
                  aria-label="Search mentors"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>

            {/* Role Filter Pills for Students */}
            {userRole === 'STUDENT' ? (
              <div className="flex items-center gap-2 pt-2 border-t border-swiss-border">
                <span className="text-xs font-mono uppercase text-swiss-label font-bold">Role Filter:</span>
                {[
                  ['all', 'All Mentors (Alumni & Faculty)'],
                  ['alumni', 'Alumni Mentors'],
                  ['professor', 'University Professors'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRoleFilter(val)}
                    className={cx(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      roleFilter === val
                        ? 'bg-slate-900 text-white font-bold'
                        : 'bg-swiss-surface text-swiss-muted ring-1 ring-swiss-border hover:bg-swiss-surface-hover'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          {state.loading ? <Card><LoadingBlock rows={4} label="Finding available mentors" /></Card> : null}

          {!state.loading && availableMentors.length === 0 ? (
            <Card>
              <EmptyState
                title={userRole === 'ALUMNI' ? 'No faculty mentors available' : 'No mentors available'}
                description={
                  userRole === 'ALUMNI'
                    ? 'No university professors match your search criteria. Try a broader search term or clear the filter.'
                    : 'Nobody matches that search query yet. Try a broader search term or clear the filter.'
                }
              />
            </Card>
          ) : null}

          <div className={GRID}>
            {availableMentors.map((mentor) => (
              <MentorCard
                key={mentor.id}
                mentor={mentor}
                canRequest={
                  (userRole === 'STUDENT' && ['alumni', 'professor', 'faculty'].includes((mentor.role || '').toLowerCase())) ||
                  (userRole === 'ALUMNI' && ['professor', 'faculty'].includes((mentor.role || '').toLowerCase()))
                }
                onRequested={load}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ========================================================
          MY REQUESTS (SENT REQUESTS FOR STUDENT & ALUMNI)
          ======================================================== */}
      {tab === 'my_requests' ? (
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

