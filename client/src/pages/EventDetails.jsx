import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { events } from '../services/api.js'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock,
  Spinner
} from '../components/ui.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

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
    if (!event || busy) return
    setBusy(true)
    setMessage(null)
    try {
      if (event.hasRsvpd) {
        const res = await events.cancelRsvp(event.id)
        setMessage({ tone: 'info', text: res?.message || 'RSVP cancelled successfully.' })
      } else {
        const res = await events.rsvp(event.id)
        setMessage({ tone: 'success', text: res?.message || 'RSVP confirmed! You are registered for this event.' })
      }
      await loadEvent()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to update RSVP. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Card><LoadingBlock rows={8} label="Loading event details" /></Card>
  }

  if (error || !event) {
    const isNotFound = error?.status === 404 || error?.status === 422
    if (!isNotFound && error) {
      return (
        <Card className="p-8">
          <ErrorState error={error} onRetry={loadEvent} />
        </Card>
      )
    }
    return (
      <Card className="p-8">
        <EmptyState
          title="EVENT NOT FOUND"
          description={error?.message || "The requested event could not be found or has been removed."}
          action={
            <Button variant="secondary" onClick={() => navigate('/events')}>
              ← Back to Events
            </Button>
          }
        />
      </Card>
    )
  }

  const organizerName = typeof event.organizer === 'object'
    ? (event.organizer?.name || 'Alumni Network')
    : (event.organizer || 'Alumni Network')
  const organizerAvatar = typeof event.organizer === 'object' ? event.organizer?.avatarUrl : null
  const isFull = Boolean(event.capacity && (event.attendeesCount >= event.capacity) && !event.hasRsvpd)

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate('/events')}
          className="text-xs font-mono tracking-widest text-swiss-muted hover:text-swiss-text uppercase transition-colors"
        >
          ← BACK TO EVENTS
        </button>

        {message && (
          <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}

        <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-swiss-border pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge tone={event.isVirtual ? 'blue' : 'green'}>
                {event.isVirtual ? 'VIRTUAL EVENT' : 'IN-PERSON EVENT'}
              </Badge>
              {event.categoryLabel || event.category ? (
                <Badge tone="slate">{event.categoryLabel || event.category}</Badge>
              ) : null}
              {isFull ? (
                <Badge tone="amber">AT CAPACITY</Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
              {event.title}
            </h1>
            <div className="flex items-center gap-2 mt-3">
              {organizerAvatar ? (
                <img
                  src={organizerAvatar}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover border border-swiss-border shrink-0"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-swiss-border flex items-center justify-center font-mono text-[9px] font-bold text-swiss-text shrink-0">
                  {organizerName.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="font-mono text-xs text-swiss-muted">
                Organized by <strong className="text-swiss-text font-semibold">{organizerName}</strong>
                {event.date ? ` · ${new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
                {event.time ? ` at ${event.time}` : ''}
                {event.endTime ? ` – ${event.endTime}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              size="lg"
              variant={event.hasRsvpd ? "secondary" : "primary"}
              disabled={busy || isFull}
              onClick={handleRsvpToggle}
            >
              {busy ? (
                <><Spinner /> Processing...</>
              ) : event.hasRsvpd ? (
                '✓ RSVP CONFIRMED (CANCEL)'
              ) : isFull ? (
                'EVENT AT CAPACITY'
              ) : (
                'CONFIRM RSVP →'
              )}
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

                {event.isVirtual && (event.virtualUrl || event.virtualLink) && (
                  <div className="p-4 border border-blue-500/40 bg-blue-950/10 rounded-sm space-y-2">
                    <p className="font-mono text-xs font-bold text-swiss-text uppercase tracking-wider">
                      Virtual Meeting Access:
                    </p>
                    <p className="text-xs text-swiss-muted">
                      This session is broadcast live. Access the virtual auditorium via the meeting link below:
                    </p>
                    <a
                      href={event.virtualUrl || event.virtualLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-block font-mono text-xs text-blue-400 underline font-semibold break-all"
                    >
                      {event.virtualUrl || event.virtualLink} →
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
                      <div className="h-10 w-10 flex items-center justify-center bg-swiss-border font-mono text-xs font-bold rounded-xs shrink-0">
                        0{idx + 1}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-swiss-text">{sp.name}</p>
                        <p className="text-xs text-swiss-muted">{sp.title || sp.role || 'Speaker'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar Event Logistics */}
          <div className="space-y-6">
            <Card className="p-6 space-y-4 font-mono text-xs">
              <h3 className="text-xs font-bold uppercase tracking-widest text-swiss-label border-b border-swiss-border pb-2">
                EVENT LOGISTICS
              </h3>
              <div className="space-y-3 divide-y divide-swiss-border">
                <div className="pt-2">
                  <span className="text-swiss-label uppercase text-[10px] block">Location / Venue:</span>
                  <span className="text-swiss-text font-medium">{event.location || event.venue || 'Campus Auditorium'}</span>
                  {event.venueAddress && (
                    <span className="text-swiss-muted block text-[11px] mt-0.5">{event.venueAddress}</span>
                  )}
                </div>
                <div className="pt-2">
                  <span className="text-swiss-label uppercase text-[10px] block">Organizer:</span>
                  <span className="text-swiss-text font-medium">{organizerName}</span>
                </div>
                <div className="pt-2">
                  <span className="text-swiss-label uppercase text-[10px] block">Capacity & Attendance:</span>
                  <span className="text-swiss-text font-medium">
                    {event.attendeesCount || 0} Registered of {event.capacity || 100} Max
                  </span>
                </div>
                <div className="pt-2">
                  <span className="text-swiss-label uppercase text-[10px] block">Your Attendance Status:</span>
                  <span className={event.hasRsvpd ? "text-emerald-500 font-bold" : "text-swiss-muted"}>
                    {event.hasRsvpd ? "✓ RSVP CONFIRMED" : "NOT REGISTERED"}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-swiss-border">
                <Button
                  variant={event.hasRsvpd ? "secondary" : "primary"}
                  className="w-full justify-center"
                  disabled={busy || isFull}
                  onClick={handleRsvpToggle}
                >
                  {busy ? <Spinner /> : event.hasRsvpd ? 'Cancel Registration' : isFull ? 'Event Full' : 'Register for Event'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
