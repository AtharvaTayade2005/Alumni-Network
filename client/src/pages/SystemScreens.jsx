import { Link, useLocation } from 'react-router-dom'
import { Card, Button, Badge } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { ROLES } from '../utils/roles.js'

export function Forbidden() {
  const { role, switchDemoUser } = useAuth()
  const location = useLocation()
  const attempted = location.state?.attempted || 'this page'

  return (
    <Card className="mx-auto max-w-lg mt-12 border-2 border-red-500/40">
      <div className="px-6 py-12 text-center space-y-4">
        <p className="font-mono text-[10px] tracking-widest text-red-500 uppercase">
          SECURITY PROTOCOL &mdash; 403 FORBIDDEN
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-swiss-text">Access Denied</h1>
        <p className="text-sm text-swiss-muted leading-relaxed">
          Your current active role (<span className="font-mono font-bold text-swiss-text">{role}</span>) does not have authorization to view <span className="font-mono text-xs text-swiss-text bg-swiss-surface px-1 py-0.5 rounded-xs">{attempted}</span>.
        </p>

        <div className="pt-4 border-t border-swiss-border space-y-3">
          <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest">
            SIMULATION SHORTCUT: SWITCH ROLE
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => switchDemoUser(ROLES.ADMIN)}>
              SWITCH TO ADMIN
            </Button>
            <Button size="sm" variant="secondary" onClick={() => switchDemoUser(ROLES.PROFESSOR)}>
              SWITCH TO PROFESSOR
            </Button>
            <Button size="sm" variant="secondary" onClick={() => switchDemoUser(ROLES.ALUMNI)}>
              SWITCH TO ALUMNI
            </Button>
            <Button size="sm" variant="secondary" onClick={() => switchDemoUser(ROLES.STUDENT)}>
              SWITCH TO STUDENT
            </Button>
          </div>
        </div>

        <div className="pt-4 flex justify-center gap-2">
          <Link to="/"><Button variant="secondary">Go Home</Button></Link>
          <Link to="/dashboard"><Button>Go to Dashboard →</Button></Link>
        </div>
      </div>
    </Card>
  )
}

export function Unauthorized() {
  return (
    <Card className="mx-auto max-w-lg mt-12">
      <div className="px-6 py-12 text-center">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">ERROR 401</p>
        <p className="text-4xl font-bold tracking-tight text-swiss-text">Unauthorized</p>
        <p className="mt-4 text-sm text-swiss-muted">
          Please log in to access this feature.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/login"><Button>Log In →</Button></Link>
        </div>
      </div>
    </Card>
  )
}

export function ServerError() {
  return (
    <Card className="mx-auto max-w-lg mt-12">
      <div className="px-6 py-12 text-center">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">ERROR 500</p>
        <p className="text-4xl font-bold tracking-tight text-swiss-text">Server Error</p>
        <p className="mt-4 text-sm text-swiss-muted">
          Something went wrong on our end. We're looking into it. Please try again later.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      </div>
    </Card>
  )
}

export function Offline() {
  return (
    <Card className="mx-auto max-w-lg mt-12 border-orange-500/30">
      <div className="px-6 py-12 text-center">
        <p className="font-mono text-[10px] tracking-widest text-orange-500 uppercase mb-2">NETWORK OFFLINE</p>
        <p className="text-4xl font-bold tracking-tight text-swiss-text">No Connection</p>
        <p className="mt-4 text-sm text-swiss-muted">
          You appear to be offline. Please check your internet connection and try again.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Retry Connection</Button>
        </div>
      </div>
    </Card>
  )
}

export function Maintenance() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-swiss-base text-swiss-text p-4">
      <Card className="max-w-lg w-full">
        <div className="px-6 py-12 text-center">
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">SYSTEM UPDATE</p>
          <p className="text-4xl font-bold tracking-tight text-swiss-text">Scheduled Maintenance</p>
          <p className="mt-4 text-sm text-swiss-muted">
            The Alumni Network is currently undergoing scheduled maintenance to improve performance and add new features. We will be back online shortly.
          </p>
        </div>
      </Card>
    </div>
  )
}
