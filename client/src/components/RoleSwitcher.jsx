import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ROLES, ROLE_LABELS } from '../utils/roles.js'
import { cx } from './ui.jsx'

export default function RoleSwitcher() {
  const { user, role, switchDemoUser } = useAuth()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const roles = [
    { id: ROLES.STUDENT, label: 'STUDENT', desc: 'Riya Shah (3rd Year CSE)' },
    { id: ROLES.ALUMNI, label: 'ALUMNI', desc: 'Aarav Mehta (Sr. SWE, Microsoft)' },
    { id: ROLES.PROFESSOR, label: 'PROFESSOR', desc: 'Dr. Rajesh Kulkarni (HOD, CSE)' },
    { id: ROLES.ADMIN, label: 'ADMIN', desc: 'Vikramaditya S. (System Admin)' },
  ]

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  async function handleSwitch(roleId) {
    if (switching || roleId === role) {
      setIsOpen(false)
      return
    }
    setSwitching(true)
    await switchDemoUser(roleId)
    setSwitching(false)
    setIsOpen(false)

    // Redirect to default dashboard for the switched role
    if (roleId === ROLES.ADMIN) {
      navigate('/admin/dashboard')
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div ref={containerRef} className="fixed bottom-4 right-4 z-50 font-mono text-xs select-none">
      {isOpen ? (
        <div className="rounded-sm border border-swiss-border bg-swiss-surface/95 backdrop-blur-md p-3 shadow-2xl flex flex-col gap-2.5 min-w-[290px] animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between gap-2 border-b border-swiss-border pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-swiss-label font-bold">
                DEV ROLE SIMULATOR
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-swiss-muted hover:text-swiss-text text-xs p-1"
              aria-label="Close role simulator"
            >
              ✕
            </button>
          </div>

          <div className="text-[11px] text-swiss-muted leading-tight">
            Current: <strong className="text-swiss-text font-semibold">{user?.name || 'Guest'}</strong> ({ROLE_LABELS[role] || role})
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {roles.map((r) => {
              const isActive = role === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={switching}
                  onClick={() => handleSwitch(r.id)}
                  className={cx(
                    'rounded-xs px-2.5 py-2 text-left border transition-all flex flex-col justify-between',
                    isActive
                      ? 'bg-swiss-text text-swiss-base border-swiss-text font-bold shadow-xs'
                      : 'border-swiss-border hover:bg-swiss-surface-hover text-swiss-muted hover:text-swiss-text bg-swiss-surface-alt/40',
                    switching && 'opacity-50 cursor-not-allowed'
                  )}
                  title={r.desc}
                >
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold">
                    {r.label}
                  </span>
                  <span className={cx(
                    'text-[9px] mt-0.5 truncate tracking-normal',
                    isActive ? 'text-swiss-base/80' : 'text-swiss-label'
                  )}>
                    {r.desc.split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full border border-swiss-border bg-swiss-surface/95 backdrop-blur-md px-3 py-1.5 shadow-lg hover:border-swiss-text hover:bg-swiss-surface-hover transition-all text-swiss-text group"
          title="Switch Demo User Role"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-swiss-label">DEV:</span>
          <span className="text-[10px] uppercase font-bold text-swiss-text">
            {ROLE_LABELS[role] || role}
          </span>
          <span className="text-[10px] text-swiss-muted group-hover:text-swiss-text ml-0.5">⇄</span>
        </button>
      )}
    </div>
  )
}
