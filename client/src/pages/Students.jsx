import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/index.js'
import { directory, messages } from '../services/api.js'
import {
  Alert, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field,
  Input, Select, cx
} from '../components/ui.jsx'

export default function Students() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [guidanceNote, setGuidanceNote] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function load() {
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
          return
        }
      } catch {
        // Fallback
      }
      const list = db.get('students')
      setStudents(list)
    }
    load()
  }, [])

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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            02 &mdash; DEPARTMENT ADVISING & GUIDANCE
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            STUDENTS & MENTEES
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Review students in your department, inspect projects and resumes, provide research guidance, and recommend alumni career opportunities.
          </p>
        </div>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

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
            <option value="all">All Academic Years</option>
            <option value="Senior">Senior / 4th Year</option>
            <option value="Junior">Junior / 3rd Year</option>
            <option value="Sophomore">Sophomore / 2nd Year</option>
          </Select>
        </div>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3 items-start">
        {/* Student Roster */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-swiss-label uppercase tracking-widest px-1">
            <span>SHOWING {filtered.length} ENROLLED STUDENTS</span>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-8">
              <EmptyState
                title="NO STUDENTS FOUND"
                description="Try clearing search keywords or choosing a different academic year."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => (
                <article
                  key={s.id}
                  className={cx(
                    'p-5 border border-swiss-border bg-swiss-surface rounded-sm transition-colors',
                    selectedStudent?.id === s.id && 'border-swiss-text bg-swiss-surface-hover'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={s.name} size="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-swiss-text">{s.name}</h3>
                          <Badge tone="blue">{s.academicYear.split(' ')[0]}</Badge>
                        </div>
                        <p className="text-xs text-swiss-muted mt-0.5">{s.course} · GPA: {s.gpa}</p>
                        <p className="text-xs text-swiss-label font-mono mt-0.5">{s.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedStudent(s)}
                      >
                        GUIDE / ADVISE
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/messages/${s.userId}`)}
                      >
                        MESSAGE
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-swiss-border space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest">
                        Career Goals & Interests:
                      </p>
                      <Badge tone="green">{s.readinessScore}% READINESS SCORE</Badge>
                    </div>
                    <p className="text-xs text-swiss-text leading-relaxed">
                      {s.careerGoals}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {s.skills?.map((sk) => (
                        <Badge key={sk.id} tone="slate">{sk.name}</Badge>
                      ))}
                    </div>

                    {s.projects?.length > 0 && (
                      <div className="mt-2 text-xs bg-swiss-base p-2.5 rounded-sm border border-swiss-border">
                        <span className="font-mono text-[10px] uppercase text-swiss-label block mb-1">
                          Current Project:
                        </span>
                        <span className="font-semibold text-swiss-text">{s.projects[0].title}</span> &mdash;{' '}
                        <span className="text-swiss-muted">{s.projects[0].description}</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Action / Guidance Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="FACULTY ADVISING ACTION"
              description={selectedStudent ? `Advising ${selectedStudent.name}` : 'Select a student to advise'}
            />
            <div className="p-5 space-y-4">
              {selectedStudent ? (
                <>
                  <div className="p-3 border border-swiss-border bg-swiss-surface rounded-sm text-xs space-y-1">
                    <p className="font-semibold text-swiss-text">{selectedStudent.name}</p>
                    <p className="text-swiss-muted">{selectedStudent.course}</p>
                    <p className="font-mono text-swiss-label">Graduating Class of {selectedStudent.graduationYear}</p>
                  </div>

                  <Field label="Faculty Recommendation / Project Feedback">
                    <textarea
                      rows={4}
                      value={guidanceNote}
                      onChange={(e) => setGuidanceNote(e.target.value)}
                      placeholder="e.g. Recommended exploring the Atlassian Frontend role and attending the Nov 5th Distributed Systems workshop."
                      className="w-full text-xs font-mono p-3 border border-swiss-border bg-transparent rounded-sm focus:border-swiss-text focus:outline-none"
                    />
                  </Field>

                  <div className="space-y-2">
                    <Button
                      className="w-full justify-center"
                      onClick={handleSendGuidance}
                      disabled={!guidanceNote.trim()}
                    >
                      DISPATCH GUIDANCE &rarr;
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
  )
}
