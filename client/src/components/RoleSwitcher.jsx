import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ROLES, ROLE_LABELS, ROLE_BADGE_TONES } from '../utils/roles.js'
import { Badge, cx } from './ui.jsx'

export default function RoleSwitcher() {
  const { user, role, switchDemoUser } = useAuth()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  const roles = [
    { id: ROLES.STUDENT, label: 'STUDENT', desc: 'Riya Shah (3rd Year CSE)' },
    { id: ROLES.ALUMNI, label: 'ALUMNI', desc: 'Aarav Mehta (Sr. SWE, Microsoft)' },
    { id: ROLES.PROFESSOR, label: 'PROFESSOR', desc: 'Dr. Rajesh Kulkarni (HOD, CSE)' },
    { id: ROLES.ADMIN, label: 'ADMIN', desc: 'Vikramaditya S. (System Admin)' },
  ]

  async function handleSwitch(roleId) {
    if (switching) return
    setSwitching(true)
    await switchDemoUser(roleId)
    setSwitching(false)

    // Redirect to default dashboard for the switched role
    if (roleId === ROLES.ADMIN) {
      navigate('/admin/dashboard')
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="border-b border-swiss-border bg-swiss-surface text-swiss-text text-xs">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase tracking-wider text-swiss-label">
            DEMO ROLE SIMULATION:
          </span>
          <span className="font-semibold text-swiss-text">{user?.name || 'Guest'}</span>
          <Badge tone={ROLE_BADGE_TONES[role] || 'slate'}>
            {ROLE_LABELS[role] || role}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <span className="hidden sm:inline text-[10px] text-swiss-label uppercase tracking-widest mr-1">
            SWITCH ROLE:
          </span>
          {roles.map((r) => {
            const isActive = role === r.id
            return (
              <button
                key={r.id}
                type="button"
                disabled={switching}
                onClick={() => handleSwitch(r.id)}
                className={cx(
                  'rounded-sm px-2 py-1 text-[10px] uppercase font-mono tracking-wider transition-colors border',
                  isActive
                    ? 'bg-swiss-text text-swiss-base border-swiss-text font-bold shadow-xs'
                    : 'bg-transparent text-swiss-muted border-swiss-border hover:bg-swiss-surface-hover hover:text-swiss-text',
                  switching && 'opacity-50 cursor-not-allowed'
                )}
                title={r.desc}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
