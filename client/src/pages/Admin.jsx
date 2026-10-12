import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { admin, jobs, events, donations } from '../services/api.js'
import { ROLES, ROLE_LABELS } from '../utils/roles.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Select, Spinner, cx
} from '../components/ui.jsx'

const TABS = [
  { id: 'overview', label: 'Overview', path: 'dashboard' },
  { id: 'users', label: 'User Management', path: 'users' },
  { id: 'verification', label: 'Alumni Verification', path: 'verification' },
  { id: 'jobs', label: 'Job Moderation', path: 'jobs' },
  { id: 'events', label: 'Event Management', path: 'events' },
  { id: 'donations', label: 'Donations Audit', path: 'donations' },
  { id: 'analytics', label: 'Analytics', path: 'analytics' },
  { id: 'audit_logs', label: 'Audit Logs', path: 'audit-logs' },
]

function AdminModal({ isOpen, onClose, title, subtitle, children, actions }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-swiss-surface border border-swiss-border rounded-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-swiss-border px-5 py-4 bg-swiss-surface">
          <div>
            <h3 className="text-sm font-bold font-mono tracking-wide text-swiss-text uppercase">{title}</h3>
            {subtitle && <p className="text-xs text-swiss-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-swiss-muted hover:text-swiss-text p-1 text-xs font-mono font-bold"
          >
            ✕
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4 font-sans text-xs">
          {children}
        </div>
        {actions && (
          <div className="flex items-center justify-end gap-2 border-t border-swiss-border px-5 py-3 bg-swiss-surface-hover/50">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Admin({ initialTab = 'overview' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentAdmin } = useAuth()

  const [activeTab, setActiveTab] = useState(initialTab)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busyId, setBusyId] = useState(null)

  // Data states
  const [metrics, setMetrics] = useState(null)
  const [usersList, setUsersList] = useState([])
  const [pendingVerifications, setPendingVerifications] = useState([])
  const [jobsList, setJobsList] = useState([])
  const [eventsList, setEventsList] = useState([])
  const [donationsList, setDonationsList] = useState([])
  const [auditLogsList, setAuditLogsList] = useState([])

  // Filters
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')

  const [jobSearch, setJobSearch] = useState('')
  const [jobStatusFilter, setJobStatusFilter] = useState('all')

  const [eventSearch, setEventSearch] = useState('')
  const [eventStatusFilter, setEventStatusFilter] = useState('all')

  const [donationSearch, setDonationSearch] = useState('')
  const [donationFundFilter, setDonationFundFilter] = useState('all')

  const [logSearch, setLogSearch] = useState('')
  const [logActionFilter, setLogActionFilter] = useState('all')

  // Modals
  const [activeModal, setActiveModal] = useState(null)
  const [modalItem, setModalItem] = useState(null)
  const [modalText, setModalText] = useState('')
  const [rosterData, setRosterData] = useState([])
  const [rosterLoading, setRosterLoading] = useState(false)

  // Synchronize route and active tab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    } else {
      const seg = location.pathname.split('/admin/')[1]
      if (seg) {
        const found = TABS.find((t) => t.path === seg || t.id === seg)
        if (found) setActiveTab(found.id)
      }
    }
  }, [initialTab, location.pathname])

  async function loadAdminData() {
    setLoading(true)
    setError(null)
    try {
      const [
        metricsRes,
        usersRes,
        pendingRes,
        jobsRes,
        eventsRes,
        donationsRes,
        logsRes,
      ] = await Promise.all([
        admin.metrics(),
        admin.users({ limit: 100 }),
        admin.pendingVerifications({ limit: 50 }).catch(() => ({ data: [] })),
        jobs.list({ includePending: 'true' }).catch(() => ({ data: [] })),
        events.list({ status: 'ALL' }).catch(() => ({ data: [] })),
        donations.all().catch(() => ({ data: [] })),
        admin.auditLogs({ limit: 50 }).catch(() => ({ data: [] })),
      ])

      setMetrics(metricsRes.data)
      setUsersList(usersRes.data || [])
      setPendingVerifications(pendingRes.data || [])
      setJobsList(jobsRes.data || [])
      setEventsList(eventsRes.data || [])
      setDonationsList(donationsRes.data || [])
      setAuditLogsList(logsRes.data || [])
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [])

  function handleTabChange(tab) {
    setActiveTab(tab.id)
    setMessage(null)
    navigate(`/admin/${tab.path}`)
  }

  // Verification actions
  async function handleVerify(userId, approved, notes = null) {
    setBusyId(userId)
    setMessage(null)
    try {
      const res = await admin.verify(userId, approved, notes || (approved ? 'Verified via Admin Console' : 'Rejected via Admin Console'))
      if (res?.data?.alreadyVerified) {
        setMessage({ tone: 'info', text: 'This alumni profile is already verified. No further action needed.' })
      } else if (res?.data?.alreadyRejected) {
        setMessage({ tone: 'info', text: 'This alumni profile was already rejected.' })
      } else {
        setMessage({ tone: 'success', text: approved ? 'Alumni profile approved and verified.' : 'Alumni verification request rejected.' })
      }
      closeModal()
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Verification update failed' })
    } finally {
      setBusyId(null)
    }
  }

  // User management actions
  async function handleRoleChange(userId, newRole) {
    if (userId === currentAdmin?.id && newRole !== ROLES.ADMIN) {
      setMessage({ tone: 'error', text: 'Cannot revoke your own administrator role to prevent lock-out.' })
      return
    }
    setBusyId(userId)
    try {
      const res = await admin.updateRole(userId, newRole)
      setMessage({ tone: 'success', text: res.message || `Role updated to ${newRole}` })
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to update user role' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleUserStatus(userId, shouldActivate) {
    if (userId === currentAdmin?.id && !shouldActivate) {
      setMessage({ tone: 'error', text: 'You cannot deactivate your own administrative account.' })
      return
    }
    setBusyId(userId)
    try {
      const res = shouldActivate
        ? await admin.activateUser(userId)
        : await admin.deactivateUser(userId)
      setMessage({ tone: 'success', text: res.message || (shouldActivate ? 'User activated' : 'User deactivated') })
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to update account status' })
    } finally {
      setBusyId(null)
    }
  }

  // Job moderation actions
  async function handleJobModerate(jobId, action, reason = null) {
    setBusyId(jobId)
    try {
      const res = await admin.moderateJob(jobId, action, reason)
      setMessage({ tone: 'success', text: res.message || `Job status updated to ${action.toUpperCase()}` })
      closeModal()
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to moderate job' })
    } finally {
      setBusyId(null)
    }
  }

  // Event management actions
  async function handleEventPublish(eventId) {
    setBusyId(eventId)
    try {
      const res = await events.publish(eventId)
      setMessage({ tone: 'success', text: res.message || 'Event published to network calendar.' })
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to publish event' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleEventCancel(eventId, reason) {
    if (!reason || !reason.trim()) {
      setMessage({ tone: 'error', text: 'A cancellation reason is required.' })
      return
    }
    setBusyId(eventId)
    try {
      const res = await events.cancel(eventId, { reason: reason.trim() })
      setMessage({ tone: 'success', text: res.message || 'Event has been cancelled.' })
      closeModal()
      loadAdminData()
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to cancel event' })
    } finally {
      setBusyId(null)
    }
  }

  async function openEventRoster(event) {
    setModalItem(event)
    setActiveModal('event_roster')
    setRosterLoading(true)
    try {
      const res = await events.listAttendees(event.id).catch(() => events.listRsvps(event.id))
      setRosterData(res?.data || [])
    } catch {
      setRosterData([])
    } finally {
      setRosterLoading(false)
    }
  }

  function closeModal() {
    setActiveModal(null)
    setModalItem(null)
    setModalText('')
    setRosterData([])
  }

  // Filtered lists
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (userRoleFilter !== 'all' && !u.roles?.includes(userRoleFilter)) return false
      if (userStatusFilter !== 'all') {
        const status = u.account_status || (u.is_active ? 'ACTIVE' : 'INACTIVE')
        if (status !== userStatusFilter) return false
      }
      if (userSearch) {
        const q = userSearch.toLowerCase()
        return (
          u.full_name?.toLowerCase().includes(q) ||
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [usersList, userRoleFilter, userStatusFilter, userSearch])

  const filteredJobs = useMemo(() => {
    return jobsList.filter((j) => {
      const status = (j.status || j.moderationStatus || '').toUpperCase()
      if (jobStatusFilter === 'pending' && status !== 'PENDING_REVIEW') return false
      if (jobStatusFilter === 'published' && status !== 'PUBLISHED') return false
      if (jobStatusFilter === 'rejected' && status !== 'REJECTED') return false
      if (jobSearch) {
        const q = jobSearch.toLowerCase()
        return (
          j.title?.toLowerCase().includes(q) ||
          j.companyName?.toLowerCase().includes(q) ||
          j.location?.toLowerCase().includes(q) ||
          j.postedBy?.name?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [jobsList, jobStatusFilter, jobSearch])

  const filteredEvents = useMemo(() => {
    return eventsList.filter((e) => {
      const status = (e.status || 'published').toUpperCase()
      if (eventStatusFilter === 'draft' && status !== 'DRAFT') return false
      if (eventStatusFilter === 'published' && status !== 'PUBLISHED') return false
      if (eventStatusFilter === 'completed' && status !== 'COMPLETED') return false
      if (eventStatusFilter === 'cancelled' && status !== 'CANCELLED') return false
      if (eventSearch) {
        const q = eventSearch.toLowerCase()
        return (
          e.title?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q) ||
          e.venue?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [eventsList, eventStatusFilter, eventSearch])

  const filteredDonations = useMemo(() => {
    return donationsList.filter((d) => {
      if (donationFundFilter !== 'all' && d.fundName !== donationFundFilter) return false
      if (donationSearch) {
        const q = donationSearch.toLowerCase()
        return (
          d.donorName?.toLowerCase().includes(q) ||
          d.receiptNumber?.toLowerCase().includes(q) ||
          d.taxExemption80G?.toLowerCase().includes(q) ||
          d.fundName?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [donationsList, donationFundFilter, donationSearch])

  const donationFunds = useMemo(() => {
    const set = new Set()
    donationsList.forEach((d) => { if (d.fundName) set.add(d.fundName) })
    return Array.from(set)
  }, [donationsList])

  const totalSuccessfulDonations = useMemo(() => {
    return donationsList
      .filter((d) => (d.status || 'SUCCESS').toUpperCase() === 'SUCCESS')
      .reduce((acc, d) => acc + (Number(d.amount) || 0), 0)
  }, [donationsList])

  const filteredLogs = useMemo(() => {
    return auditLogsList.filter((l) => {
      if (logActionFilter !== 'all' && !l.action?.toLowerCase().includes(logActionFilter.toLowerCase())) {
        return false
      }
      if (logSearch) {
        const q = logSearch.toLowerCase()
        const actor = l.actor?.name || l.userName || l.actor?.email || ''
        const action = l.action || ''
        const resource = l.targetType || l.resource || ''
        return (
          actor.toLowerCase().includes(q) ||
          action.toLowerCase().includes(q) ||
          resource.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [auditLogsList, logActionFilter, logSearch])

  const pendingJobsCount = useMemo(() => {
    return jobsList.filter((j) => (j.status || j.moderationStatus || '').toUpperCase() === 'PENDING_REVIEW').length
  }, [jobsList])

  const pendingEventsCount = useMemo(() => {
    return eventsList.filter((e) => (e.status || '').toUpperCase() === 'DRAFT').length
  }, [eventsList])

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-swiss-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">
              ADMINISTRATION &mdash; SYSTEM CONSOLE
            </span>
            <Badge tone="amber">SYSTEM [SYS]</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            ADMIN PORTAL
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Platform governance, credential verification, moderation oversight, donation records, and tamper-resistant audit logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadAdminData} disabled={loading}>
            {loading ? <Spinner /> : 'REFRESH DATA ↻'}
          </Button>
        </div>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {loading ? (
        <Card><LoadingBlock rows={8} label="Loading administrative control telemetry" /></Card>
      ) : error ? (
        <Card><ErrorState error={error} onRetry={loadAdminData} /></Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Tabs Navigation Sidebar */}
          <nav className="w-full lg:w-60 shrink-0 flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {TABS.map((tab) => {
              let badgeCount = null
              if (tab.id === 'verification') badgeCount = pendingVerifications.length
              if (tab.id === 'jobs') badgeCount = pendingJobsCount
              if (tab.id === 'events') badgeCount = pendingEventsCount

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab)}
                  className={cx(
                    'text-left px-3.5 py-2.5 text-xs font-mono font-medium rounded-sm transition-colors flex items-center justify-between uppercase tracking-wider',
                    activeTab === tab.id
                      ? 'bg-swiss-text text-swiss-base font-bold'
                      : 'text-swiss-muted hover:bg-swiss-surface hover:text-swiss-text'
                  )}
                >
                  <span>{tab.label}</span>
                  {badgeCount > 0 && (
                    <span className={cx(
                      'px-1.5 py-0.5 rounded-xs text-[9px] font-mono font-bold ml-2',
                      activeTab === tab.id ? 'bg-swiss-accent text-white' : 'bg-amber-500 text-black'
                    )}>
                      {badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Main Tab Panels */}
          <div className="flex-1 w-full space-y-6 min-w-0">
            {/* 1. OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card className="p-5">
                    <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest">TOTAL USERS</p>
                    <p className="text-3xl font-bold text-swiss-text mt-2">{metrics?.totalUsers || usersList.length}</p>
                    <p className="text-[10px] font-mono text-swiss-muted mt-1">
                      {metrics?.alumniCount || usersList.filter(u => u.roles?.includes(ROLES.ALUMNI)).length} ALUMNI · {metrics?.studentCount || usersList.filter(u => u.roles?.includes(ROLES.STUDENT)).length} STUDENTS
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest">PENDING VERIFICATIONS</p>
                    <p className="text-3xl font-bold text-amber-500 mt-2">{pendingVerifications.length}</p>
                    <p className="text-[10px] font-mono text-swiss-muted mt-1">
                      {pendingVerifications.length > 0 ? 'ACTION REQUIRED' : 'ALL VERIFIED'}
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest">ACTIVE JOB POSTINGS</p>
                    <p className="text-3xl font-bold text-swiss-text mt-2">{jobsList.filter(j => (j.status || '').toUpperCase() === 'PUBLISHED').length}</p>
                    <p className="text-[10px] font-mono text-swiss-muted mt-1">{pendingJobsCount} PENDING REVIEW</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest">ENDOWMENT FUNDS</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">
                      ₹{((totalSuccessfulDonations || metrics?.totalDonations || 0) / 100000).toFixed(1)}L
                    </p>
                    <p className="text-[10px] font-mono text-swiss-muted mt-1">
                      {donationsList.length} RECORDED GIFTS
                    </p>
                  </Card>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <Card>
                    <CardHeader title="DEPARTMENT BREAKDOWN" description="Registered members distribution across faculties" />
                    <div className="p-5 space-y-3">
                      {metrics?.departmentBreakdown?.map((d) => (
                        <div key={d.department} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-swiss-text">{d.department}</span>
                            <span className="text-swiss-label">{d.count} ({d.percentage}%)</span>
                          </div>
                          <div className="w-full bg-swiss-border h-1.5 rounded-xs overflow-hidden">
                            <div className="bg-swiss-accent h-full" style={{ width: `${d.percentage}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="TOP ALUMNI EMPLOYERS" description="Organizations with highest network concentration" />
                    <div className="divide-y divide-swiss-border font-mono text-xs">
                      {metrics?.topHiringCompanies?.map((c) => (
                        <div key={c.company} className="p-4 flex items-center justify-between">
                          <span className="font-bold text-swiss-text">{c.company}</span>
                          <span className="text-swiss-label">{c.alumniCount} Alumni · {c.openJobs} Open Roles</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <Card>
                  <CardHeader title="OPERATIONAL WORKFLOW SHORTCUTS" />
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-2">
                      <p className="font-bold text-sm text-swiss-text">Alumni Verification</p>
                      <p className="text-xs text-swiss-muted">{pendingVerifications.length} applicants waiting for institutional identity approval.</p>
                      <Button size="sm" onClick={() => handleTabChange({ id: 'verification', path: 'verification' })}>
                        GO TO QUEUE →
                      </Button>
                    </div>
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-2">
                      <p className="font-bold text-sm text-swiss-text">Job Moderation</p>
                      <p className="text-xs text-swiss-muted">{pendingJobsCount} job listings submitted by members awaiting safety review.</p>
                      <Button size="sm" onClick={() => handleTabChange({ id: 'jobs', path: 'jobs' })}>
                        REVIEW JOBS ({pendingJobsCount}) →
                      </Button>
                    </div>
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-2">
                      <p className="font-bold text-sm text-swiss-text">Events Oversight</p>
                      <p className="text-xs text-swiss-muted">{pendingEventsCount} draft campus events pending publication to public calendar.</p>
                      <Button size="sm" onClick={() => handleTabChange({ id: 'events', path: 'events' })}>
                        MANAGE EVENTS ({pendingEventsCount}) →
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* 2. USER MANAGEMENT */}
            {activeTab === 'users' && (
              <Card>
                <div className="p-5 border-b border-swiss-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-swiss-text">
                    Network Accounts ({filteredUsers.length})
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="text-xs max-w-xs"
                    />
                    <Select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="text-xs w-32"
                    >
                      <option value="all">All Roles</option>
                      <option value={ROLES.ALUMNI}>Alumni</option>
                      <option value={ROLES.STUDENT}>Students</option>
                      <option value={ROLES.PROFESSOR}>Professors</option>
                      <option value={ROLES.ADMIN}>Admins</option>
                    </Select>
                    <Select
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="text-xs w-32"
                    >
                      <option value="all">All Status</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="SUSPENDED">Suspended</option>
                    </Select>
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="p-8">
                    <EmptyState title="NO USERS FOUND" description="No accounts match your search filters." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-swiss-border bg-swiss-surface text-swiss-label uppercase tracking-widest">
                        <tr>
                          <th className="p-4">Name & Email</th>
                          <th className="p-4">Role</th>
                          <th className="p-4">Department / Year</th>
                          <th className="p-4">Account Status</th>
                          <th className="p-4">Verification</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-swiss-border text-swiss-text">
                        {filteredUsers.map((u) => {
                          const isSelf = u.id === currentAdmin?.id
                          const role = u.roles?.[0] || 'USER'
                          const isVerified = Boolean(u.verified || u.verification_status === 'verified')
                          const isPending = u.verification_status === 'pending'
                          const isSuspended = u.is_suspended || u.account_status === 'SUSPENDED'
                          const isActive = u.is_active !== false && !isSuspended

                          return (
                            <tr key={u.id} className="hover:bg-swiss-surface-hover transition-colors">
                              <td className="p-4 font-sans">
                                <p className="font-bold text-sm text-swiss-text">{u.full_name || u.name}</p>
                                <p className="text-xs font-mono text-swiss-label">{u.email}</p>
                                {isSelf && <span className="text-[10px] text-amber-500 font-mono font-bold">(YOU)</span>}
                              </td>
                              <td className="p-4">
                                <Badge tone={role === ROLES.ALUMNI ? 'green' : role === ROLES.PROFESSOR ? 'purple' : role === ROLES.ADMIN ? 'amber' : 'blue'}>
                                  {role}
                                </Badge>
                              </td>
                              <td className="p-4">
                                {u.department || 'General'} · {u.graduation_year || u.graduationYear || '—'}
                              </td>
                              <td className="p-4">
                                <Badge tone={isSuspended ? 'red' : isActive ? 'green' : 'slate'}>
                                  {isSuspended ? 'SUSPENDED' : isActive ? 'ACTIVE' : 'INACTIVE'}
                                </Badge>
                              </td>
                              <td className="p-4">
                                {isVerified ? (
                                  <Badge tone="green">&check; VERIFIED</Badge>
                                ) : isPending ? (
                                  <Badge tone="amber">PENDING</Badge>
                                ) : (
                                  <Badge tone="slate">UNVERIFIED</Badge>
                                )}
                              </td>
                              <td className="p-4 text-right space-x-2">
                                <Select
                                  defaultValue={role}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                  className="text-[11px] py-1 px-2 h-7 w-28 inline-block"
                                  disabled={busyId === u.id || isSelf}
                                >
                                  <option value={ROLES.STUDENT}>Student</option>
                                  <option value={ROLES.ALUMNI}>Alumni</option>
                                  <option value={ROLES.PROFESSOR}>Professor</option>
                                  <option value={ROLES.ADMIN}>Admin</option>
                                </Select>

                                <Button
                                  size="sm"
                                  variant={isActive ? 'ghost' : 'secondary'}
                                  disabled={busyId === u.id || isSelf}
                                  onClick={() => handleToggleUserStatus(u.id, !isActive)}
                                  className={isActive ? 'text-red-500' : 'text-emerald-500'}
                                >
                                  {isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setModalItem(u); setActiveModal('user_detail'); }}
                                >
                                  DETAILS
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* 3. ALUMNI VERIFICATION */}
            {activeTab === 'verification' && (
              <Card>
                <CardHeader
                  title="PENDING ALUMNI VERIFICATION QUEUE"
                  description="Cross-reference graduation records before granting official verified credentials"
                />
                <div className="p-5">
                  {pendingVerifications.length === 0 ? (
                    <EmptyState
                      title="QUEUE EMPTY"
                      description="No alumni verification requests are currently pending review."
                    />
                  ) : (
                    <div className="space-y-4">
                      {pendingVerifications.map((u) => {
                        const targetId = u.userId || u.user_id || u.id
                        return (
                          <div key={targetId} className="p-5 border border-swiss-border bg-swiss-surface rounded-sm flex flex-wrap items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-sm text-swiss-text">{u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}</h3>
                                <Badge tone="amber">AWAITING VERIFICATION</Badge>
                              </div>
                              <p className="text-xs text-swiss-muted font-mono">
                                Email: {u.email} · Dept / Major: {u.major || u.department || 'N/A'} · Degree: {u.degree || 'B.Tech'}
                              </p>
                              <p className="text-xs text-swiss-muted font-mono">
                                University: {u.university || 'Vidyalankar Institute of Technology'} · Grad Year: {u.graduationYear || u.graduation_year || '2024'}
                              </p>
                              {u.studentIdNumber && (
                                <p className="text-xs text-swiss-label font-mono">
                                  Roll / Student ID: {u.studentIdNumber}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => { setModalItem(u); setActiveModal('verify_detail'); }}
                              >
                                REVIEW CREDENTIALS
                              </Button>
                              <Button
                                size="sm"
                                disabled={busyId === targetId}
                                onClick={() => handleVerify(targetId, true)}
                              >
                                {busyId === targetId ? <Spinner /> : 'APPROVE & VERIFY'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                disabled={busyId === targetId}
                                onClick={() => { setModalItem(u); setModalText(''); setActiveModal('verify_reject'); }}
                              >
                                REJECT
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* 4. JOB MODERATION */}
            {activeTab === 'jobs' && (
              <Card>
                <div className="p-5 border-b border-swiss-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-swiss-text">
                      Job Moderation Queue ({filteredJobs.length})
                    </h2>
                    <p className="text-xs text-swiss-muted mt-1">Review opportunities to enforce policy compliance and prevent spam.</p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search jobs..."
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      className="text-xs max-w-xs"
                    />
                    <Select
                      value={jobStatusFilter}
                      onChange={(e) => setJobStatusFilter(e.target.value)}
                      className="text-xs w-36"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending Review</option>
                      <option value="published">Published</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </div>
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="p-8">
                    <EmptyState title="NO JOBS FOUND" description="No job listings match your moderation filter." />
                  </div>
                ) : (
                  <div className="divide-y divide-swiss-border">
                    {filteredJobs.map((job) => {
                      const status = (job.status || job.moderationStatus || 'pending_review').toUpperCase()
                      return (
                        <div key={job.id} className="p-5 flex flex-wrap items-start justify-between gap-4 hover:bg-swiss-surface-hover/30 transition-colors">
                          <div className="max-w-xl space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-swiss-text">{job.title}</span>
                              <Badge tone={status === 'PENDING_REVIEW' ? 'amber' : status === 'PUBLISHED' ? 'green' : 'red'}>
                                {status}
                              </Badge>
                            </div>
                            <p className="text-xs text-swiss-muted font-mono">
                              {job.companyName} · {job.location || 'Remote'} ({job.workMode || 'Full-time'}) · {job.salaryCurrency || '₹'} {job.salaryMin?.toLocaleString() || '0'} - {job.salaryMax?.toLocaleString() || 'Open'}
                            </p>
                            <p className="text-xs text-swiss-text line-clamp-2 leading-relaxed pt-1">
                              {job.description}
                            </p>
                            <p className="text-[10px] font-mono text-swiss-label pt-1">
                              Posted by: {job.postedBy?.name || 'Network Member'} · Submitted: {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'Recent'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => { setModalItem(job); setActiveModal('job_detail'); }}
                            >
                              DETAILS
                            </Button>
                            {status !== 'PUBLISHED' && (
                              <Button
                                size="sm"
                                onClick={() => handleJobModerate(job.id, 'approve')}
                                disabled={busyId === job.id}
                              >
                                APPROVE
                              </Button>
                            )}
                            {status !== 'REJECTED' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleJobModerate(job.id, 'flag')}
                                disabled={busyId === job.id}
                              >
                                FLAG
                              </Button>
                            )}
                            {status !== 'REJECTED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                onClick={() => { setModalItem(job); setModalText(''); setActiveModal('job_reject'); }}
                                disabled={busyId === job.id}
                              >
                                REJECT
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* 5. EVENT MANAGEMENT */}
            {activeTab === 'events' && (
              <Card>
                <div className="p-5 border-b border-swiss-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-swiss-text">
                      Event Management & Moderation ({filteredEvents.length})
                    </h2>
                    <p className="text-xs text-swiss-muted mt-1">Campus reunion calendars, seminar approval, and attendance tracking.</p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search events..."
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                      className="text-xs max-w-xs"
                    />
                    <Select
                      value={eventStatusFilter}
                      onChange={(e) => setEventStatusFilter(e.target.value)}
                      className="text-xs w-36"
                    >
                      <option value="all">All Status</option>
                      <option value="draft">Drafts / Pending</option>
                      <option value="published">Published</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </Select>
                  </div>
                </div>

                {filteredEvents.length === 0 ? (
                  <div className="p-8">
                    <EmptyState title="NO EVENTS FOUND" description="No events match your filter criteria." />
                  </div>
                ) : (
                  <div className="divide-y divide-swiss-border">
                    {filteredEvents.map((e) => {
                      const status = (e.status || 'published').toUpperCase()
                      return (
                        <div key={e.id} className="p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-swiss-surface-hover/30 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-swiss-text">{e.title}</span>
                              <Badge tone={status === 'PUBLISHED' ? 'green' : status === 'DRAFT' ? 'amber' : status === 'COMPLETED' ? 'blue' : 'red'}>
                                {status}
                              </Badge>
                              {e.isVirtual && <Badge tone="blue">ONLINE</Badge>}
                            </div>
                            <p className="text-xs text-swiss-muted font-mono">
                              Date: {e.date} at {e.time} · {e.location || 'Campus Auditorium'}
                            </p>
                            <p className="text-xs font-mono text-swiss-label">
                              {e.attendeesCount || 0} RSVPs confirmed of {e.capacity || 100} capacity · Organizer: {e.organizer || 'Alumni Relations'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEventRoster(e)}
                            >
                              VIEW ROSTER
                            </Button>
                            {status === 'DRAFT' && (
                              <Button
                                size="sm"
                                disabled={busyId === e.id}
                                onClick={() => handleEventPublish(e.id)}
                              >
                                APPROVE & PUBLISH
                              </Button>
                            )}
                            {status === 'PUBLISHED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500"
                                disabled={busyId === e.id}
                                onClick={() => { setModalItem(e); setModalText(''); setActiveModal('event_cancel'); }}
                              >
                                CANCEL EVENT
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* 6. DONATIONS AUDIT */}
            {activeTab === 'donations' && (
              <Card>
                <div className="p-5 border-b border-swiss-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-swiss-text">
                      Endowment Contributions & Section 80G Ledger
                    </h2>
                    <p className="text-xs text-swiss-muted mt-1">
                      Total Verified Giving: <span className="text-emerald-500 font-bold font-mono">₹{totalSuccessfulDonations.toLocaleString()}</span> across {donationsList.length} gifts
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search receipts / donors..."
                      value={donationSearch}
                      onChange={(e) => setDonationSearch(e.target.value)}
                      className="text-xs max-w-xs"
                    />
                    <Select
                      value={donationFundFilter}
                      onChange={(e) => setDonationFundFilter(e.target.value)}
                      className="text-xs w-44"
                    >
                      <option value="all">All Campaigns</option>
                      {donationFunds.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                {filteredDonations.length === 0 ? (
                  <div className="p-8">
                    <EmptyState title="NO DONATIONS FOUND" description="No financial contribution records match your query." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-swiss-border bg-swiss-surface text-swiss-label uppercase tracking-widest">
                        <tr>
                          <th className="p-4">Receipt #</th>
                          <th className="p-4">Donor</th>
                          <th className="p-4">Endowment Fund</th>
                          <th className="p-4">Amount</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">80G Certificate</th>
                          <th className="p-4">Date</th>
                          <th className="p-4 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-swiss-border text-swiss-text">
                        {filteredDonations.map((d) => (
                          <tr key={d.id} className="hover:bg-swiss-surface-hover transition-colors">
                            <td className="p-4 font-bold text-swiss-accent">{d.receiptNumber}</td>
                            <td className="p-4 font-sans">{d.donorName}</td>
                            <td className="p-4 truncate max-w-xs">{d.fundName}</td>
                            <td className="p-4 font-bold text-emerald-600">₹{(d.amount || 0).toLocaleString()}</td>
                            <td className="p-4">
                              <Badge tone={(d.status || 'SUCCESS').toUpperCase() === 'SUCCESS' ? 'green' : 'amber'}>
                                {d.status || 'SUCCESS'}
                              </Badge>
                            </td>
                            <td className="p-4">{d.taxExemption80G}</td>
                            <td className="p-4 text-swiss-label">{new Date(d.date).toLocaleDateString()}</td>
                            <td className="p-4 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setModalItem(d); setActiveModal('donation_detail'); }}
                              >
                                VIEW
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* 7. ANALYTICS */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <Card className="p-6 space-y-4">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-swiss-label">PLATFORM USER GROWTH TRAJECTORY</h3>
                  <div className="grid grid-cols-6 gap-2 text-center font-mono text-xs pt-4">
                    {metrics?.userGrowth?.map((g) => {
                      const maxVal = Math.max(...metrics.userGrowth.map(x => x.total), 1)
                      const pct = Math.max(10, Math.round((g.total / maxVal) * 100))
                      return (
                        <div key={g.month} className="space-y-2">
                          <div className="h-32 bg-swiss-surface border border-swiss-border rounded-sm flex items-end justify-center p-1">
                            <div
                              className="bg-swiss-accent w-full rounded-xs transition-all duration-500"
                              style={{ height: `${pct}%` }}
                            />
                          </div>
                          <p className="font-bold text-swiss-text">{g.month}</p>
                          <p className="text-[10px] text-swiss-label">{g.total}</p>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                <div className="grid gap-6 sm:grid-cols-2">
                  <Card className="p-6 space-y-4">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-swiss-label">CONTENT & MODERATION METRICS</h3>
                    <div className="grid grid-cols-2 gap-4 font-mono text-center">
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-emerald-500">{jobsList.filter(j => (j.status || '').toUpperCase() === 'PUBLISHED').length}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Live Job Openings</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-amber-500">{pendingJobsCount}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Pending Job Audits</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-blue-500">{eventsList.filter(e => (e.status || '').toUpperCase() === 'PUBLISHED').length}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Active Events</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-purple-500">{pendingVerifications.length}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Pending Verifications</p>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 space-y-4">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-swiss-label">GIVING & ENGAGEMENT METRICS</h3>
                    <div className="grid grid-cols-2 gap-4 font-mono text-center">
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-swiss-text">₹{(totalSuccessfulDonations / 100000).toFixed(1)}L</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Endowment Raised</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-swiss-text">{metrics?.activeMentorships || 8}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Active Mentorships</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-swiss-text">{donationsList.length}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Donation Records</p>
                      </div>
                      <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                        <p className="text-2xl font-bold text-swiss-text">{auditLogsList.length}</p>
                        <p className="text-[10px] text-swiss-label uppercase mt-1">Security Audit Events</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* 8. AUDIT LOGS */}
            {activeTab === 'audit_logs' && (
              <Card>
                <div className="p-5 border-b border-swiss-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-swiss-text">
                      Administrative Audit Trail ({filteredLogs.length})
                    </h2>
                    <p className="text-xs text-swiss-muted mt-1">Immutable security event record tracking privileged role changes, decisions, and system actions.</p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Search actor or resource..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className="text-xs max-w-xs"
                    />
                    <Select
                      value={logActionFilter}
                      onChange={(e) => setLogActionFilter(e.target.value)}
                      className="text-xs w-36"
                    >
                      <option value="all">All Actions</option>
                      <option value="VERIFY">Verification</option>
                      <option value="JOB">Job Moderation</option>
                      <option value="USER">User Status</option>
                      <option value="ROLE">Role Changes</option>
                      <option value="DONATION">Donations</option>
                    </Select>
                  </div>
                </div>

                {filteredLogs.length === 0 ? (
                  <div className="p-8">
                    <EmptyState title="NO AUDIT LOGS FOUND" description="No administrative actions match your search query." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-swiss-border bg-swiss-surface text-swiss-label uppercase tracking-widest">
                        <tr>
                          <th className="p-4">Timestamp</th>
                          <th className="p-4">Action</th>
                          <th className="p-4">Actor</th>
                          <th className="p-4">Target Resource</th>
                          <th className="p-4">IP Address</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-swiss-border text-swiss-text">
                        {filteredLogs.map((log) => {
                          const actorName = log.userName || log.actor?.name || log.actor?.email || 'System Administrator'
                          const resource = log.resource || (log.targetType ? `${log.targetType} ${log.targetId ? `#${log.targetId.slice(0, 8)}` : ''}` : 'System Resource')
                          const status = log.status || 'SUCCESS'

                          return (
                            <tr key={log.id} className="hover:bg-swiss-surface-hover transition-colors">
                              <td className="p-4 text-swiss-label whitespace-nowrap">
                                {new Date(log.timestamp || log.created_at).toLocaleString()}
                              </td>
                              <td className="p-4 font-bold text-swiss-text">{log.action}</td>
                              <td className="p-4 font-sans">{actorName}</td>
                              <td className="p-4 truncate max-w-xs">{resource}</td>
                              <td className="p-4 font-mono">{log.ipAddress || log.ip_address || '—'}</td>
                              <td className="p-4">
                                <Badge tone={status === 'SUCCESS' ? 'green' : status === 'FLAGGED' ? 'amber' : 'red'}>
                                  {status}
                                </Badge>
                              </td>
                              <td className="p-4 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setModalItem(log); setActiveModal('audit_detail'); }}
                                >
                                  VIEW
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* 1. Verification Credentials Modal */}
      <AdminModal
        isOpen={activeModal === 'verify_detail' && modalItem}
        onClose={closeModal}
        title="Applicant Graduation Credentials"
        subtitle={`Verification file for ${modalItem?.name || `${modalItem?.first_name || ''} ${modalItem?.last_name || ''}`.trim()}`}
        actions={
          <>
            <Button variant="ghost" onClick={closeModal}>CLOSE</Button>
            <Button
              variant="secondary"
              onClick={() => {
                const target = modalItem
                closeModal()
                setModalItem(target)
                setActiveModal('verify_reject')
              }}
            >
              REJECT
            </Button>
            <Button
              onClick={() => handleVerify(modalItem?.userId || modalItem?.user_id || modalItem?.id, true)}
            >
              APPROVE & VERIFY
            </Button>
          </>
        }
      >
        {modalItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-4 bg-swiss-surface border border-swiss-border rounded-sm font-mono text-xs">
              <div>
                <p className="text-swiss-label">Applicant Name:</p>
                <p className="font-bold text-swiss-text">{modalItem.name || `${modalItem.first_name || ''} ${modalItem.last_name || ''}`.trim()}</p>
              </div>
              <div>
                <p className="text-swiss-label">Email Address:</p>
                <p className="font-bold text-swiss-text">{modalItem.email}</p>
              </div>
              <div>
                <p className="text-swiss-label">Degree & Program:</p>
                <p className="font-bold text-swiss-text">{modalItem.degree || 'Bachelor of Engineering'}</p>
              </div>
              <div>
                <p className="text-swiss-label">Department / Major:</p>
                <p className="font-bold text-swiss-text">{modalItem.major || modalItem.department || 'Computer Engineering'}</p>
              </div>
              <div>
                <p className="text-swiss-label">Graduation Year:</p>
                <p className="font-bold text-swiss-text">{modalItem.graduationYear || modalItem.graduation_year || '2023'}</p>
              </div>
              <div>
                <p className="text-swiss-label">Student ID / Roll #:</p>
                <p className="font-bold text-swiss-text">{modalItem.studentIdNumber || modalItem.student_id_number || 'VIT-2019-CS-042'}</p>
              </div>
            </div>
            <div className="p-4 border border-swiss-border rounded-sm space-y-1">
              <p className="font-mono text-xs font-bold text-swiss-text uppercase">Verification Invariant Check:</p>
              <p className="text-xs text-swiss-muted">
                Approving this request permanently binds the verified alumni credential to this account, grants access to mentor listings, and marks the directory profile with the official verified badge.
              </p>
            </div>
          </div>
        )}
      </AdminModal>

      {/* 2. Verification Reject Reason Modal */}
      <AdminModal
        isOpen={activeModal === 'verify_reject' && modalItem}
        onClose={closeModal}
        title="Reject Alumni Verification"
        subtitle={`State the justification for refusing verification for ${modalItem?.name || modalItem?.email}`}
        actions={
          <>
            <Button variant="ghost" onClick={closeModal}>CANCEL</Button>
            <Button
              variant="danger"
              disabled={!modalText.trim()}
              onClick={() => handleVerify(modalItem?.userId || modalItem?.user_id || modalItem?.id, false, modalText.trim())}
            >
              CONFIRM REJECTION
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-swiss-muted">
            A clear explanation is required and will be recorded in the immutable audit log and delivered to the applicant.
          </p>
          <Field label="Rejection Reason" required>
            <textarea
              className="w-full h-24 p-2 text-xs font-mono border border-swiss-border bg-swiss-surface text-swiss-text rounded-sm focus:outline-hidden focus:border-swiss-accent"
              placeholder="e.g. Graduation year could not be reconciled with registrar records. Please upload an official degree certificate."
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
            />
          </Field>
        </div>
      </AdminModal>

      {/* 3. Job Details Modal */}
      <AdminModal
        isOpen={activeModal === 'job_detail' && modalItem}
        onClose={closeModal}
        title="Job Posting Moderation Detail"
        subtitle={`${modalItem?.title} at ${modalItem?.companyName}`}
        actions={
          <>
            <Button variant="ghost" onClick={closeModal}>CLOSE</Button>
            {(modalItem?.status || '').toUpperCase() !== 'PUBLISHED' && (
              <Button onClick={() => handleJobModerate(modalItem?.id, 'approve')}>APPROVE & PUBLISH</Button>
            )}
            {(modalItem?.status || '').toUpperCase() !== 'REJECTED' && (
              <Button
                variant="secondary"
                onClick={() => {
                  const target = modalItem
                  closeModal()
                  setModalItem(target)
                  setActiveModal('job_reject')
                }}
              >
                REJECT WITH REASON
              </Button>
            )}
          </>
        }
      >
        {modalItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-4 bg-swiss-surface border border-swiss-border rounded-sm font-mono text-xs">
              <div>
                <p className="text-swiss-label">Role Title:</p>
                <p className="font-bold text-swiss-text">{modalItem.title}</p>
              </div>
              <div>
                <p className="text-swiss-label">Company:</p>
                <p className="font-bold text-swiss-text">{modalItem.companyName}</p>
              </div>
              <div>
                <p className="text-swiss-label">Location / Mode:</p>
                <p className="font-bold text-swiss-text">{modalItem.location} ({modalItem.workMode})</p>
              </div>
              <div>
                <p className="text-swiss-label">Compensation Range:</p>
                <p className="font-bold text-swiss-text">{modalItem.salaryCurrency || '₹'} {modalItem.salaryMin?.toLocaleString()} - {modalItem.salaryMax?.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="font-mono text-xs font-bold text-swiss-label uppercase">Job Description:</p>
              <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm leading-relaxed whitespace-pre-line text-swiss-text">
                {modalItem.description}
              </div>
            </div>

            {modalItem.skills?.length > 0 && (
              <div className="space-y-1">
                <p className="font-mono text-xs font-bold text-swiss-label uppercase">Required Skills:</p>
                <div className="flex flex-wrap gap-1.5">
                  {modalItem.skills.map((s) => (
                    <Badge key={typeof s === 'string' ? s : s.name} tone="slate">
                      {typeof s === 'string' ? s : s.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* 4. Job Reject Modal */}
      <AdminModal
        isOpen={activeModal === 'job_reject' && modalItem}
        onClose={closeModal}
        title="Reject Job Posting"
        subtitle={`Specify policy infraction or rejection rationale for ${modalItem?.title}`}
        actions={
          <>
            <Button variant="ghost" onClick={closeModal}>CANCEL</Button>
            <Button
              variant="danger"
              disabled={!modalText.trim()}
              onClick={() => handleJobModerate(modalItem?.id, 'reject', modalText.trim())}
            >
              CONFIRM REJECTION
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Moderation Note / Reason" required>
            <textarea
              className="w-full h-24 p-2 text-xs font-mono border border-swiss-border bg-swiss-surface text-swiss-text rounded-sm focus:outline-hidden focus:border-swiss-accent"
              placeholder="e.g. Incomplete salary disclosure or suspicious external redirect URL."
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
            />
          </Field>
        </div>
      </AdminModal>

      {/* 5. Event Roster Modal */}
      <AdminModal
        isOpen={activeModal === 'event_roster' && modalItem}
        onClose={closeModal}
        title="Event Attendance & RSVP Roster"
        subtitle={`${modalItem?.title} · Confirmed Registrations`}
        actions={<Button variant="ghost" onClick={closeModal}>CLOSE</Button>}
      >
        {rosterLoading ? (
          <div className="p-6 text-center"><Spinner /> <span className="font-mono text-xs">Loading attendees...</span></div>
        ) : rosterData.length === 0 ? (
          <EmptyState title="NO ATTENDEES RECORDED" description="No confirmed RSVPs registered for this event." />
        ) : (
          <div className="divide-y divide-swiss-border font-mono text-xs">
            {rosterData.map((att, idx) => (
              <div key={att.id || idx} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-swiss-text">{att.userName || att.user_name || att.name || 'Registered Member'}</p>
                  <p className="text-[10px] text-swiss-label">{att.userEmail || att.email || 'Alumni Network'}</p>
                </div>
                <Badge tone={att.status === 'going' || att.status === 'GOING' ? 'green' : 'blue'}>
                  {att.status?.toUpperCase() || 'CONFIRMED'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </AdminModal>

      {/* 6. Event Cancel Modal */}
      <AdminModal
        isOpen={activeModal === 'event_cancel' && modalItem}
        onClose={closeModal}
        title="Cancel Campus Event"
        subtitle={`Cancelling ${modalItem?.title}`}
        actions={
          <>
            <Button variant="ghost" onClick={closeModal}>CLOSE</Button>
            <Button
              variant="danger"
              disabled={!modalText.trim()}
              onClick={() => handleEventCancel(modalItem?.id, modalText.trim())}
            >
              CONFIRM CANCELLATION
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-swiss-muted">
            An official cancellation notification will be dispatched to all RSVP attendees. A clear reason must be supplied.
          </p>
          <Field label="Cancellation Notice" required>
            <textarea
              className="w-full h-24 p-2 text-xs font-mono border border-swiss-border bg-swiss-surface text-swiss-text rounded-sm focus:outline-hidden focus:border-swiss-accent"
              placeholder="e.g. Campus auditorium maintenance requires rescheduling."
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
            />
          </Field>
        </div>
      </AdminModal>

      {/* 7. User Details Modal */}
      <AdminModal
        isOpen={activeModal === 'user_detail' && modalItem}
        onClose={closeModal}
        title="Account Profile Inspection"
        subtitle={`User ID: ${modalItem?.id}`}
        actions={<Button variant="ghost" onClick={closeModal}>CLOSE</Button>}
      >
        {modalItem && (
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-3 p-4 bg-swiss-surface border border-swiss-border rounded-sm">
              <div>
                <p className="text-swiss-label">Full Name:</p>
                <p className="font-bold text-swiss-text">{modalItem.full_name || modalItem.name}</p>
              </div>
              <div>
                <p className="text-swiss-label">Email Address:</p>
                <p className="font-bold text-swiss-text">{modalItem.email}</p>
              </div>
              <div>
                <p className="text-swiss-label">Primary Role:</p>
                <p className="font-bold text-swiss-text">{modalItem.roles?.join(', ') || 'USER'}</p>
              </div>
              <div>
                <p className="text-swiss-label">Account Status:</p>
                <p className="font-bold text-swiss-text">{modalItem.account_status || (modalItem.is_active ? 'ACTIVE' : 'INACTIVE')}</p>
              </div>
              <div>
                <p className="text-swiss-label">Verification State:</p>
                <p className="font-bold text-swiss-text">{modalItem.verification_status || (modalItem.verified ? 'VERIFIED' : 'UNVERIFIED')}</p>
              </div>
              <div>
                <p className="text-swiss-label">Registered Date:</p>
                <p className="font-bold text-swiss-text">{new Date(modalItem.created_at || Date.now()).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
      </AdminModal>

      {/* 8. Donation Receipt Modal */}
      <AdminModal
        isOpen={activeModal === 'donation_detail' && modalItem}
        onClose={closeModal}
        title="Official Gift & 80G Tax Exemption Receipt"
        subtitle={`Receipt: ${modalItem?.receiptNumber}`}
        actions={<Button variant="ghost" onClick={closeModal}>CLOSE</Button>}
      >
        {modalItem && (
          <div className="space-y-4 font-mono text-xs p-2">
            <div className="border border-swiss-border p-4 rounded-sm space-y-3 bg-swiss-surface">
              <div className="flex justify-between border-b border-swiss-border pb-2">
                <span className="font-bold text-swiss-text">VIDYALANKAR EDUCATIONAL TRUST</span>
                <span className="text-emerald-500 font-bold">&check; 80G COMPLIANT</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-swiss-label">Donor Name:</p>
                  <p className="font-bold text-swiss-text">{modalItem.donorName}</p>
                </div>
                <div>
                  <p className="text-swiss-label">Tax Exemption Cert #:</p>
                  <p className="font-bold text-swiss-text">{modalItem.taxExemption80G}</p>
                </div>
                <div>
                  <p className="text-swiss-label">Endowment Fund:</p>
                  <p className="font-bold text-swiss-text">{modalItem.fundName}</p>
                </div>
                <div>
                  <p className="text-swiss-label">Amount Given:</p>
                  <p className="font-bold text-emerald-600 text-sm">₹{(modalItem.amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-swiss-label">Transaction Date:</p>
                  <p className="font-bold text-swiss-text">{new Date(modalItem.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-swiss-label">Settlement Status:</p>
                  <p className="font-bold text-swiss-text">{modalItem.status || 'SUCCESS'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </AdminModal>

      {/* 9. Audit Log Detail Modal */}
      <AdminModal
        isOpen={activeModal === 'audit_detail' && modalItem}
        onClose={closeModal}
        title="Security Audit Telemetry Record"
        subtitle={`Event ID: ${modalItem?.id}`}
        actions={<Button variant="ghost" onClick={closeModal}>CLOSE</Button>}
      >
        {modalItem && (
          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 bg-swiss-surface border border-swiss-border rounded-sm space-y-1">
              <p className="text-swiss-label">Action Signature:</p>
              <p className="font-bold text-sm text-swiss-text">{modalItem.action}</p>
            </div>
            <div className="p-3 bg-swiss-surface border border-swiss-border rounded-sm space-y-1">
              <p className="text-swiss-label">Audit Metadata / Change Payload:</p>
              <pre className="p-2 bg-black/40 border border-swiss-border rounded-xs overflow-x-auto text-[11px] text-swiss-text">
                {JSON.stringify(modalItem.metadata || modalItem, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  )
}
