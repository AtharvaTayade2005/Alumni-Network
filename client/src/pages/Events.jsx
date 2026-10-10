import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { events } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Select, Textarea, Spinner, cx
} from '../components/ui.jsx'

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'discover', label: 'Discover All' },
  { id: 'my_events', label: 'My Events / RSVPs' },
  { id: 'past', label: 'Past Events' },
]

export default function Events() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('upcoming')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Event Creation Form
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('networking')
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('150')
  const [isVirtual, setIsVirtual] = useState(false)
  const [virtualLink, setVirtualLink] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const res = await events.list({ tab: activeTab })
      setList(res.data || [])
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [activeTab, user?.id])

  async function handleRsvpToggle(eventId, currentlyRsvpd) {
    setBusyId(eventId)
    setMessage(null)
    try {
      if (currentlyRsvpd) {
        const res = await events.cancelRsvp(eventId)
        setMessage({ tone: 'info', text: res.message })
      } else {
        const res = await events.rsvp(eventId)
        setMessage({ tone: 'success', text: res.message })
      }
      loadEvents()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim() || !date || !location.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await events.create({
        title,
        date,
        time,
        endTime,
        location,
        category,
        description,
        capacity,
        isVirtual,
        virtualLink: isVirtual ? virtualLink : null,
      })
      setMessage({ tone: 'success', text: res.message })
      setCreating(false)
      setTitle('')
      setDescription('')
      setLocation('')
      loadEvents()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to create event.' })
    } finally {
      setSaving(false)
    }
  }

  if (creating) {
    return (
      <div className="space-y-6">
        <header className="mb-4">
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">03 &mdash; EVENTS</p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">HOST AN EVENT</h1>
          <p className="mt-1 text-sm text-swiss-muted">
            Create an alumni reunion, networking mixer, or technical workshop for the network.
          </p>
        </header>

        <Card className="max-w-2xl p-6">
          <form className="space-y-5" onSubmit={handleCreate}>
            <Field label="Event Title" required>
              <Input
                placeholder="e.g. Annual Tech Alumni Mixer 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start Time">
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
                <Field label="End Time">
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="networking">Networking Mixer</option>
                  <option value="workshop">Technical Workshop</option>
                  <option value="reunion">Alumni Reunion</option>
                  <option value="career_talk">Career Talk / Masterclass</option>
                </Select>
              </Field>
              <Field label="Capacity (Max Attendees)">
                <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} min="10" />
              </Field>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="virtualCheckbox"
                checked={isVirtual}
                onChange={(e) => setIsVirtual(e.target.checked)}
                className="rounded-xs"
              />
              <label htmlFor="virtualCheckbox" className="text-xs font-mono text-swiss-text cursor-pointer">
                THIS IS A VIRTUAL / ONLINE WEBINAR
              </label>
            </div>

            <Field label="Location / Venue Address" required>
              <Input
                placeholder={isVirtual ? "e.g. Zoom Virtual Auditorium" : "e.g. Taj Lands End, Mumbai"}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </Field>

            {isVirtual && (
              <Field label="Virtual Meeting Link (Zoom / Meet URL)">
                <Input
                  placeholder="https://zoom.us/j/..."
                  value={virtualLink}
                  onChange={(e) => setVirtualLink(e.target.value)}
                />
              </Field>
            )}

            <Field label="Event Description" required>
              <Textarea
                rows={4}
                placeholder="What attendees should expect, key takeaways, and speaker agenda..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </Field>

            <div className="pt-4 border-t border-swiss-border flex items-center gap-3">
              <Button type="button" onClick={() => setCreating(false)} variant="secondary">Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Spinner /> PUBLISHING...</> : 'PUBLISH EVENT →'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
        <header>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">03 &mdash; EVENTS & REUNIONS</p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">EVENTS & REUNIONS</h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-xl">
            Discover milestone alumni reunions, technical deep-dives, career masterclasses, and networking mixers across major cities.
          </p>
        </header>
        <Button onClick={() => setCreating(true)}>+ HOST AN EVENT</Button>
      </div>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Tabs */}
      <nav className="flex flex-wrap items-center gap-2 border-b border-swiss-border pb-px" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              'px-4 py-2 text-xs font-mono font-medium border-b-2 transition-colors uppercase tracking-wider',
              activeTab === tab.id
                ? 'border-swiss-text text-swiss-text font-bold'
                : 'border-transparent text-swiss-muted hover:text-swiss-text hover:border-swiss-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Events Listing */}
      {loading ? (
        <Card><LoadingBlock rows={6} label="Loading events schedule" /></Card>
      ) : error ? (
        <Card><ErrorState error={error} onRetry={loadEvents} /></Card>
      ) : list.length === 0 ? (
        <Card className="p-10">
          <EmptyState
            title="NO EVENTS IN THIS VIEW"
            description="There are currently no events matching this filter. Switch tabs or host a new gathering."
          />
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((evt) => (
            <Card key={evt.id} className="flex flex-col justify-between overflow-hidden">
              <div className="p-5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <Badge tone={evt.isVirtual ? 'blue' : 'green'}>
                    {evt.isVirtual ? 'VIRTUAL' : 'IN-PERSON'}
                  </Badge>
                  <span className="font-mono text-[10px] text-swiss-label font-bold uppercase">
                    {evt.categoryLabel || evt.category}
                  </span>
                </div>

                <div>
                  <Link to={`/events/${evt.id}`} className="block font-bold text-base text-swiss-text hover:underline leading-snug">
                    {evt.title}
                  </Link>
                  <p className="font-mono text-xs text-swiss-muted mt-1">
                    {new Date(evt.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {evt.time}
                  </p>
                  <p className="text-xs text-swiss-label font-mono mt-0.5 truncate">
                    {evt.location}
                  </p>
                </div>

                <p className="text-xs text-swiss-text line-clamp-3 leading-relaxed">
                  {evt.description}
                </p>

                {evt.speakers?.length > 0 && (
                  <div className="pt-2 border-t border-swiss-border font-mono text-[11px] text-swiss-muted">
                    <span className="text-swiss-label uppercase text-[10px] block">Keynote Speaker:</span>
                    <span>{evt.speakers[0].name} ({evt.speakers[0].title})</span>
                  </div>
                )}
              </div>

              <div className="p-5 bg-swiss-surface border-t border-swiss-border flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-swiss-label">
                  {evt.attendeesCount || 0} / {evt.capacity} ATTENDING
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={evt.hasRsvpd ? "secondary" : "primary"}
                    disabled={busyId === evt.id}
                    onClick={() => handleRsvpToggle(evt.id, evt.hasRsvpd)}
                  >
                    {busyId === evt.id ? <Spinner /> : evt.hasRsvpd ? 'CANCEL RSVP' : 'RSVP NOW'}
                  </Button>
                  <Link to={`/events/${evt.id}`}>
                    <Button size="sm" variant="ghost">DETAILS</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
