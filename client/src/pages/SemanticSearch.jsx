import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card, Input, Button, Badge, EmptyState, Alert, Spinner } from '../components/ui.jsx'
import { aiService } from '../services/ai.service.js'

const FILTER_TYPES = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'PEOPLE', label: 'Alumni & People' },
  { id: 'JOBS', label: 'Jobs & Openings' },
  { id: 'EVENTS', label: 'Events & Meetups' },
]

const STARTER_SUGGESTIONS = [
  { label: 'Alumni in AI', query: 'Find alumni who work in artificial intelligence', type: 'PEOPLE' },
  { label: 'React Developers', query: 'People with React and Node.js experience', type: 'PEOPLE' },
  { label: 'Alumni at Microsoft', query: 'Alumni working at Microsoft', type: 'PEOPLE' },
  { label: 'Backend Jobs', query: 'Backend engineering jobs for someone with Node.js experience', type: 'JOBS' },
  { label: 'AI Events', query: 'Technology events related to AI', type: 'EVENTS' },
  { label: 'Tech in Mumbai', query: 'Events for software developers in Mumbai', type: 'EVENTS' },
]

const STORAGE_KEY = 'semantic_search_history_v1'

export default function SemanticSearch() {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState('ALL')
  const [status, setStatus] = useState('idle') // 'idle' | 'searching' | 'results' | 'empty' | 'error'
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [errorMessage, setErrorMessage] = useState(null)
  const [recentSearches, setRecentSearches] = useState([])

  // Load recent searches from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        setRecentSearches(JSON.parse(saved).slice(0, 5))
      }
    } catch {
      // Non-fatal
    }
  }, [])

  const saveRecentSearch = useCallback((q) => {
    if (!q || !q.trim()) return
    const text = q.trim()
    setRecentSearches((prev) => {
      const next = [text, ...prev.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 5)
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Non-fatal
      }
      return next
    })
  }, [])

  const executeSearch = useCallback(
    async (searchQuery, searchType) => {
      const q = (searchQuery ?? query).trim()
      const t = searchType ?? activeType
      if (!q) return

      setStatus('searching')
      setErrorMessage(null)
      saveRecentSearch(q)

      try {
        const response = await aiService.getSemanticSearch(q, t)
        const items = Array.isArray(response?.results) ? response.results : []
        setResults(items)
        setTotal(typeof response?.total === 'number' ? response.total : items.length)

        if (items.length === 0) {
          setStatus('empty')
        } else {
          setStatus('results')
        }
      } catch (err) {
        setErrorMessage(err?.message || 'Unable to complete semantic search. Please try again.')
        setStatus('error')
      }
    },
    [query, activeType, saveRecentSearch]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    executeSearch(query, activeType)
  }

  const handleTypeChange = (typeId) => {
    setActiveType(typeId)
    if (query.trim() && (status === 'results' || status === 'empty')) {
      executeSearch(query, typeId)
    }
  }

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.query)
    setActiveType(suggestion.type || 'ALL')
    executeSearch(suggestion.query, suggestion.type || 'ALL')
  }

  const clearHistory = () => {
    setRecentSearches([])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Non-fatal
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="mb-2">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">13 &mdash; GLOBAL SEARCH</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">SEMANTIC DISCOVERY</h1>
        <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
          Search intelligently across alumni, jobs, and campus events using natural language.
          Vector embeddings find candidates based on meaning and technical alignment, not just exact keywords.
        </p>
      </header>

      {/* Main Search Bar */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, jobs, and events using natural language..."
              className="w-full text-base py-3 px-4 font-sans"
              disabled={status === 'searching'}
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={!query.trim() || status === 'searching'}
            className="px-8 shrink-0 flex items-center gap-2"
          >
            {status === 'searching' ? (
              <>
                <Spinner className="h-4 w-4" />
                <span>Searching...</span>
              </>
            ) : (
              'Search'
            )}
          </Button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="font-mono text-[10px] tracking-wider text-swiss-label uppercase mr-1">Filter:</span>
          {FILTER_TYPES.map((filter) => {
            const isActive = activeType === filter.id
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => handleTypeChange(filter.id)}
                className={`text-xs px-3 py-1 font-mono uppercase tracking-wider rounded-sm transition-colors border ${
                  isActive
                    ? 'bg-swiss-accent text-white border-swiss-accent'
                    : 'bg-swiss-surface hover:bg-swiss-surface-hover text-swiss-muted border-swiss-border'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </form>

      {/* Suggested Starter Queries */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">
            Quick Discovery Prompts
          </span>
          {recentSearches.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="font-mono text-[10px] text-swiss-muted hover:text-swiss-text underline"
            >
              Clear recent
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTER_SUGGESTIONS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSuggestionClick(item)}
              className="text-xs px-3 py-1.5 rounded-sm bg-swiss-surface border border-swiss-border text-swiss-text hover:border-swiss-text transition-colors flex items-center gap-1.5"
            >
              <span className="text-swiss-accent font-mono text-[10px]">&#8599;</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Searches */}
      {recentSearches.length > 0 && status === 'idle' && (
        <div className="pt-2">
          <span className="font-mono text-[10px] tracking-widest text-swiss-label uppercase block mb-2">
            Recent Searches
          </span>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(term)
                  executeSearch(term, activeType)
                }}
                className="text-xs px-2.5 py-1 rounded-sm bg-swiss-surface-hover border border-swiss-border text-swiss-muted hover:text-swiss-text transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {status === 'error' && errorMessage && (
        <Alert tone="error" title="Search Failed" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Idle / Welcome State */}
      {status === 'idle' && (
        <Card className="p-10 text-center">
          <EmptyState
            title="Intelligent Discovery Engine"
            description="Enter natural language queries like 'People with React and Node.js experience' or 'Technology events in Mumbai'. The vector engine understands meaning rather than requiring exact keyword matches."
          />
        </Card>
      )}

      {/* Loading State */}
      {status === 'searching' && (
        <Card className="p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-swiss-border border-t-swiss-accent rounded-full animate-spin" />
          <div>
            <h2 className="text-base font-semibold text-swiss-text tracking-wide">
              Finding the most relevant results...
            </h2>
            <p className="text-xs text-swiss-muted mt-1 font-mono uppercase tracking-widest">
              Generating query embedding &amp; verifying candidate entities in PostgreSQL
            </p>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {status === 'empty' && (
        <Card className="p-10 text-center">
          <EmptyState
            title="No Strong Matches Found"
            description={`No indexed entities strongly matched "${query}" under category "${activeType}". Try broadening your search terms or selecting "All Categories".`}
            action={
              activeType !== 'ALL' ? (
                <Button variant="secondary" onClick={() => handleTypeChange('ALL')}>
                  Search All Categories
                </Button>
              ) : null
            }
          />
        </Card>
      )}

      {/* Results State */}
      {status === 'results' && (
        <div className="space-y-4">
          {/* Result Stats Bar */}
          <div className="flex items-center justify-between border-b border-swiss-border pb-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-wider text-swiss-text font-semibold">
                {total} {total === 1 ? 'Match' : 'Matches'} Found
              </span>
              <span className="text-xs text-swiss-muted font-mono">
                for &ldquo;{query}&rdquo;
              </span>
            </div>
            <div className="text-[11px] font-mono text-swiss-label uppercase tracking-widest">
              Grounding: Verified PostgreSQL Records
            </div>
          </div>

          {/* Result Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {results.map((item) => (
              <SearchResultCard key={`${item.entityType}-${item.id}`} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Rich, grounded result card rendered per entity type with user-friendly match score and direct actions.
 */
function SearchResultCard({ item }) {
  const isPerson = item.entityType === 'PEOPLE'
  const isJob = item.entityType === 'JOBS'
  const isEvent = item.entityType === 'EVENTS'

  const tone = item.relevance?.tone || (item.matchScore >= 80 ? 'green' : 'blue')
  const matchLabel = item.relevance?.label || `${item.matchScore || 85}% Match`

  return (
    <Card className="p-5 flex flex-col justify-between hover:border-swiss-border-hover transition-colors">
      <div>
        {/* Card Header: Type Badge & Relevance Badge */}
        <div className="flex justify-between items-center mb-3">
          <Badge tone="slate">
            {isPerson ? 'ALUMNUS' : isJob ? 'JOB OPENING' : 'CAMPUS EVENT'}
          </Badge>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                tone === 'green' ? 'bg-green-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-slate-400'
              }`}
            />
            <span
              className={`text-xs font-mono font-semibold ${
                tone === 'green' ? 'text-green-600' : tone === 'blue' ? 'text-blue-600' : 'text-slate-600'
              }`}
            >
              {matchLabel}
            </span>
          </div>
        </div>

        {/* Entity Title & Subtitle */}
        <h3 className="font-bold text-swiss-text text-lg tracking-tight">
          {item.title}
        </h3>
        {item.subtitle && (
          <p className="text-swiss-muted text-sm mt-0.5 line-clamp-1">
            {item.subtitle}
          </p>
        )}

        {/* Location / Meta Details */}
        {item.location && (
          <p className="text-swiss-label text-xs mt-1.5 flex items-center gap-1">
            <span className="font-mono uppercase tracking-wider text-[10px]">Location:</span>
            <span>{item.location}</span>
          </p>
        )}

        {/* Skills Pills */}
        {Array.isArray(item.skills) && item.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.skills.slice(0, 5).map((skill, sIdx) => (
              <span
                key={sIdx}
                className="text-[11px] font-mono px-2 py-0.5 rounded-sm bg-swiss-surface-hover border border-swiss-border text-swiss-text"
              >
                {skill}
              </span>
            ))}
            {item.skills.length > 5 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 text-swiss-muted self-center">
                +{item.skills.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Grounded Match Explanation */}
        {item.matchReason && (
          <div className="mt-3.5 p-2.5 rounded-sm bg-swiss-surface-hover/60 border border-swiss-border/70 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-swiss-label block mb-0.5">
              Why this matches:
            </span>
            <p className="text-swiss-muted text-xs leading-relaxed">
              {item.matchReason}
            </p>
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="mt-5 pt-3 border-t border-swiss-border/60 flex items-center gap-2">
        {isPerson && (
          <>
            <Link to={`/alumni/${item.id}`} className="flex-1">
              <Button size="sm" variant="primary" className="w-full">
                View Profile
              </Button>
            </Link>
            <Link to={`/messages/${item.id}`} className="flex-1">
              <Button size="sm" variant="secondary" className="w-full">
                Message
              </Button>
            </Link>
          </>
        )}

        {isJob && (
          <>
            <Link to={`/jobs/${item.id}`} className="flex-1">
              <Button size="sm" variant="primary" className="w-full">
                View Job
              </Button>
            </Link>
            <Link to={`/jobs/${item.id}`} className="flex-1">
              <Button size="sm" variant="secondary" className="w-full">
                Apply
              </Button>
            </Link>
          </>
        )}

        {isEvent && (
          <>
            <Link to={`/events/${item.id}`} className="flex-1">
              <Button size="sm" variant="primary" className="w-full">
                View Event
              </Button>
            </Link>
            <Link to={`/events/${item.id}`} className="flex-1">
              <Button size="sm" variant="secondary" className="w-full">
                RSVP
              </Button>
            </Link>
          </>
        )}
      </div>
    </Card>
  )
}
