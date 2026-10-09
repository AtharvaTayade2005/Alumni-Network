import { useEffect, useState } from 'react'
import { announcements } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, Select, Textarea, Spinner, cx
} from '../components/ui.jsx'

export default function Announcements() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Form state
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState(user?.department || 'Computer Science')
  const [targetAudience, setTargetAudience] = useState('ALL')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('published')
  const [isPinned, setIsPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  async function loadAnnouncements() {
    setLoading(true)
    setError(null)
    try {
      const res = await announcements.list({ includeDrafts: true })
      setList(res.data || [])
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await announcements.create({
        title,
        department,
        targetAudience,
        content,
        status,
        isPinned,
      })
      setMessage({ tone: 'success', text: res.message })
      setCreating(false)
      setTitle('')
      setContent('')
      loadAnnouncements()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to create announcement.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    setBusyId(id)
    try {
      await announcements.remove(id)
      setMessage({ tone: 'info', text: 'Announcement deleted.' })
      loadAnnouncements()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            06 &mdash; OFFICIAL COMMUNICATIONS
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            CAMPUS ANNOUNCEMENTS
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Broadcast official notices, research symposium calls, career clinics, and department bulletins across the alumni and student body.
          </p>
        </div>
        <Button onClick={() => setCreating(!creating)}>
          {creating ? 'CANCEL' : '+ CREATE ANNOUNCEMENT'}
        </Button>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {creating && (
        <Card className="border-2 border-swiss-text">
          <CardHeader
            title="DRAFT NEW ANNOUNCEMENT"
            description="Specify target audience, content, and broadcast options"
          />
          <form onSubmit={handleCreate} className="p-6 space-y-5">
            <Field label="Announcement Title" required>
              <Input
                placeholder="e.g. Call for Papers: Departmental Research Symposium 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department / Origin">
                <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="Computer Science">Computer Science & Engineering</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics & Communication</option>
                  <option value="University-Wide">University-Wide Administration</option>
                </Select>
              </Field>

              <Field label="Target Audience">
                <Select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}>
                  <option value="ALL">All Network Members</option>
                  <option value="ALL_STUDENTS">All Enrolled Students</option>
                  <option value="SENIORS_JUNIORS">3rd & 4th Year Students</option>
                  <option value="ALUMNI">Alumni Only</option>
                  <option value="FACULTY">Faculty & Staff</option>
                </Select>
              </Field>
            </div>

            <Field label="Announcement Body" required hint="Markdown supported">
              <Textarea
                rows={6}
                placeholder="Enter detailed announcement content..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-swiss-border">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-mono text-swiss-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="rounded-xs"
                  />
                  PIN TO TOP OF DASHBOARD
                </label>
                <label className="flex items-center gap-2 text-xs font-mono text-swiss-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={status === 'draft'}
                    onChange={(e) => setStatus(e.target.checked ? 'draft' : 'published')}
                    className="rounded-xs"
                  />
                  SAVE AS DRAFT ONLY
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <><Spinner /> PUBLISHING...</> : 'PUBLISH ANNOUNCEMENT →'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Announcements Stream */}
      {loading ? (
        <Card><LoadingBlock rows={6} label="Loading campus bulletins" /></Card>
      ) : error ? (
        <Card><ErrorState error={error} onRetry={loadAnnouncements} /></Card>
      ) : list.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title="NO ANNOUNCEMENTS"
            description="No active announcements on record. Click 'Create Announcement' to broadcast one."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((ann) => {
            const isAuthor = ann.authorId === user?.id || user?.roles?.includes('ADMIN')
            return (
              <Card key={ann.id} className={cx(ann.isPinned && 'border-l-4 border-l-swiss-text')}>
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        {ann.isPinned && <Badge tone="amber">PINNED</Badge>}
                        <Badge tone="blue">{ann.targetAudienceLabel || ann.targetAudience}</Badge>
                        <Badge tone="slate">{ann.department}</Badge>
                        {ann.status === 'draft' && <Badge tone="red">DRAFT</Badge>}
                      </div>
                      <h2 className="text-xl font-bold tracking-tight text-swiss-text">
                        {ann.title}
                      </h2>
                      <p className="font-mono text-xs text-swiss-muted mt-1">
                        By {ann.authorName} ({ann.authorRole}) · {ann.publishedAt ? new Date(ann.publishedAt).toLocaleDateString() : 'Unpublished Draft'}
                      </p>
                    </div>

                    {isAuthor && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 font-mono text-xs"
                        disabled={busyId === ann.id}
                        onClick={() => handleDelete(ann.id)}
                      >
                        {busyId === ann.id ? <Spinner /> : 'DELETE'}
                      </Button>
                    )}
                  </div>

                  <p className="text-sm text-swiss-text leading-relaxed whitespace-pre-line border-t border-swiss-border pt-4">
                    {ann.content}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-swiss-label pt-2">
                    <span>SEEN BY {ann.viewsCount || 1} MEMBERS</span>
                    <span>ANNOUNCEMENT ID: {ann.id}</span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
