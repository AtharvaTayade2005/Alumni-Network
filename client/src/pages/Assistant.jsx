import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ai } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Card, Button, Input, EmptyState, Badge, Spinner } from '../components/ui.jsx'

const STARTER_PROMPTS = [
  { label: 'Find matching jobs', query: 'Which jobs match my profile and current skills?' },
  { label: 'Find alumni mentors', query: 'Who would be a good alumni mentor for me?' },
  { label: 'Backend skills roadmap', query: 'What skills should I learn for backend development?' },
  { label: 'Profile enhancement', query: 'How can I improve my profile to stand out to campus recruiters?' },
]

export default function Assistant() {
  const { user } = useAuth()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(() => [
    {
      id: 1,
      role: 'assistant',
      text: `Hello ${user?.name || user?.firstName || 'there'}! I am your AI Career & Networking Advisor for the Vidyalankar Institute of Technology alumni network.

I can help you:
- **Discover matching jobs** based on your technical skills
- **Find verified alumni mentors** from Google, Microsoft, and tech partners
- **Evaluate skill gaps** and create progressive learning roadmaps
- **Prepare for interviews** with guidance tailored to campus recruiters

How can I assist your career journey today?`,
      suggestedActions: [
        { label: 'Find Recommended Mentors', query: 'Find mentors in software engineering and systems design' },
        { label: 'Explore Active Jobs', query: 'Which jobs match my skills and profile?' },
        { label: 'What skills should I learn next?', query: 'What skills should I learn for backend development?' },
      ],
      recommendations: null,
    },
  ])
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleReset() {
    setMessages([
      {
        id: Date.now(),
        role: 'assistant',
        text: `Conversation reset. I am ready to help you with job matching, finding alumni mentors, or advising on skill development. What would you like to explore?`,
        suggestedActions: [
          { label: 'Find Recommended Mentors', query: 'Find mentors in software engineering and systems design' },
          { label: 'Explore Active Jobs', query: 'Which jobs match my skills and profile?' },
          { label: 'Backend Skills Roadmap', query: 'What skills should I learn for backend development?' },
        ],
        recommendations: null,
      },
    ])
    setDraft('')
    inputRef.current?.focus()
  }

  async function handleSend(textToSend) {
    const text = (textToSend || draft).trim()
    if (!text || loading) return

    const userMsg = { id: Date.now(), role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setLoading(true)

    // Build context window of recent messages
    const historyPayload = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }))

    try {
      const response = await ai.chat(text, historyPayload)
      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: response.text || 'I have analyzed your request based on platform directory data.',
        suggestedActions: response.suggestedActions || [],
        recommendations: response.recommendations || null,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      let friendlyError = 'I ran into a temporary hiccup processing your request. Please try asking again.'
      if (err?.status === 429) {
        friendlyError = 'AI request limit reached. Please wait a moment before sending another query.'
      } else if (err?.status === 503) {
        friendlyError = 'The AI advisory service is currently unavailable. Please verify connection and retry.'
      }
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: friendlyError,
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-swiss-border pb-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-1">
            10 &mdash; CAREER INTELLIGENCE & ADVISORY
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-swiss-text">
            AI CAREER ASSISTANT
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleReset}
            disabled={loading}
            className="text-xs font-mono"
            title="Start a fresh conversation"
          >
            NEW CHAT
          </Button>
          <Link to="/job-readiness">
            <Button size="sm" variant="secondary">JOB READINESS →</Button>
          </Link>
          <Link to="/resume-analyzer">
            <Button size="sm" variant="secondary">RESUME ANALYZER →</Button>
          </Link>
        </div>
      </header>

      {/* Main Chat Box */}
      <Card className="flex flex-col flex-1 overflow-hidden border border-swiss-border">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[80%] rounded-sm px-4 py-3.5 text-xs sm:text-sm space-y-3.5 ${
                  msg.role === 'user'
                    ? 'bg-swiss-text text-swiss-base'
                    : msg.isError
                      ? 'bg-red-950/20 border border-red-900/40 text-red-400'
                      : 'bg-swiss-surface border border-swiss-border text-swiss-text'
                }`}
              >
                {/* Header Tag */}
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={msg.role === 'user' ? 'slate' : msg.isError ? 'red' : 'blue'}>
                    {msg.role === 'user' ? 'YOU' : 'AI CAREER ADVISOR'}
                  </Badge>
                  {msg.role !== 'user' && (
                    <span className="font-mono text-[10px] text-swiss-muted uppercase tracking-wider">
                      GROUNDED IN POSTGRESQL DATA
                    </span>
                  )}
                </div>

                {/* Message Body */}
                <div className="whitespace-pre-wrap leading-relaxed space-y-2">
                  {msg.text}
                </div>

                {/* Real Recommendation Cards: Mentors */}
                {msg.recommendations?.mentors?.length > 0 && (
                  <div className="pt-2 border-t border-swiss-border/50 space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-swiss-label">
                      Recommended Mentors from Platform Directory:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {msg.recommendations.mentors.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-xs border border-swiss-border bg-swiss-base space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-xs text-swiss-text">{m.name}</span>
                            <Badge tone="blue">MENTOR</Badge>
                          </div>
                          <p className="text-[11px] text-swiss-muted">
                            {m.role} &bull; {m.company}
                          </p>
                          <p className="text-[10px] font-mono text-swiss-label">
                            Expertise: {m.expertise}
                          </p>
                          <p className="text-[10px] text-green-500 font-mono">
                            {m.matchReason}
                          </p>
                          <div className="pt-1 flex gap-2">
                            <Link to={`/alumni/${m.id}`}>
                              <Button size="sm" variant="secondary" className="text-[10px] py-1 px-2">
                                View Profile
                              </Button>
                            </Link>
                            <Link to="/mentorship">
                              <Button size="sm" variant="secondary" className="text-[10px] py-1 px-2">
                                Request Mentorship
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Real Recommendation Cards: Jobs */}
                {msg.recommendations?.jobs?.length > 0 && (
                  <div className="pt-2 border-t border-swiss-border/50 space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-swiss-label">
                      Matching Job Openings from Job Board:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {msg.recommendations.jobs.map((j) => (
                        <div
                          key={j.id}
                          className="p-3 rounded-xs border border-swiss-border bg-swiss-base space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-xs text-swiss-text">{j.title}</span>
                            <Badge tone="slate">JOB</Badge>
                          </div>
                          <p className="text-[11px] text-swiss-muted">
                            {j.companyName} &bull; {j.location}
                          </p>
                          {j.skills?.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {j.skills.slice(0, 3).map((s) => (
                                <span key={s} className="px-1.5 py-0.5 text-[9px] font-mono bg-swiss-surface border border-swiss-border text-swiss-muted">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-green-500 font-mono">
                            {j.matchReason}
                          </p>
                          <div className="pt-1">
                            <Link to={`/jobs/${j.id}`}>
                              <Button size="sm" variant="secondary" className="text-[10px] py-1 px-2">
                                View Job →
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Real Recommendation Cards: Alumni */}
                {msg.recommendations?.people?.length > 0 && (
                  <div className="pt-2 border-t border-swiss-border/50 space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-swiss-label">
                      Alumni Matches in Directory:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {msg.recommendations.people.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-xs border border-swiss-border bg-swiss-base space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-xs text-swiss-text">{p.name}</span>
                            <Badge tone="slate">ALUMNI</Badge>
                          </div>
                          <p className="text-[11px] text-swiss-muted">
                            {p.headline || `${p.currentRole} at ${p.currentCompany}`}
                          </p>
                          {p.skills?.length > 0 && (
                            <p className="text-[10px] font-mono text-swiss-label">
                              Skills: {p.skills.slice(0, 3).join(', ')}
                            </p>
                          )}
                          <p className="text-[10px] text-green-500 font-mono">
                            {p.matchReason}
                          </p>
                          <div className="pt-1 flex gap-2">
                            <Link to={`/alumni/${p.id}`}>
                              <Button size="sm" variant="secondary" className="text-[10px] py-1 px-2">
                                View Profile
                              </Button>
                            </Link>
                            <Link to={`/messages/${p.id}`}>
                              <Button size="sm" variant="secondary" className="text-[10px] py-1 px-2">
                                Message →
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Follow-up Actions */}
                {msg.suggestedActions?.length > 0 && (
                  <div className="pt-2 border-t border-swiss-border/50 flex flex-wrap gap-2">
                    {msg.suggestedActions.map((act, idx) => {
                      if (act.to) {
                        return (
                          <Link key={idx} to={act.to}>
                            <Button size="sm" variant="secondary" className="text-[11px] font-mono">
                              {act.label} →
                            </Button>
                          </Link>
                        )
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSend(act.query || act.label)}
                          disabled={loading}
                          className="px-2.5 py-1 text-[11px] font-mono rounded-xs border border-swiss-border hover:bg-swiss-surface-hover text-swiss-text transition-colors disabled:opacity-50"
                        >
                          {act.label} →
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-swiss-surface border border-swiss-border text-swiss-muted rounded-sm px-4 py-3 text-xs flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5" />
                <span className="font-mono text-xs uppercase tracking-widest text-swiss-label">
                  Searching directory & querying AI advisor...
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Starter Prompts Bar (when only 1 or 2 messages) */}
        {messages.length <= 2 && (
          <div className="px-4 py-2 border-t border-swiss-border/50 bg-swiss-surface/50 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="font-mono text-[10px] text-swiss-label uppercase shrink-0">STARTERS:</span>
            {STARTER_PROMPTS.map((sp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(sp.query)}
                disabled={loading}
                className="shrink-0 text-[11px] px-2 py-1 rounded-xs border border-swiss-border hover:bg-swiss-surface text-swiss-text transition-colors disabled:opacity-50"
              >
                {sp.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="border-t border-swiss-border p-3 sm:p-4 bg-swiss-base flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about mentorship, career roadmaps, matching jobs, or interview advice..."
            className="flex-1 text-xs sm:text-sm"
            disabled={loading}
          />
          <Button type="submit" disabled={!draft.trim() || loading}>
            {loading ? <Spinner /> : 'SEND →'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
