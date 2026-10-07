import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Button, cx } from '../components/ui.jsx'
import RoleSwitcher from '../components/RoleSwitcher.jsx'
import { getRoleNavigation } from '../utils/permissions.js'
import { ROLES, ROLE_LABELS } from '../utils/roles.js'

function navClass({ isActive }) {
  return cx(
    'block rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors font-mono uppercase tracking-wider',
    isActive
      ? 'bg-swiss-text text-swiss-base font-semibold'
      : 'text-swiss-muted hover:bg-swiss-surface-hover hover:text-swiss-text',
  )
}

function MenuIcon({ isOpen }) {
  return (
    <svg className="w-5 h-5 text-swiss-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {isOpen ? (
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  )
}

export default function AppLayout() {
  const { isAuthenticated, user, role, logout, unreadCount } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isHome = location.pathname === '/'

  const links = isAuthenticated ? getRoleNavigation(role) : [{ to: '/', label: 'Home', end: true }]

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    setSigningOut(false)
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-swiss-base text-swiss-text">
      {/* Demo Role Switcher Toolbar */}
      <RoleSwitcher />

      <header className="sticky top-0 z-40 border-b border-swiss-border bg-swiss-surface/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="shrink-0 flex items-center gap-2">
            <span className="font-mono text-xs font-black tracking-widest bg-swiss-text text-swiss-base px-1.5 py-0.5 rounded-xs">
              VIT
            </span>
            <span className="text-sm sm:text-base font-bold tracking-tight">
              ALUMNI PORTAL
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex flex-1 flex-wrap justify-end items-center gap-1 ml-4 mr-2">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end ?? false} className={navClass}>
                {link.label}
                {link.badge && unreadCount > 0 ? (
                  <span className="ml-1 rounded-sm bg-swiss-accent px-1.5 py-0.2 text-[9px] font-mono font-bold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="hidden lg:flex shrink-0 items-center gap-2 pl-2 border-l border-swiss-border">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-swiss-surface-hover transition-colors"
                  title={`${user?.name} (${ROLE_LABELS[role] || role})`}
                >
                  <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
                  <div className="text-left hidden xl:block">
                    <p className="text-xs font-semibold leading-tight truncate max-w-[110px]">
                      {user?.name}
                    </p>
                    <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest leading-none mt-0.5">
                      {ROLE_LABELS[role] || role}
                    </p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={signingOut}
                  onClick={handleLogout}
                  className="font-mono text-xs uppercase"
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="hidden lg:flex shrink-0 items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Join</Button>
                </Link>
              </div>
            )}

            {/* Mobile / Tablet Menu Toggle */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-sm border border-swiss-border hover:bg-swiss-surface-hover transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation"
            >
              <MenuIcon isOpen={mobileMenuOpen} />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen ? (
          <div className="lg:hidden border-t border-swiss-border bg-swiss-surface px-4 py-4 space-y-3 shadow-lg">
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end ?? false} className={navClass}>
                  <div className="flex items-center justify-between">
                    <span>{link.label}</span>
                    {link.badge && unreadCount > 0 ? (
                      <span className="rounded-sm bg-swiss-accent px-1.5 py-0.2 text-[9px] font-mono font-bold text-white">
                        {unreadCount} NEW
                      </span>
                    ) : null}
                  </div>
                </NavLink>
              ))}
            </nav>
            {isAuthenticated ? (
              <div className="mt-4 pt-4 border-t border-swiss-border flex flex-col gap-2">
                <Link
                  to="/profile"
                  className="flex items-center gap-3 rounded-sm px-3 py-2 hover:bg-swiss-surface-hover"
                >
                  <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
                  <div>
                    <span className="text-sm font-medium block">{user?.name}</span>
                    <span className="text-xs font-mono text-swiss-label uppercase">
                      {ROLE_LABELS[role] || role} · {user?.email}
                    </span>
                  </div>
                </Link>
                <Button
                  variant="secondary"
                  className="justify-center w-full font-mono text-xs uppercase"
                  disabled={signingOut}
                  onClick={handleLogout}
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="mt-4 pt-4 border-t border-swiss-border flex flex-col gap-2">
                <Link to="/login" className="w-full">
                  <Button variant="ghost" className="w-full justify-start">Sign in</Button>
                </Link>
                <Link to="/register" className="w-full">
                  <Button className="w-full justify-start">Join Network</Button>
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </header>

      <main className={cx("mx-auto w-full max-w-6xl flex-1", !isHome && "px-4 py-8")}>
        <Outlet />
      </main>

      {!isHome && (
        <footer className="border-t border-swiss-border bg-swiss-base mt-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] uppercase font-mono tracking-widest text-swiss-label">
            <div>
              Alumni Network Portal &mdash; Unified Role-Based Platform System.
            </div>
            <div className="flex items-center gap-4">
              <span>Status: Frontend Active</span>
              <span>·</span>
              <span>Institution: Vidyalankar Institute of Technology</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
