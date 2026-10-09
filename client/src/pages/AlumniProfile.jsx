import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { connections, profiles } from '../services/api.js'
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState,
  LoadingBlock, Spinner, Textarea,
} from '../components/ui.jsx'

export default function AlumniProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [state, setState] = useState({ loading: true, error: null })
  const [profile, setProfile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)

  const isSelf = userId === user?.id

  const load = useCallback(async () => {
    setState({ loading: true, error: null })
    try {
      const response = await profiles.byId(userId)
      setProfile(response.data)
      setState({ loading: false, error: null })
    } catch (error) {
      setState({ loading: false, error })
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (fn, successMessage) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await load()
      setMessage(successMessage)
    } catch (error) {
      setActionError(error)
    } finally {
      setBusy(false)
    }
  }, [load])

  /**
   * The profile endpoint reports connection state as a bare string, so the id
   * of the incoming request has to come from the pending list.
   */
  const respondToIncoming = useCallback(async (action) => {
    const pending = await connections.pending()
    const match = (pending.data ?? []).find(
      (row) => row.peer?.id === userId && row.direction === 'incoming',
    )
    if (!match) throw new Error('That request is no longer available')
    await connections.respond(match.id, action)
  }, [userId])

  const connectionState = profile?.connectionState ?? 'none'
  const role = profile?.alumni ?? profile?.student

  if (state.loading) {
    return <Card><LoadingBlock rows={6} label="Loading profile" /></Card>
  }

  if (state.error) {
    return <Card><ErrorState error={state.error} onRetry={load} /></Card>
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-sm font-mono tracking-widest text-swiss-muted hover:text-swiss-text uppercase mb-2"
      >
        ← Back
      </button>

      <header className="mb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">08 &mdash; ALUMNI PROFILE</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">IDENTITY</h1>
      </header>

      {actionError ? <Alert tone="error">{actionError.message}</Alert> : null}
      {message ? <Alert tone="success" onDismiss={() => setMessage('')}>{message}</Alert> : null}

      <Card>
        <div className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={profile?.user?.name} src={profile?.user?.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-swiss-text">
                  {profile?.user?.name}
                </h1>
                {profile?.user?.isEmailVerified ? (
                  <Badge tone="green">Email verified</Badge>
                ) : null}
                {profile?.alumni?.verification_status === 'verified' ? (
                  <Badge tone="green">Alumni verified</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-swiss-muted">
                {[role?.current_position, role?.current_company]
                  .filter(Boolean).join(' at ') || 'No role listed'}
              </p>
              <p className="mt-0.5 text-sm text-swiss-label">
                {[
                  role?.degree,
                  role?.graduation_year ? `Class of ${role.graduation_year}` : null,
                  role?.year_of_study ? `Year ${role.year_of_study}` : null,
                  [role?.city, role?.country].filter(Boolean).join(', '),
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            {!isSelf ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                {connectionState === 'connected' ? (
                  <>
                    <Button
                      onClick={() => navigate(`/messages/${userId}`)}
                    >
                      Message
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => act(() => connections.remove(userId), 'Connection removed')}
                    >
                      Remove
                    </Button>
                  </>
                ) : null}

                {connectionState === 'pending_outgoing' ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => act(() => connections.remove(userId), 'Request withdrawn')}
                  >
                    Withdraw request
                  </Button>
                ) : null}

                {connectionState === 'pending_incoming' ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => act(
                        () => respondToIncoming('accept'),
                        'Connection accepted',
                      )}
                    >
                      {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Accept request'}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => act(
                        () => respondToIncoming('decline'),
                        'Request declined',
                      )}
                    >
                      Decline
                    </Button>
                  </>
                ) : null}

                {connectionState === 'none' ? (
                  <Button
                    disabled={busy}
                    onClick={() => setShowNote((prev) => !prev)}
                  >
                    Connect
                  </Button>
                ) : null}

                {connectionState === 'blocked' ? (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => act(() => connections.remove(userId), 'User unblocked')}
                  >
                    Unblock
                  </Button>
                ) : null}
              </div>
            ) : (
              <Link to="/profile">
                <Button variant="secondary">Edit my profile</Button>
              </Link>
            )}
          </div>

          {showNote && connectionState === 'none' ? (
            <div className="mt-4 rounded-sm border border-swiss-border bg-swiss-surface p-4">
              <label className="mb-1.5 block text-sm font-medium text-swiss-text">
                Add a note (optional)
              </label>
              <Textarea
                rows={2}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="We studied in the same department..."
              />
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() => act(
                    () => connections.request(userId, note.trim() || undefined),
                    'Connection request sent',
                  )}
                >
                  {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Send request'}
                </Button>
                <Button variant="ghost" onClick={() => setShowNote(false)}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="About" />
            <div className="px-5 py-4 text-sm text-swiss-muted">
              {role?.bio || <span className="text-swiss-label">No bio provided.</span>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Skills" />
            {profile?.skills?.length ? (
              <div className="flex flex-wrap gap-1.5 p-5">
                {profile.skills.map((skill) => (
                  <Badge key={skill.id ?? skill.name}>{skill.name}</Badge>
                ))}
              </div>
            ) : (
              <EmptyState title="No skills listed" />
            )}
          </Card>

          <Card>
            <CardHeader title="Education" />
            {profile?.education?.length ? (
              <ul className="divide-y divide-swiss-border">
                {profile.education.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-swiss-text">{entry.institution}</p>
                    <p className="text-sm text-swiss-muted">
                      {[entry.degree, entry.field_of_study].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-xs text-swiss-label">
                      {[entry.start_year, entry.end_year].filter(Boolean).join(' - ')}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No education listed" />
            )}
          </Card>

          <Card>
            <CardHeader title="Experience" />
            {profile?.experience?.length ? (
              <ul className="divide-y divide-swiss-border">
                {profile.experience.map((entry) => (
                  <li key={entry.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-swiss-text">{entry.position_title}</p>
                    <p className="text-sm text-swiss-muted">{entry.company_name}</p>
                    <p className="text-xs text-swiss-label">
                      {[
                        entry.start_date ? new Date(entry.start_date).getFullYear() : null,
                        entry.is_current ? 'Present' : entry.end_date
                          ? new Date(entry.end_date).getFullYear() : null,
                      ].filter(Boolean).join(' - ')}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No experience listed" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <Detail label="Member since" value={profile?.user?.memberSince} />
              <Detail label="Industry" value={role?.industry} />
              <Detail label="Open to mentoring" value={role?.is_open_to_mentor ? 'Yes' : 'No'} />
              <Detail
                label="Contact"
                value={profile?.contact?.email}
                privateHint="Shared only when you are connected"
              />
            </dl>
          </Card>

          {profile?.socialLinks?.length ? (
            <Card>
              <CardHeader title="Links" />
              <ul className="divide-y divide-swiss-border">
                {profile.socialLinks.map((link) => (
                  <li key={link.id} className="px-5 py-2.5">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sm text-swiss-text underline underline-offset-2"
                    >
                      {link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, privateHint }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-swiss-label">{label}</dt>
      <dd className="mt-0.5 text-swiss-text">
        {value || <span className="text-swiss-label">{privateHint ?? 'Not provided'}</span>}
      </dd>
    </div>
  )
}
