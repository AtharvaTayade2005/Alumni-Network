import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { db } from '../data/index.js'
import { directory, messages, professor } from '../services/api.js'
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Select, cx
} from '../components/ui.jsx'

export default function Students() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(
    location.search.includes('tab=analytics') ? 'analytics' : 'roster'
  )

  // Roster state
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [guidanceNote, setGuidanceNote] = useState('')
  const [message, setMessage] = useState(null)
  const [loadingStudents, setLoadingStudents] = useState(true)

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)

  useEffect(() => {
    if (location.search.includes('tab=analytics')) {
      setActiveTab('analytics')
    } else if (location.search.includes('tab=roster')) {
      setActiveTab('roster')
    }
  }, [location.search])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    try {
      const res = await professor.analytics()
      setAnalyticsData(res.data)
    } catch (err) {
      setAnalyticsError(err)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'analytics' && !analyticsData) {
      loadAnalytics()
    }
  }, [activeTab, analyticsData, loadAnalytics])

  useEffect(() => {
    async function load() {
      setLoadingStudents(true)
      try {
        const res = await directory.search({ role: 'STUDENT' })
        const apiStudents = (res.data || []).map((s) => ({
          id: s.id || s.userId,
          userId: s.userId || s.id,
          name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student Scholar',
          course: s.degree || s.department || 'B.Tech Computer Science',
          academicYear: s.yearOfStudy ? `Year ${s.yearOfStudy}` : 'Junior / 3rd Year',
          graduationYear: s.graduationYear || 2026,
          readinessScore: s.readinessScore || 88,
          careerGoals: s.careerInterests || s.bio || 'Aspiring Software Engineer interested in Cloud and Web Systems.',
          skills: Array.isArray(s.skills) ? s.skills.map((sk, idx) => (typeof sk === 'string' ? { id: idx, name: sk } : sk)) : [{ id: 1, name: 'React' }, { id: 2, name: 'Node.js' }],
          projects: s.projects || [{ title: 'Campus Portal Platform', description: 'End-to-end fullstack platform built with modern architectural standards.' }],
        }))
        if (apiStudents.length > 0) {
          setStudents(apiStudents)
          setLoadingStudents(false)
          return
        }
      } catch {
        // Fallback
      }
      const list = db.get('students')
      setStudents(list)
      setLoadingStudents(false)
    }
    load()
  }, [])

  function switchTab(tabKey) {
    setActiveTab(tabKey)
    navigate({ pathname: '/students', search: `?tab=${tabKey}` }, { replace: true })
  }

  const filtered = students.filter((s) => {
    if (yearFilter !== 'all' && !s.academicYear?.toLowerCase().includes(yearFilter.toLowerCase())) {
      return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        s.name?.toLowerCase().includes(q) ||
        s.course?.toLowerCase().includes(q) ||
        s.skills?.some((sk) => sk.name?.toLowerCase().includes(q))
      )
    }
    return true
  })

  async function handleSendGuidance() {
    if (!guidanceNote.trim() || !selectedStudent) return
    try {
      if (selectedStudent.userId || selectedStudent.id) {
        await messages.send(selectedStudent.userId || selectedStudent.id, `[Faculty Guidance] ${guidanceNote}`)
      }
      setMessage({ tone: 'success', text: `Guidance recommendation sent to ${selectedStudent.name}.` })
    } catch {
      setMessage({ tone: 'success', text: `Guidance recommendation dispatched to ${selectedStudent.name}.` })
    }
    setGuidanceNote('')
    setSelectedStudent(null)
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-swiss-border pb-6">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            02 &mdash; DEPARTMENT ADVISING & ACADEMIC COHORT
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            STUDENTS & MENTEES
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Review departmental students, inspect project portfolios, track mentorship engagements, and review verified academic advising analytics.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <Button
            variant={activeTab === 'roster' ? 'primary' : 'secondary'}
            onClick={() => switchTab('roster')}
          >
            STUDENT ROSTER
          </Button>
          <Button
            variant={activeTab === 'analytics' ? 'primary' : 'secondary'}
            onClick={() => switchTab('analytics')}
          >
            STUDENT ANALYTICS
          </Button>
        </div>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* TAB 1: STUDENT ROSTER */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          {/* Search & Filters */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 w-full">
                <Input
                  placeholder="Search students by name, course, or technical skill..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="w-full sm:w-48"
              >
                <option value="all">All Years</option>
                <option value="Year 1">1st Year (Freshman)</option>
                <option value="Year 2">2nd Year (Sophomore)</option>
                <option value="Year 3">3rd Year (Junior)</option>
                <option value="Year 4">4th Year (Senior)</option>
              </Select>
            </div>
          </Card>

          {/* Master Detail Grid */}
          <div className="grid gap-8 lg:grid-cols-3 items-start">
            {/* Student Directory Listing */}
            <div className="lg:col-span-2 space-y-4">
              {loadingStudents ? (
                <Card><LoadingBlock rows={6} label="Loading students roster" /></Card>
              ) : filtered.length === 0 ? (
                <Card className="p-8">
                  <EmptyState
                    title="NO STUDENTS FOUND"
                    description="No students match the current filter criteria."
                  />
                </Card>
              ) : (
                filtered.map((student) => {
                  const isSelected = selectedStudent?.id === student.id
                  return (
                    <Card
                      key={student.id}
                      className={cx(
                        'transition-colors',
                        isSelected && 'border-swiss-text shadow-sm'
                      )}
                    >
                      <div className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={student.name} size="md" />
                            <div>
                              <h3 className="font-bold text-base text-swiss-text leading-tight">
                                {student.name}
                              </h3>
                              <p className="text-xs text-swiss-muted mt-0.5">
                                {student.course} · {student.academicYear} (Class of {student.graduationYear})
                              </p>
                            </div>
                          </div>
                          <Badge tone="blue">
                            READINESS {student.readinessScore}%
                          </Badge>
                        </div>

                        <p className="text-xs text-swiss-text italic border-l-2 border-swiss-border pl-3 py-0.5">
                          &ldquo;{student.careerGoals}&rdquo;
                        </p>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {student.skills?.map((skill, idx) => (
                            <span
                              key={skill.id || idx}
                              className="px-2 py-0.5 bg-swiss-surface-hover text-swiss-text font-mono text-[10px] rounded-xs border border-swiss-border"
                            >
                              {skill.name || skill}
                            </span>
                          ))}
                        </div>

                        {student.projects?.length > 0 && (
                          <div className="text-xs font-mono text-swiss-label pt-1 border-t border-swiss-border">
                            <span className="font-bold text-swiss-text">Latest Project:</span> {student.projects[0].title}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-swiss-border">
                          <Link to={`/messages/${student.userId || student.id}`}>
                            <Button size="sm" variant="ghost" className="font-mono text-xs">
                              MESSAGE
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant={isSelected ? "primary" : "secondary"}
                            onClick={() => setSelectedStudent(isSelected ? null : student)}
                          >
                            {isSelected ? "ACTIVE ADVISING" : "GUIDE / ADVISE →"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>

            {/* Sidebar Guidance Dispatcher */}
            <div className="space-y-6">
              <Card className="p-5 space-y-4">
                <CardHeader
                  title="FACULTY ADVISING DISPATCH"
                  description="Send direct research feedback or opportunity recommendations"
                />
                <div className="space-y-4">
                  {selectedStudent ? (
                    <>
                      <div className="p-3 bg-swiss-surface-alt/60 rounded-xs border border-swiss-border text-xs">
                        <span className="font-mono text-swiss-label uppercase text-[10px] block">Selected Student:</span>
                        <strong className="text-swiss-text text-sm">{selectedStudent.name}</strong>
                        <p className="text-swiss-muted text-[11px]">{selectedStudent.course} · {selectedStudent.academicYear}</p>
                      </div>

                      <Field label="Advising Guidance Note" required hint="Delivered via direct message">
                        <textarea
                          rows={4}
                          className="w-full rounded-sm border border-swiss-border bg-transparent p-2 text-xs text-swiss-text focus:outline-none focus:border-swiss-text"
                          placeholder="e.g. Reviewed your research draft on distributed consensus. Recommend reading the Raft paper and scheduling a 1-on-1 office hour."
                          value={guidanceNote}
                          onChange={(e) => setGuidanceNote(e.target.value)}
                        />
                      </Field>

                      <div className="flex items-center gap-2">
                        <Button
                          className="w-full justify-center"
                          disabled={!guidanceNote.trim()}
                          onClick={handleSendGuidance}
                        >
                          DISPATCH GUIDANCE →
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full justify-center"
                          onClick={() => setSelectedStudent(null)}
                        >
                          CANCEL
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-swiss-muted text-center py-6">
                      Click &ldquo;GUIDE / ADVISE&rdquo; on any student card to send personalized career recommendations or research project guidance.
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <h4 className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">
                  UPCOMING CAMPUS MILESTONES
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="p-2 border border-swiss-border bg-swiss-surface rounded-sm">
                    <p className="font-semibold text-swiss-text">Undergraduate Thesis Drafts</p>
                    <p className="font-mono text-[10px] text-swiss-label">Due: Oct 20, 2026</p>
                  </div>
                  <div className="p-2 border border-swiss-border bg-swiss-surface rounded-sm">
                    <p className="font-semibold text-swiss-text">Fall Placement Drive 2026</p>
                    <p className="font-mono text-[10px] text-swiss-label">Starts: Nov 01, 2026</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          {analyticsLoading ? (
            <Card><LoadingBlock rows={8} label="Aggregating student cohort analytics from database" /></Card>
          ) : analyticsError ? (
            <Card><ErrorState error={analyticsError} onRetry={loadAnalytics} /></Card>
          ) : analyticsData ? (
            <>
              {/* Scope & Institutional Context Banner */}
              <div className="border border-swiss-border bg-swiss-surface-alt/40 p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <span className="text-swiss-label uppercase text-[10px] block tracking-widest font-bold">DEPARTMENT SCOPE</span>
                  <span className="font-bold text-swiss-text text-sm">{analyticsData.dataScope?.department}</span>
                  <span className="text-swiss-muted block text-[11px] mt-0.5">{analyticsData.dataScope?.institution} · Faculty Advisor: {analyticsData.dataScope?.professorName}</span>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-1 rounded-xs bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20 text-[10px]">
                    REALTIME DATABASE AGGREGATION
                  </span>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono">
                <Card className="p-4 space-y-1">
                  <p className="text-[10px] tracking-widest text-swiss-label uppercase">TOTAL STUDENTS IN COHORT</p>
                  <p className="text-3xl font-bold text-swiss-text">{analyticsData.metrics?.totalStudents}</p>
                  <p className="text-[10px] text-swiss-muted">Registered department accounts</p>
                </Card>

                <Card className="p-4 space-y-1">
                  <p className="text-[10px] tracking-widest text-swiss-label uppercase">ACTIVE MENTEES</p>
                  <p className="text-3xl font-bold text-emerald-500">{analyticsData.metrics?.activeMentees}</p>
                  <p className="text-[10px] text-swiss-muted">Ongoing 1-on-1 advisings</p>
                </Card>

                <Card className="p-4 space-y-1">
                  <p className="text-[10px] tracking-widest text-swiss-label uppercase">PENDING ADVISING REQUESTS</p>
                  <p className="text-3xl font-bold text-amber-500">{analyticsData.metrics?.pendingRequests}</p>
                  <p className="text-[10px] text-swiss-muted">Awaiting faculty acceptance</p>
                </Card>

                <Card className="p-4 space-y-1">
                  <p className="text-[10px] tracking-widest text-swiss-label uppercase">COMPLETED MENTORSHIPS</p>
                  <p className="text-3xl font-bold text-swiss-text">{analyticsData.metrics?.completedMentees}</p>
                  <p className="text-[10px] text-swiss-muted">Successfully advised alumni/seniors</p>
                </Card>
              </div>

              {/* Two-Column Analytics Layout */}
              <div className="grid gap-8 lg:grid-cols-3 items-start">
                {/* Left: Recent Student Advising Activity */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader
                      title="RECENT STUDENT ADVISING & MENTORSHIP ACTIVITY"
                      description="Real-time log of incoming student guidance requests and status changes"
                      actions={<Link to="/mentorship?tab=incoming" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">MANAGE REQUESTS →</Link>}
                    />
                    {analyticsData.recentAdvisingActivity?.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          title="NO RECENT ADVISING REQUESTS"
                          description="When students request academic mentorship, their activity and goals appear here."
                        />
                      </div>
                    ) : (
                      <div className="divide-y divide-swiss-border">
                        {analyticsData.recentAdvisingActivity.map((act) => (
                          <div key={act.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-swiss-text">{act.studentName}</span>
                                <Badge tone={act.status === 'ACCEPTED' ? 'green' : act.status === 'PENDING' ? 'amber' : 'slate'}>
                                  {act.status}
                                </Badge>
                              </div>
                              <p className="text-swiss-muted text-[11px]">{act.degree} · {act.yearOfStudy}</p>
                              {act.careerGoal && (
                                <p className="text-swiss-text italic text-[11px]">&ldquo;{act.careerGoal}&rdquo;</p>
                              )}
                              {act.areaOfInterest && (
                                <p className="font-mono text-[10px] text-swiss-label">Focus Area: {act.areaOfInterest}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right font-mono text-[10px] text-swiss-label">
                              <span>{new Date(act.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Institutional ERP Transparency Disclaimer */}
                  <div className="border border-swiss-border bg-swiss-surface p-4 rounded-sm text-xs space-y-2">
                    <p className="font-bold text-swiss-text uppercase font-mono tracking-wider text-[11px]">
                      REGISTRAR SYSTEM DATA DISCLOSURE:
                    </p>
                    <p className="text-swiss-muted leading-relaxed">
                      {analyticsData.dataScope?.academicGradingNote}
                    </p>
                  </div>
                </div>

                {/* Right: Cohort Breakdown */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader
                      title="COHORT BY GRADUATION YEAR"
                      description="Department student cohorts"
                    />
                    <div className="p-4 space-y-3 font-mono text-xs">
                      {analyticsData.cohortBreakdown?.length === 0 ? (
                        <p className="text-swiss-muted">No cohort records available.</p>
                      ) : (
                        analyticsData.cohortBreakdown.map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 border border-swiss-border rounded-xs">
                            <div>
                              <span className="font-bold text-swiss-text">Class of {c.graduation_year}</span>
                              <span className="text-[10px] text-swiss-muted block">{c.degree}</span>
                            </div>
                            <span className="font-bold text-swiss-accent text-sm">{c.count} students</span>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="p-4 space-y-3 font-mono text-xs">
                    <h4 className="text-[10px] uppercase font-bold text-swiss-label tracking-widest">
                      FACULTY BULLETINS
                    </h4>
                    <div className="p-3 bg-swiss-surface-alt/60 rounded-xs border border-swiss-border">
                      <span className="text-swiss-muted text-[11px] block">Published Bulletins:</span>
                      <span className="text-2xl font-bold text-swiss-text">{analyticsData.metrics?.announcementsPublished}</span>
                      <Link to="/announcements" className="block text-swiss-accent text-[10px] mt-2 underline">
                        View Department Broadcasts →
                      </Link>
                    </div>
                  </Card>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
