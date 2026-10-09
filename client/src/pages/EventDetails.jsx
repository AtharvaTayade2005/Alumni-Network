import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { events } from '../services/api.js'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock,
  Spinner, cx
} from '../components/ui.jsx'

export default function EventDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function loadEvent() {
    setLoading(true)
    setError(null)
    try {
      const res = await events.byId(id)
      setEvent(res.data)
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvent()
  }, [id])

  async function handleRsvpToggle() {
    if (!event) return
    setBusy(true)
    setMessage(null)
    try {
      if (event.hasRsvpd) {
        const res = await events.cancelRsvp(event.id)
        setMessage({ tone: 'info', text: res.message })
      } else {
        const res = await events.rsvp(event.id)
        setMessage({ tone: 'success', text: res.message })
      }
      loadEvent()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Card><LoadingBlock rows={8} label="Loading event details" /></Card>
  }

  if (error || !event) {
    return <Card><ErrorState error={error || new Error('Event not found')} onRetry={loadEvent} /></Card>
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-xs font-mono tracking-widest text-swiss-muted hover:text-swiss-text uppercase"
      >
        ← BACK TO EVENTS
      </button>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-swiss-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={event.isVirtual ? 'blue' : 'green'}>
              {event.isVirtual ? 'VIRTUAL EVENT' : 'IN-PERSON EVENT'}
            </Badge>
            <Badge tone="slate">{event.categoryLabel || event.category}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            {event.title}
          </h1>
          <p className="font-mono text-xs text-swiss-muted mt-2">
            Organized by {event.organizer} · Date: {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {event.time} - {event.endTime}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="lg"
            variant={event.hasRsvpd ? "secondary" : "primary"}
            disabled={busy}
            onClick={handleRsvpToggle}
          >
            {busy ? <Spinner /> : event.hasRsvpd ? '&check; RSVP CONFIRMED (CANCEL)' : 'CONFIRM RSVP →'}
          </Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title="ABOUT THIS EVENT" />
            <div className="p-6 space-y-4">
              <p className="text-sm text-swiss-text leading-relaxed whitespace-pre-line">
                {event.description}
              </p>

              {event.isVirtual && event.virtualLink && (
                <div className="p-4 border border-blue-500/40 bg-blue-950/10 rounded-sm space-y-2">
                  <p className="font-mono text-xs font-bold text-swiss-text uppercase tracking-wider">
                    Virtual Meeting Access:
                  </p>
                  <p className="text-xs text-swiss-muted">
                    This webinar is broadcast live via Zoom. Click below to launch the video auditorium:
                  </p>
                  <a
                    href={event.virtualLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-block font-mono text-xs text-blue-400 underline font-semibold"
                  >
                    {event.virtualLink} →
                  </a>
                </div>
              )}
            </div>
          </Card>

          {event.speakers?.length > 0 && (
            <Card>
              <CardHeader title="SPEAKERS & KEYNOTE PANELISTS" />
              <div className="divide-y divide-swiss-border">
                {event.speakers.map((sp, idx) => (
                  <div key={idx} className="p-5 flex items-center gap-4">
                    <div className="h-10 w-10 flex items-center justify-center bg-swiss-border font-mono text-xs font-bold rounded-xs">
                      0{idx + 1}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-swiss-text">{sp.name}</p>
                      <p className="text-xs text-swiss-muted">{sp.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar Event Meta */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4 font-mono text-xs">
            <h3 className="text-xs font-bold uppercase tracking-widest text-swiss-label">
              EVENT LOGISTICS
            </h3>
            <div className="space-y-3 divide-y divide-swiss-border">
              <div className="pt-2">
                <span className="text-swiss-label uppercase text-[10px] block">Location / Venue:</span>
                <span className="text-swiss-text font-medium">{event.location}</span>
                {event.venueAddress && (
                  <span className="text-swiss-muted block text-[11px] mt-0.5">{event.venueAddress}</span>
                )}
              </div>
              <div className="pt-2">
                <span className="text-swiss-label uppercase text-[10px] block">Capacity & Attendance:</span>
                <span className="text-swiss-text font-medium">{event.attendeesCount || 0} Registered of {event.capacity} Max</span>
              </div>
              <div className="pt-2">
                <span className="text-swiss-label uppercase text-[10px] block">Your Status:</span>
                <span className={event.hasRsvpd ? "text-emerald-500 font-bold" : "text-swiss-muted"}>
                  {event.hasRsvpd ? "RSVP CONFIRMED" : "NOT REGISTERED"}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-swiss-border">
              <Button
                variant={event.hasRsvpd ? "secondary" : "primary"}
                className="w-full justify-center"
                disabled={busy}
                onClick={handleRsvpToggle}
              >
                {event.hasRsvpd ? 'Cancel Registration' : 'Register for Event'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
