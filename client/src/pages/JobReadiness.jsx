import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { aiService } from '../services/ai.service.js'
import { api } from '../services/http.js'
import {
  Card, CardHeader, Button, Badge, Alert, Field, Input,
  Select, Spinner, EmptyState, cx
} from '../components/ui.jsx'

const ROLE_PRESETS = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'DevOps Engineer',
  'AI / ML Engineer',
  'Data Analyst',
  'Software Engineer',
]

const STAGE_COLORS = {
  Foundations: 'border-l-blue-500',
  'Core Skills': 'border-l-emerald-500',
  'Applied Projects': 'border-l-amber-500',
  'Interview Preparation': 'border-l-purple-500',
  'Job Application Readiness': 'border-l-cyan-500',
}

export default function JobReadiness() {
  const [targetRole, setTargetRole] = useState('Frontend Developer')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [targetMode, setTargetMode] = useState('role') // 'role' | 'job'
  const [jobsList, setJobsList] = useState([])

  // Analysis & Roadmap states
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false)
  const [readinessData, setReadinessData] = useState(null)
  const [roadmapData, setRoadmapData] = useState(null)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'matches' | 'gaps'
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  const [togglingTaskId, setTogglingTaskId] = useState(null)
  const [error, setError] = useState(null)

  // Fetch initial active jobs and check for existing roadmap on load
  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const jobsRes = await api.get('/jobs?limit=20').catch(() => null)
        if (mounted) {
          const rawJobs = Array.isArray(jobsRes?.data) ? jobsRes.data : Array.isArray(jobsRes?.data?.jobs) ? jobsRes.data.jobs : Array.isArray(jobsRes) ? jobsRes : []
          const published = rawJobs.filter(
            (j) => String(j.status || '').toUpperCase() === 'PUBLISHED'
          )
          setJobsList(published)
        }

        // Fetch current readiness and saved roadmap for default role
        if (mounted) {
          fetchReadinessAndRoadmap('Frontend Developer', '')
        }
      } catch {
        // Non-fatal
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [])

  async function fetchReadinessAndRoadmap(role, jId) {
    setStatus('loading')
    setError(null)
    try {
      const result = await aiService.analyzeJobReadiness({
        targetRole: role || undefined,
        jobId: jId || undefined,
      })

      setReadinessData(result)
      if (result?.roadmap) {
        setRoadmapData(result.roadmap)
      } else {
        // Try to fetch saved roadmap
        const savedRoadmap = await aiService.getRoadmap(null, role, jId).catch(() => null)
        setRoadmapData(savedRoadmap)
      }
      setStatus('success')
    } catch (err) {
      setError(err?.message || 'Failed to evaluate job readiness. Please try again.')
      setStatus('error')
    }
  }

  function handleEvaluate(e) {
    if (e) e.preventDefault()
    const activeRole = targetMode === 'job' ? '' : targetRole
    const activeJobId = targetMode === 'job' ? selectedJobId : ''
    fetchReadinessAndRoadmap(activeRole, activeJobId)
  }

  async function handleGenerateRoadmap(regenerate = false) {
    setGeneratingRoadmap(true)
    setError(null)
    try {
      const activeRole = targetMode === 'job' ? (readinessData?.targetRole || targetRole) : targetRole
      const activeJobId = targetMode === 'job' ? selectedJobId : ''
      const newRoadmap = await aiService.generateRoadmap({
        targetRole: activeRole,
        jobId: activeJobId,
        regenerate,
      })
      setRoadmapData(newRoadmap)
    } catch (err) {
      setError(err?.message || 'Failed to generate personalized career roadmap.')
    } finally {
      setGeneratingRoadmap(false)
    }
  }

  async function handleToggleTask(taskId, currentStatus) {
    if (togglingTaskId) return
    setTogglingTaskId(taskId)

    // Optimistic update
    const previousRoadmap = roadmapData
    const newStatus = !currentStatus

    setRoadmapData((prev) => {
      if (!prev || !prev.tasks) return prev
      const updatedTasks = prev.tasks.map((t) =>
        t.id === taskId
          ? { ...t, isCompleted: newStatus, completedAt: newStatus ? new Date().toISOString() : null }
          : t
      )
      const completedCount = updatedTasks.filter((t) => t.isCompleted).length
      return {
        ...prev,
        tasks: updatedTasks,
        stats: {
          ...prev.stats,
          completedTasks: completedCount,
          remainingTasks: updatedTasks.length - completedCount,
          progressPercentage: Math.round((completedCount / updatedTasks.length) * 100),
        },
      }
    })

    try {
      const res = await aiService.updateRoadmapTask(taskId, newStatus)
      if (res?.stats && roadmapData) {
        setRoadmapData((prev) => ({
          ...prev,
          stats: res.stats,
        }))
      }
    } catch {
      // Rollback on failure
      setRoadmapData(previousRoadmap)
      setError('Failed to update task status. Please retry.')
    } finally {
      setTogglingTaskId(null)
    }
  }

  function toggleExpandTask(taskId) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // Filter skills list
  const matchingSkills = readinessData?.skills?.matching || []
  const missingSkills = readinessData?.skills?.missing || []
  const verifiedSkills = readinessData?.skills?.verified || []

  // Group roadmap tasks by stage
  const tasksByStage = (roadmapData?.tasks || []).reduce((acc, task) => {
    const stage = task.stage || 'Core Skills'
    if (!acc[stage]) acc[stage] = []
    acc[stage].push(task)
    return acc
  }, {})

  const readinessScore = readinessData?.readinessScore ?? 0
  const progressPct = roadmapData?.stats?.progressPercentage ?? 0

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <header className="border-b border-swiss-border pb-6">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">12 &mdash; JOB READINESS &amp; ROADMAP</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">JOB READINESS &amp; CAREER ROADMAP</h1>
        <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
          Evaluate demonstrated profile and resume competencies against industry role benchmarks or live platform jobs. Track staged milestones and close skill gaps.
        </p>
      </header>

      {error && (
        <Alert tone="error" title="Analysis Notice" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Target Role & Job Selection Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-swiss-border">
          <div>
            <h2 className="text-sm font-bold font-mono tracking-widest text-swiss-text uppercase">Career Target Benchmark</h2>
            <p className="text-xs text-swiss-muted mt-1">Select a standard technical role or evaluate directly against an active platform job.</p>
          </div>
          <div className="flex items-center gap-2 p-1 bg-swiss-base rounded border border-swiss-border">
            <button
              type="button"
              onClick={() => setTargetMode('role')}
              className={cx(
                'px-3 py-1 text-xs font-mono tracking-wider uppercase transition-colors rounded-sm',
                targetMode === 'role' ? 'bg-swiss-text text-swiss-base font-bold' : 'text-swiss-muted hover:text-swiss-text'
              )}
            >
              Industry Role
            </button>
            <button
              type="button"
              onClick={() => setTargetMode('job')}
              className={cx(
                'px-3 py-1 text-xs font-mono tracking-wider uppercase transition-colors rounded-sm',
                targetMode === 'job' ? 'bg-swiss-text text-swiss-base font-bold' : 'text-swiss-muted hover:text-swiss-text'
              )}
            >
              Active Platform Job
            </button>
          </div>
        </div>

        <form onSubmit={handleEvaluate} className="mt-6 space-y-4">
          {targetMode === 'role' ? (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {ROLE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTargetRole(preset)}
                    className={cx(
                      'px-2.5 py-1 text-xs border rounded-sm font-mono tracking-wider transition-colors',
                      targetRole === preset
                        ? 'border-swiss-text bg-swiss-surface-hover text-swiss-text font-bold'
                        : 'border-swiss-border text-swiss-muted hover:border-swiss-label hover:text-swiss-text'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Input
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="Enter target role (e.g. Backend Developer, Data Analyst)..."
                  className="flex-1"
                />
                <Button type="submit" disabled={status === 'loading' || !targetRole.trim()}>
                  {status === 'loading' ? <Spinner size="sm" /> : 'Evaluate Readiness'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="flex-1"
              >
                <option value="">-- Select an active platform job --</option>
                {jobsList.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} — {job.companyName || 'Company'} ({job.location || 'Remote'})
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={status === 'loading' || !selectedJobId}>
                {status === 'loading' ? <Spinner size="sm" /> : 'Compare Against Job'}
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* Incomplete Profile Alert */}
      {readinessData?.isIncomplete && (
        <Card className="p-5 border-amber-500/50 bg-amber-500/10">
          <div className="flex items-start gap-4">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-300 font-mono tracking-wider uppercase">Incomplete Profile Evidence</h3>
              <p className="text-xs text-swiss-muted mt-1">
                {readinessData.explanation || 'We found no technical skills, work experience, or resume associated with your account.'}
              </p>
              <div className="mt-3 flex gap-3">
                <Link to="/profile">
                  <Button size="sm" variant="secondary">Add Skills to Profile</Button>
                </Link>
                <Link to="/resume-analyzer">
                  <Button size="sm">Upload Resume</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main Readiness & Roadmap Dashboard */}
      {status === 'loading' ? (
        <Card className="p-12 text-center">
          <Spinner className="mx-auto mb-4" />
          <p className="font-mono text-sm tracking-widest uppercase text-swiss-label">GATHERING PROFILE EVIDENCE &amp; EVALUATING READINESS...</p>
          <p className="text-xs text-swiss-muted mt-2">Checking technical taxonomy, verified skills, and benchmark prerequisites.</p>
        </Card>
      ) : readinessData ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left Column: Assessment & Roadmap */}
          <div className="space-y-6">
            {/* Readiness Overview Scorecard */}
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-6 pb-6 border-b border-swiss-border">
                <div>
                  <span className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">Target Role Fit</span>
                  <h2 className="text-2xl font-bold text-swiss-text mt-1">{readinessData.targetRole}</h2>
                  {readinessData.job && (
                    <p className="text-xs text-swiss-muted mt-0.5">
                      Target Job: <strong className="text-swiss-text">{readinessData.job.title}</strong> at {readinessData.job.company}
                    </p>
                  )}
                  <p className="text-xs text-swiss-muted mt-2 max-w-lg">{readinessData.summary}</p>
                </div>
                <div className="flex items-center gap-4 bg-swiss-base p-4 rounded-sm border border-swiss-border self-start sm:self-auto">
                  <div className="text-right">
                    <span className="block font-mono text-[10px] tracking-widest text-swiss-label uppercase">Readiness</span>
                    <span className="text-3xl font-bold font-mono text-swiss-text">{readinessScore}%</span>
                  </div>
                  <div className="w-12 h-12 rounded-full border-4 border-swiss-border flex items-center justify-center relative">
                    <div
                      className="w-full h-full rounded-full border-4 border-swiss-accent absolute -top-1 -left-1"
                      style={{ clipPath: `polygon(0 0, 100% 0, 100% ${readinessScore}%, 0 ${readinessScore}%)` }}
                    />
                    <span className="text-[10px] font-mono font-bold">{readinessScore}</span>
                  </div>
                </div>
              </div>

              {/* Score Signals Breakdown */}
              <div className="mt-6">
                <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-label uppercase mb-3">Deterministic Signals Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 bg-swiss-base rounded border border-swiss-border">
                    <span className="block text-[10px] font-mono text-swiss-label uppercase">Essential Skills</span>
                    <span className="text-sm font-bold font-mono text-swiss-text">
                      {readinessData.scoreBreakdown?.essentialScore ?? 0} <span className="text-xs text-swiss-label">/ 40</span>
                    </span>
                  </div>
                  <div className="p-3 bg-swiss-base rounded border border-swiss-border">
                    <span className="block text-[10px] font-mono text-swiss-label uppercase">Recommended</span>
                    <span className="text-sm font-bold font-mono text-swiss-text">
                      {readinessData.scoreBreakdown?.recommendedScore ?? 0} <span className="text-xs text-swiss-label">/ 20</span>
                    </span>
                  </div>
                  <div className="p-3 bg-swiss-base rounded border border-swiss-border">
                    <span className="block text-[10px] font-mono text-swiss-label uppercase">Experience/Projects</span>
                    <span className="text-sm font-bold font-mono text-swiss-text">
                      {readinessData.scoreBreakdown?.experienceScore ?? 0} <span className="text-xs text-swiss-label">/ 20</span>
                    </span>
                  </div>
                  <div className="p-3 bg-swiss-base rounded border border-swiss-border">
                    <span className="block text-[10px] font-mono text-swiss-label uppercase">Education</span>
                    <span className="text-sm font-bold font-mono text-swiss-text">
                      {readinessData.scoreBreakdown?.educationScore ?? 0} <span className="text-xs text-swiss-label">/ 10</span>
                    </span>
                  </div>
                  <div className="p-3 bg-swiss-base rounded border border-swiss-border">
                    <span className="block text-[10px] font-mono text-swiss-label uppercase">Roadmap Tasks</span>
                    <span className="text-sm font-bold font-mono text-swiss-text">
                      {readinessData.scoreBreakdown?.taskScore ?? 0} <span className="text-xs text-swiss-label">/ 10</span>
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[11px] font-mono text-swiss-label">{readinessData.explanation}</p>
              </div>
            </Card>

            {/* Skill Gap Analysis */}
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-swiss-border">
                <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-text uppercase">Technical Skill Gap Analysis</h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={cx('px-2.5 py-1 text-xs font-mono rounded', activeTab === 'all' ? 'bg-swiss-text text-swiss-base font-bold' : 'text-swiss-muted hover:text-swiss-text')}
                  >
                    All ({matchingSkills.length + missingSkills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('matches')}
                    className={cx('px-2.5 py-1 text-xs font-mono rounded', activeTab === 'matches' ? 'bg-swiss-text text-swiss-base font-bold' : 'text-swiss-muted hover:text-swiss-text')}
                  >
                    Matches ({matchingSkills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('gaps')}
                    className={cx('px-2.5 py-1 text-xs font-mono rounded', activeTab === 'gaps' ? 'bg-swiss-text text-swiss-base font-bold' : 'text-swiss-muted hover:text-swiss-text')}
                  >
                    Skill Gaps ({missingSkills.length})
                  </button>
                </div>
              </div>

              {/* Skills Display */}
              <div className="mt-6 space-y-4">
                {(activeTab === 'all' || activeTab === 'matches') && matchingSkills.length > 0 && (
                  <div>
                    <h4 className="font-mono text-[10px] tracking-widest text-emerald-400 uppercase mb-2">Demonstrated &amp; Matching Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {matchingSkills.map((match, idx) => {
                        const skillName = typeof match === 'string' ? match : match.skill
                        const isVerified = match.verified ?? verifiedSkills.some((v) => v.toLowerCase() === skillName.toLowerCase())
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-swiss-base border border-emerald-500/30 text-swiss-text rounded text-xs"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>{skillName}</span>
                            <span className={cx('text-[9px] font-mono px-1 rounded', isVerified ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400')}>
                              {isVerified ? 'VERIFIED' : 'CLAIMED'}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(activeTab === 'all' || activeTab === 'gaps') && missingSkills.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-mono text-[10px] tracking-widest text-amber-400 uppercase mb-2">Priority Skill Gaps</h4>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {missingSkills.map((gap, idx) => {
                        const skillName = typeof gap === 'string' ? gap : gap.skill
                        const priority = gap.priority || 'medium'
                        const reason = gap.reason || 'Commonly required for role proficiency'
                        return (
                          <div key={idx} className="p-3 bg-swiss-base border border-swiss-border rounded">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-swiss-text">{skillName}</span>
                              <Badge tone={priority === 'high' ? 'error' : 'warning'}>
                                {priority.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-swiss-muted mt-1 leading-snug">{reason}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Personalized Career Roadmap */}
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-swiss-border">
                <div>
                  <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-text uppercase">Personalized Learning Roadmap</h3>
                  <p className="text-xs text-swiss-muted mt-1">Staged technical progression tailored to bridge identified skill gaps.</p>
                </div>
                <div className="flex items-center gap-3">
                  {roadmapData && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateRoadmap(true)}
                      disabled={generatingRoadmap}
                    >
                      {generatingRoadmap ? <Spinner size="sm" /> : 'Regenerate'}
                    </Button>
                  )}
                  {!roadmapData && (
                    <Button
                      size="sm"
                      onClick={() => handleGenerateRoadmap(false)}
                      disabled={generatingRoadmap}
                    >
                      {generatingRoadmap ? <Spinner size="sm" /> : 'Generate Roadmap'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {roadmapData?.stats && (
                <div className="my-5 p-4 bg-swiss-base rounded border border-swiss-border">
                  <div className="flex justify-between items-center text-xs font-mono mb-2">
                    <span className="text-swiss-label uppercase tracking-widest">Roadmap Completion</span>
                    <span className="text-swiss-text font-bold">
                      {roadmapData.stats.completedTasks} of {roadmapData.stats.totalTasks} Tasks ({progressPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-swiss-surface h-2 rounded-full overflow-hidden border border-swiss-border">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Roadmap Tasks by Stage */}
              {roadmapData?.tasks && roadmapData.tasks.length > 0 ? (
                <div className="space-y-6 mt-4">
                  {Object.entries(tasksByStage).map(([stageName, tasks]) => (
                    <div key={stageName} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-swiss-text uppercase tracking-widest">
                          {stageName}
                        </span>
                        <span className="text-[10px] font-mono text-swiss-label">
                          ({tasks.filter((t) => t.isCompleted).length}/{tasks.length})
                        </span>
                      </div>

                      <div className="space-y-2">
                        {tasks.map((task) => {
                          const isExpanded = expandedTasks.has(task.id)
                          const isToggling = togglingTaskId === task.id
                          return (
                            <div
                              key={task.id}
                              className={cx(
                                'p-4 rounded border transition-colors bg-swiss-base',
                                task.isCompleted ? 'border-emerald-500/30 opacity-80' : 'border-swiss-border hover:border-swiss-label',
                                STAGE_COLORS[task.stage] || 'border-l-blue-500',
                                'border-l-4'
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={task.isCompleted}
                                    disabled={isToggling}
                                    onChange={() => handleToggleTask(task.id, task.isCompleted)}
                                    className="mt-1 h-4 w-4 rounded border-swiss-border bg-transparent text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className={cx('text-sm font-medium', task.isCompleted ? 'line-through text-swiss-muted' : 'text-swiss-text')}>
                                      {task.title}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-mono text-swiss-label">
                                      {task.skillFocus && (
                                        <span className="px-1.5 py-0.5 bg-swiss-surface rounded border border-swiss-border text-swiss-text">
                                          {task.skillFocus}
                                        </span>
                                      )}
                                      {task.estimatedDuration && <span>⏱ {task.estimatedDuration}</span>}
                                      {task.priority && (
                                        <span className={task.priority === 'high' ? 'text-amber-400 font-bold' : ''}>
                                          P: {task.priority.toUpperCase()}
                                        </span>
                                      )}
                                      {task.completedAt && (
                                        <span className="text-emerald-400 font-bold">✓ Done</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleExpandTask(task.id)}
                                  className="text-xs font-mono text-swiss-label hover:text-swiss-text px-2 py-1"
                                >
                                  {isExpanded ? 'Less' : 'Details'}
                                </button>
                              </div>

                              {/* Expanded Task Details */}
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-swiss-border text-xs space-y-3">
                                  <p className="text-swiss-muted leading-relaxed">{task.description}</p>

                                  {task.completionCriteria && task.completionCriteria.length > 0 && (
                                    <div>
                                      <span className="font-mono text-[10px] uppercase text-swiss-label block mb-1">
                                        Acceptance Criteria:
                                      </span>
                                      <ul className="list-disc pl-4 space-y-0.5 text-swiss-muted">
                                        {task.completionCriteria.map((c, i) => (
                                          <li key={i}>{c}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {task.learningActivity && (
                                    <div className="p-2 bg-swiss-surface rounded border border-swiss-border">
                                      <span className="font-mono text-[10px] uppercase text-swiss-label block">Suggested Learning Activity:</span>
                                      <p className="text-swiss-muted mt-0.5">{task.learningActivity}</p>
                                    </div>
                                  )}

                                  {task.practiceProject && (
                                    <div className="p-2 bg-swiss-surface rounded border border-swiss-border">
                                      <span className="font-mono text-[10px] uppercase text-swiss-label block">Practice Project Exercise:</span>
                                      <p className="text-swiss-muted mt-0.5">{task.practiceProject}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-swiss-muted mb-4">No active roadmap found for {readinessData.targetRole}.</p>
                  <Button onClick={() => handleGenerateRoadmap(false)} disabled={generatingRoadmap}>
                    {generatingRoadmap ? <Spinner size="sm" /> : 'Generate Personalized Staged Roadmap'}
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column: Recommended Actions, Real Mentors & Events */}
          <div className="space-y-6">
            {/* Recommended Next Actions */}
            <Card className="p-5">
              <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-text uppercase mb-4">
                Recommended Actions
              </h3>
              <ul className="space-y-3 text-sm">
                {(readinessData.recommendedActions || []).map((action, idx) => (
                  <li key={idx} className="flex gap-2.5 items-start text-xs text-swiss-text leading-snug">
                    <span className="font-mono text-swiss-accent font-bold mt-0.5">0{idx + 1}</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Verified Platform Mentors */}
            <Card className="p-5">
              <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-text uppercase mb-4">
                Matching Alumni Mentors
              </h3>
              {readinessData.recommendedMentors && readinessData.recommendedMentors.length > 0 ? (
                <div className="space-y-3">
                  {readinessData.recommendedMentors.map((mentor) => (
                    <div key={mentor.id} className="p-3 bg-swiss-base rounded border border-swiss-border flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-swiss-text truncate">{mentor.name}</p>
                        <p className="text-[11px] text-swiss-muted truncate">{mentor.role} &bull; {mentor.company}</p>
                      </div>
                      <Link to={`/directory?search=${encodeURIComponent(mentor.name)}`}>
                        <Button size="sm" variant="secondary">View</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-swiss-muted">No mentors currently available for this specialization.</p>
              )}
            </Card>

            {/* Platform Events & Workshops */}
            <Card className="p-5">
              <h3 className="font-mono text-xs font-bold tracking-widest text-swiss-text uppercase mb-4">
                Upcoming Platform Events
              </h3>
              {readinessData.recommendedEvents && readinessData.recommendedEvents.length > 0 ? (
                <div className="space-y-3">
                  {readinessData.recommendedEvents.map((event) => (
                    <div key={event.id} className="p-3 bg-swiss-base rounded border border-swiss-border">
                      <div className="flex items-center justify-between text-[10px] font-mono text-swiss-label mb-1">
                        <span>{event.type.toUpperCase()}</span>
                        <span>{event.date ? new Date(event.date).toLocaleDateString() : 'Upcoming'}</span>
                      </div>
                      <p className="text-xs font-bold text-swiss-text">{event.title}</p>
                      {event.description && <p className="text-[11px] text-swiss-muted mt-1 leading-snug">{event.description}</p>}
                      <div className="mt-2.5">
                        <Link to={`/events/${event.id}`}>
                          <Button size="sm" variant="secondary" className="w-full">Event Details</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-swiss-muted">No upcoming events scheduled right now.</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  )
}
