import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  profiles, jobs, mentorship, events, donations, admin, notifications
} from '../services/api.js'
import { ROLES, ROLE_LABELS } from '../utils/roles.js'
import {
  Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingBlock
} from '../components/ui.jsx'

function StatTile({ label, value, hint, to }) {
  const body = (
    <>
      <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-swiss-text">{value}</p>
      {hint ? <p className="mt-1 font-mono text-[10px] text-swiss-muted uppercase">{hint}</p> : null}
    </>
  )
  return to ? (
    <Link
      to={to}
      className="rounded-sm border border-swiss-border bg-swiss-surface p-5 transition-colors hover:bg-swiss-surface-hover block"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-sm border border-swiss-border bg-swiss-surface p-5">
      {body}
    </div>
  )
}

export default function Dashboard() {
  const { user, role } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    profile: null,
    recentJobs: [],
    myApps: [],
    mentorshipRequests: [],
    activeMentorships: [],
    upcomingEvents: [],
    recentNotifs: [],
    adminMetrics: null,
    donationHistory: [],
  })

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const [
        profRes,
        jobsRes,
        appsRes,
        mentReqRes,
        mentActiveRes,
        eventsRes,
        notifsRes,
        metricsRes,
        donationsRes,
      ] = await Promise.all([
        profiles.me(),
        jobs.list({ limit: 4 }),
        jobs.myApplications(),
        mentorship.requests(),
        mentorship.mentorships(),
        events.list({ tab: 'upcoming' }),
        notifications.list({ limit: 5 }),
        role === ROLES.ADMIN ? admin.metrics() : Promise.resolve({ data: null }),
        role === ROLES.ALUMNI ? donations.history(user?.id) : Promise.resolve({ data: [] }),
      ])

      setData({
        profile: profRes.data,
        recentJobs: jobsRes.data || [],
        myApps: appsRes.data || [],
        mentorshipRequests: mentReqRes.data || [],
        activeMentorships: mentActiveRes.data || [],
        upcomingEvents: (eventsRes.data || []).slice(0, 3),
        recentNotifs: (notifsRes.data || []).slice(0, 4),
        adminMetrics: metricsRes.data,
        donationHistory: donationsRes.data || [],
      })
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [user?.id, role])

  if (loading) {
    return <Card><LoadingBlock rows={8} label="Loading your dashboard" /></Card>
  }

  if (error) {
    return <Card><ErrorState error={error} onRetry={loadDashboard} /></Card>
  }

  const { student, alumni, professor } = data.profile || {}
  const pendingRequestsCount = data.mentorshipRequests.filter((r) => r.direction === 'incoming' && r.status === 'pending').length
  const activeMentorshipsCount = data.activeMentorships.filter((m) => m.status === 'active').length

  return (
    <div className="space-y-10">
      {/* Welcome Banner */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-swiss-border pb-6">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            01 &mdash; {ROLE_LABELS[role]?.toUpperCase()} DASHBOARD
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-swiss-text">
            Welcome back, {user?.name}.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-swiss-muted leading-relaxed">
            {role === ROLES.STUDENT && "Explore alumni mentors, track internship applications, and accelerate your career readiness."}
            {role === ROLES.ALUMNI && "Connect with fellow graduates, mentor ambitious students, and support campus initiatives."}
            {role === ROLES.PROFESSOR && "Advise department students, coordinate research symposia, and connect with alumni."}
            {role === ROLES.ADMIN && "Comprehensive administrative overview of users, verifications, jobs, and platform operations."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {role === ROLES.STUDENT && (
            <>
              <Link to="/job-readiness">
                <Button variant="secondary">JOB READINESS →</Button>
              </Link>
              <Link to="/mentorship">
                <Button variant="secondary">FIND A MENTOR →</Button>
              </Link>
              <Link to="/jobs">
                <Button>EXPLORE JOBS →</Button>
              </Link>
            </>
          )}
          {role === ROLES.ALUMNI && (
            <>
              <Link to="/jobs">
                <Button variant="secondary">+ POST A JOB</Button>
              </Link>
              <Link to="/donations">
                <Button>GIVE BACK →</Button>
              </Link>
            </>
          )}
          {role === ROLES.PROFESSOR && (
            <>
              <Link to="/announcements">
                <Button variant="secondary">+ ANNOUNCEMENT</Button>
              </Link>
              <Link to="/students">
                <Button>STUDENTS ROSTER →</Button>
              </Link>
            </>
          )}
          {role === ROLES.ADMIN && (
            <>
              <Link to="/admin/verification">
                <Button variant="secondary">VERIFICATIONS ({data.adminMetrics?.pendingVerifications || 0})</Button>
              </Link>
              <Link to="/admin/jobs">
                <Button>MODERATE JOBS →</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* KPI Tiles specific to role */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {role === ROLES.STUDENT && (
          <>
            <StatTile label="Career Readiness" value={`${student?.readinessScore || 84}%`} hint="Based on active resume" to="/resume" />
            <StatTile label="Active Applications" value={data.myApps.length} hint="View status tracker" to="/jobs/applications" />
            <StatTile label="Active Mentorships" value={activeMentorshipsCount} hint="1-on-1 alumni sessions" to="/mentorship?tab=active" />
            <StatTile label="Upcoming Events" value={data.upcomingEvents.length} hint="RSVP confirmed" to="/events" />
          </>
        )}

        {role === ROLES.ALUMNI && (
          <>
            <StatTile label="Pending Requests" value={pendingRequestsCount} hint="Students seeking guidance" to="/mentorship?tab=incoming" />
            <StatTile label="Active Mentees" value={activeMentorshipsCount} hint="In active cohort" to="/mentorship?tab=active" />
            <StatTile label="Lifetime Giving" value={`₹${(alumni?.totalDonations || 0).toLocaleString()}`} hint="Tax verified receipts" to="/donations" />
            <StatTile label="Active Openings" value={data.recentJobs.length} hint="In network board" to="/jobs" />
          </>
        )}

        {role === ROLES.PROFESSOR && (
          <>
            <StatTile label="Students Guided" value={professor?.totalStudentsGuided || 42} hint="Undergraduate advising" to="/students" />
            <StatTile label="Alumni Connections" value={professor?.activeAlumniConnections || 89} hint="In department network" to="/directory" />
            <StatTile label="Department Bulletins" value={3} hint="Active campus notices" to="/announcements" />
            <StatTile label="Upcoming Seminars" value={data.upcomingEvents.length} hint="Scheduled events" to="/events" />
          </>
        )}

        {role === ROLES.ADMIN && (
          <>
            <StatTile label="Total Network Users" value={data.adminMetrics?.totalUsers || 1480} hint="94.2% verified ratio" to="/admin/users" />
            <StatTile label="Pending Verifications" value={data.adminMetrics?.pendingVerifications || 6} hint="Action required" to="/admin/verification" />
            <StatTile label="Active Job Postings" value={data.adminMetrics?.activeJobs || 24} hint="Across all sectors" to="/admin/jobs" />
            <StatTile label="Endowment Raised" value={`₹${((data.adminMetrics?.totalDonations || 6880000) / 100000).toFixed(1)}L`} hint="Active funds tally" to="/admin/donations" />
          </>
        )}
      </div>

      {/* Role-Specific Two-Column Layout */}
      <div className="grid gap-8 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 space-y-8">
          {/* STUDENT SECTION: Recommended Mentors & Jobs */}
          {role === ROLES.STUDENT && (
            <>
              <Card>
                <CardHeader
                  title="RECOMMENDED ALUMNI MENTORS"
                  description="Senior engineers and product leaders from your department open to 1-on-1 advising"
                  actions={<Link to="/mentorship" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">VIEW ALL →</Link>}
                />
                <div className="p-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar name="Aarav Mehta" size="md" />
                        <div>
                          <p className="font-bold text-sm text-swiss-text">Aarav Mehta</p>
                          <p className="text-xs text-swiss-muted">Sr. SWE at Microsoft · Class of 2021</p>
                          <Badge tone="green" className="mt-1">1 Open Slot</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-swiss-text line-clamp-2">
                        System design, distributed storage primitives, and resume critiques for aspiring engineers.
                      </p>
                      <Link to="/alumni/u_alumni_1">
                        <Button size="sm" variant="secondary" className="w-full justify-center">VIEW PROFILE →</Button>
                      </Link>
                    </div>

                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar name="Neha Kapoor" size="md" />
                        <div>
                          <p className="font-bold text-sm text-swiss-text">Neha Kapoor</p>
                          <p className="text-xs text-swiss-muted">Sr. PM at Google · Class of 2018</p>
                          <Badge tone="blue" className="mt-1">Open to Chat</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-swiss-text line-clamp-2">
                        Guiding students on breaking into APM programs, case interviews, and product leadership.
                      </p>
                      <Link to="/alumni/u_alumni_2">
                        <Button size="sm" variant="secondary" className="w-full justify-center">VIEW PROFILE →</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="RECOMMENDED JOBS & INTERNSHIPS"
                  description="High-affinity openings posted by verified alumni"
                  actions={<Link to="/jobs" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">BROWSE ALL →</Link>}
                />
                <div className="divide-y divide-swiss-border">
                  {data.recentJobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-swiss-surface-hover transition-colors">
                      <div>
                        <Link to={`/jobs/${job.id}`} className="font-bold text-sm text-swiss-text hover:underline">
                          {job.title}
                        </Link>
                        <p className="text-xs text-swiss-muted mt-0.5">{job.companyName} · {job.location} ({job.workMode})</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {job.skills?.slice(0, 3).map((sk) => (
                            <Badge key={sk.name} tone="slate">{sk.name}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.hasApplied ? (
                          <Badge tone="blue">APPLIED</Badge>
                        ) : (
                          <Link to={`/jobs/${job.id}`}>
                            <Button size="sm">APPLY →</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* ALUMNI SECTION: Incoming Mentees & Job Postings */}
          {role === ROLES.ALUMNI && (
            <>
              <Card>
                <CardHeader
                  title="INCOMING MENTORSHIP REQUESTS"
                  description="Junior scholars seeking your industry expertise"
                  actions={<Link to="/mentorship?tab=incoming" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">MANAGE ALL →</Link>}
                />
                <div className="p-5">
                  {pendingRequestsCount === 0 ? (
                    <EmptyState title="ALL CAUGHT UP" description="You have responded to all incoming mentorship requests." />
                  ) : (
                    <div className="space-y-3">
                      {data.mentorshipRequests.filter((r) => r.direction === 'incoming' && r.status === 'pending').map((req) => (
                        <div key={req.id} className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-swiss-text">{req.peer?.name}</span>
                            <Badge tone="amber">PENDING REPLY</Badge>
                          </div>
                          <p className="text-xs text-swiss-muted font-mono">{req.areaOfInterest} · Mode: {req.preferredMode}</p>
                          <p className="text-xs text-swiss-text italic border-l-2 border-swiss-border pl-2">&ldquo;{req.message}&rdquo;</p>
                          <div className="pt-2 flex gap-2">
                            <Link to="/mentorship?tab=incoming">
                              <Button size="sm">REVIEW REQUEST →</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="YOUR POSTED OPPORTUNITIES"
                  description="Manage job listings and review incoming candidates"
                  actions={<Link to="/jobs" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">+ POST NEW →</Link>}
                />
                <div className="divide-y divide-swiss-border">
                  {data.recentJobs.slice(0, 2).map((job) => (
                    <div key={job.id} className="p-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-sm text-swiss-text">{job.title}</p>
                        <p className="text-xs text-swiss-muted">{job.companyName} · {job.applicantCount || 0} applicants</p>
                      </div>
                      <Link to={`/jobs/review/${job.id}`}>
                        <Button size="sm" variant="secondary">REVIEW APPLICANTS</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* PROFESSOR SECTION: Guidance & Bulletins */}
          {role === ROLES.PROFESSOR && (
            <>
              <Card>
                <CardHeader
                  title="STUDENTS SEEKING GUIDANCE"
                  description="Recent undergraduate project drafts and thesis advising requests"
                  actions={<Link to="/students" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">STUDENT ROSTER →</Link>}
                />
                <div className="divide-y divide-swiss-border">
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-swiss-text">Riya Shah</p>
                      <p className="text-xs text-swiss-muted">3rd Year B.Tech CSE · Distributed Systems Research</p>
                    </div>
                    <Link to="/messages/u_student_1">
                      <Button size="sm">MESSAGE STUDENT</Button>
                    </Link>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm text-swiss-text">Dev Patel</p>
                      <p className="text-xs text-swiss-muted">4th Year B.Tech IT · Deepfake Video Detection Thesis</p>
                    </div>
                    <Link to="/messages/u_student_2">
                      <Button size="sm">MESSAGE STUDENT</Button>
                    </Link>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="DEPARTMENT ANNOUNCEMENTS"
                  description="Active broadcast bulletins to students and faculty"
                  actions={<Link to="/announcements" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">MANAGE →</Link>}
                />
                <div className="p-5 space-y-3">
                  <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                    <Badge tone="blue">ALL STUDENTS</Badge>
                    <h4 className="font-bold text-sm text-swiss-text mt-1.5">
                      Call for Papers: Departmental Research Symposium 2026
                    </h4>
                    <p className="text-xs text-swiss-muted mt-1">Abstract submission deadline: Oct 20, 2026</p>
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* ADMIN SECTION: System Summary & Actions */}
          {role === ROLES.ADMIN && (
            <>
              <Card>
                <CardHeader
                  title="PENDING ALUMNI VERIFICATION QUEUE"
                  description="Graduates awaiting official alumni badge verification"
                  actions={<Link to="/admin/verification" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">VERIFY ALL →</Link>}
                />
                <div className="divide-y divide-swiss-border">
                  <div className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-swiss-text">Pooja Iyer</span>
                        <Badge tone="amber">PENDING APPROVAL</Badge>
                      </div>
                      <p className="text-xs text-swiss-muted mt-0.5">B.Tech Computer Science (Class of 2022) · Frontend Engineer at Atlassian</p>
                    </div>
                    <Link to="/admin/verification">
                      <Button size="sm">REVIEW CREDENTIALS →</Button>
                    </Link>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="RECENT AUDIT TRAIL"
                  description="System security and administrative action logs"
                  actions={<Link to="/admin/audit-logs" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">FULL LOG →</Link>}
                />
                <div className="divide-y divide-swiss-border font-mono text-xs">
                  <div className="p-4 flex items-center justify-between">
                    <span>[VERIFY_ALUMNI] Verified Rahul Shah (B.Tech IT 2023)</span>
                    <Badge tone="green">SUCCESS</Badge>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <span>[FLAG_JOB_POSTING] Flagged suspicious crypto listing #job_006</span>
                    <Badge tone="amber">FLAGGED</Badge>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Sidebar Widgets: Events & Notifications */}
        <div className="space-y-8">
          <Card>
            <CardHeader
              title="UPCOMING EVENTS"
              description="Campus reunions & technical workshops"
              actions={<Link to="/events" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">ALL →</Link>}
            />
            {data.upcomingEvents.length === 0 ? (
              <div className="p-6">
                <EmptyState title="NO EVENTS" description="No upcoming events scheduled." />
              </div>
            ) : (
              <ul className="divide-y divide-swiss-border">
                {data.upcomingEvents.map((evt) => (
                  <li key={evt.id} className="p-4 space-y-1.5 hover:bg-swiss-surface-hover transition-colors">
                    <div className="flex items-center justify-between">
                      <Badge tone={evt.isVirtual ? 'blue' : 'green'}>
                        {evt.isVirtual ? 'ONLINE' : 'IN-PERSON'}
                      </Badge>
                      <span className="font-mono text-[10px] text-swiss-label">
                        {new Date(evt.date).toLocaleDateString()}
                      </span>
                    </div>
                    <Link to={`/events/${evt.id}`} className="block font-bold text-xs text-swiss-text hover:underline">
                      {evt.title}
                    </Link>
                    <p className="text-[11px] text-swiss-muted truncate">{evt.location}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="RECENT NOTIFICATIONS"
              actions={<Link to="/notifications" className="font-mono text-xs text-swiss-label hover:text-swiss-text uppercase">ALL →</Link>}
            />
            {data.recentNotifs.length === 0 ? (
              <div className="p-6">
                <EmptyState title="ALL CAUGHT UP" description="You have no unread notifications." />
              </div>
            ) : (
              <ul className="divide-y divide-swiss-border">
                {data.recentNotifs.map((n) => (
                  <li key={n.id} className="p-4 space-y-1 hover:bg-swiss-surface-hover transition-colors">
                    <p className="font-semibold text-xs text-swiss-text">{n.title}</p>
                    <p className="text-xs text-swiss-muted line-clamp-2">{n.body}</p>
                    <p className="font-mono text-[10px] text-swiss-label">
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
