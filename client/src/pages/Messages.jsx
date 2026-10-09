import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { messages } from '../services/api.js'
import {
  Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, LoadingBlock,
  Spinner, Textarea, cx,
} from '../components/ui.jsx'

function relativeTime(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  const seconds = Math.round((Date.now() - then) / 1000)
  if (Number.isNaN(seconds)) return ''
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

function clockTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Messages() {
  const { peerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [conversations, setConversations] = useState({ loading: true, rows: [], error: null })
  const [thread, setThread] = useState({ loading: Boolean(peerId), rows: [], error: null })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef = useRef(null)

  const loadConversations = useCallback(async () => {
    setConversations((prev) => ({ ...prev, loading: true }))
    try {
      const response = await messages.conversations()
      setConversations({ loading: false, rows: response.data ?? [], error: null })
    } catch (error) {
      setConversations({ loading: false, rows: [], error })
    }
  }, [])

  const loadThread = useCallback(async (id) => {
    setThread({ loading: true, rows: [], error: null })
    try {
      const response = await messages.withPeer(id)
      setThread({ loading: false, rows: response.data ?? [], error: null })
    } catch (error) {
      setThread({ loading: false, rows: [], error })
    }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => {
    if (peerId) loadThread(peerId)
    else setThread({ loading: false, rows: [], error: null })
  }, [peerId, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.rows.length])

  const active = conversations.rows.find((row) => row.peerId === peerId)

  async function send(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !peerId) return
    setSending(true)
    setSendError(null)
    try {
      await messages.send(peerId, body)
      setDraft('')
      await loadThread(peerId)
      loadConversations()
    } catch (error) {
      setSendError(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="mb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">06 &mdash; MESSAGES</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">MESSAGES</h1>
        <p className="mt-2 text-sm text-swiss-muted">
          Conversations with your connections.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className={cx("h-fit overflow-hidden", peerId ? "hidden lg:block" : "block")}>
          <div className="border-b border-swiss-border px-4 py-3">
            <h2 className="text-sm font-semibold text-swiss-text">Conversations</h2>
          </div>

          {conversations.loading ? (
            <LoadingBlock rows={4} />
          ) : conversations.error ? (
            <ErrorState error={conversations.error} onRetry={loadConversations} />
          ) : conversations.rows.length === 0 ? (
            <EmptyState
              title="No conversations yet"
              description="Connect with a member to start messaging."
              action={(
                <Link to="/directory">
                  <Button variant="secondary" size="sm">Browse directory</Button>
                </Link>
              )}
            />
          ) : (
            <ul className="max-h-[32rem] divide-y divide-swiss-border overflow-y-auto">
              {conversations.rows.map((row) => (
                <li key={row.peerId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/messages/${row.peerId}`)}
                    className={cx(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-swiss-surface',
                      row.peerId === peerId && 'bg-swiss-surface',
                    )}
                  >
                    <div className="relative">
                      <Avatar name={row.name} src={row.avatarUrl} />
                      {row.isOnline ? (
                        <span
                          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"
                          title="Online"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                         <p className="truncate text-sm font-medium text-swiss-text">{row.name}</p>
                        <span className="shrink-0 text-xs text-swiss-label">
                          {relativeTime(row.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-swiss-muted">
                          {row.lastMessage ?? 'No messages yet'}
                        </p>
                        {row.unreadCount > 0 ? (
                          <Badge tone="blue">{row.unreadCount}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className={cx("flex-col overflow-hidden h-[32rem]", peerId ? "flex" : "hidden lg:flex")}>
          {!peerId ? (
            <EmptyState
              title="Select a conversation"
              description="Choose someone from the list to read your history."
            />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-swiss-border px-5 py-3">
                <button
                  type="button"
                  className="lg:hidden text-swiss-muted hover:text-swiss-text p-1"
                  onClick={() => navigate('/messages')}
                >
                  ←
                </button>
                <Avatar name={active?.name} src={active?.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-swiss-text">
                    {active?.name ?? 'Conversation'}
                  </p>
                  <p className="text-xs text-swiss-label">
                    {active?.isOnline ? 'Online now' : 'Offline'}
                  </p>
                </div>
                <Link to={`/alumni/${peerId}`}>
                  <Button variant="secondary" size="sm">View profile</Button>
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto bg-swiss-surface px-5 py-4">
                {thread.loading ? (
                  <LoadingBlock rows={3} />
                ) : thread.error ? (
                  <ErrorState error={thread.error} onRetry={() => loadThread(peerId)} />
                ) : thread.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-swiss-label">
                    No messages yet. Say hello.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {thread.rows.map((message) => (
                      <li key={message.id} className="flex">
                        <Bubble message={message} mine={message.senderId === user?.id} />
                      </li>
                    ))}
                    <div ref={bottomRef} />
                  </ul>
                )}
              </div>

              <form onSubmit={send} className="border-t border-swiss-border p-4">
                {sendError ? (
                  <div className="mb-3">
                    <Alert tone="error">{sendError.message}</Alert>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message"
                    className="flex-1 resize-none"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        send(event)
                      }
                    }}
                  />
                  <Button type="submit" disabled={sending || !draft.trim()}>
                    {sending ? <Spinner /> : 'Send'}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-swiss-label">Ctrl+Enter to send</p>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function Bubble({ message, mine }) {
  return (
    <div className={cx('max-w-[75%] rounded-sm px-3.5 py-2 border border-swiss-border', mine
      ? 'ml-auto bg-slate-900 text-white'
      : 'bg-swiss-surface text-swiss-text')}
    >
      <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
      <p className={cx('mt-1 text-[11px]', mine ? 'text-swiss-border' : 'text-swiss-label')}>
        {clockTime(message.createdAt)}
        {mine && message.isRead ? ' · Read' : ''}
      </p>
    </div>
  )
}
