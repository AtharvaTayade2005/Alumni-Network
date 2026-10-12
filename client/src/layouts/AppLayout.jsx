import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Avatar, Button, cx } from '../components/ui.jsx'
import RoleSwitcher from '../components/RoleSwitcher.jsx'
import { getCategorizedNavigation } from '../utils/permissions.js'
import { ROLE_LABELS, ROLE_BADGE_TONES } from '../utils/roles.js'

function ChevronDownIcon({ className }) {
  return (
    <svg className={cx('w-3.5 h-3.5 transition-transform duration-150', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg className={cx('w-4 h-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function ChatIcon({ className }) {
  return (
    <svg className={cx('w-4 h-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
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

function SignOutIcon({ className }) {
  return (
    <svg className={cx('w-4 h-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

// Accessible Dropdown Menu for Nav Categories
function CategoryDropdown({ category, currentPath, openId, setOpenId }) {
  const isOpen = openId === category.id
  const dropdownRef = useRef(null)

  // Check if any link in this category is currently active
  const isCategoryActive = category.items?.some((item) => {
    if (item.to === '/') return currentPath === '/'
    return currentPath === item.to || currentPath.startsWith(item.to + '/')
  })

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpenId(null)
    }

    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, setOpenId])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpenId(isOpen ? null : category.id)}
        aria-expanded={isOpen}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors',
          isOpen || isCategoryActive
            ? 'bg-swiss-text text-swiss-base font-bold shadow-xs'
            : 'text-swiss-muted hover:bg-swiss-surface-hover hover:text-swiss-text'
        )}
      >
        <span>{category.label}</span>
        {category.badge && (
          <span className={cx(
            'px-1 py-0.2 text-[9px] font-mono font-black tracking-widest rounded-xs',
            isOpen || isCategoryActive
              ? 'bg-swiss-base text-swiss-text'
              : 'bg-swiss-accent text-white'
          )}>
            {category.badge}
          </span>
        )}
        <ChevronDownIcon className={isOpen ? 'rotate-180' : ''} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-64 rounded-sm border border-swiss-border bg-swiss-surface p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 border-b border-swiss-border mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-label font-bold">
              {category.label} {category.badge ? `[${category.badge}]` : ''}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {category.items.map((item) => {
              const isActive = currentPath === item.to || currentPath.startsWith(item.to + '/')
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpenId(null)}
                  role="menuitem"
                  className={cx(
                    'group flex flex-col rounded-sm px-2.5 py-2 transition-colors',
                    isActive
                      ? 'bg-swiss-text text-swiss-base'
                      : 'hover:bg-swiss-surface-hover text-swiss-text'
                  )}
                >
                  <span className={cx(
                    'text-xs font-medium font-mono uppercase tracking-wider',
                    isActive ? 'font-bold text-swiss-base' : 'text-swiss-text group-hover:text-swiss-text'
                  )}>
                    {item.label}
                  </span>
                  {item.desc && (
                    <span className={cx(
                      'text-[10px] mt-0.5 leading-tight',
                      isActive ? 'text-swiss-base/80' : 'text-swiss-muted'
                    )}>
                      {item.desc}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Accessible User Profile Popover
function UserProfilePopover({ user, role, onSignOut, signingOut }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false)
    }

    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
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

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="User account menu"
        className={cx(
          'flex items-center gap-2 rounded-sm p-1 border transition-colors',
          isOpen
            ? 'border-swiss-text bg-swiss-surface-hover shadow-xs'
            : 'border-transparent hover:border-swiss-border hover:bg-swiss-surface-hover'
        )}
      >
        <Avatar name={user?.name} src={user?.avatarUrl} size="sm" />
        <span className="hidden xl:inline text-xs font-semibold max-w-[100px] truncate text-swiss-text">
          {user?.name}
        </span>
        <ChevronDownIcon className={cx('hidden xl:block text-swiss-muted', isOpen ? 'rotate-180' : '')} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-sm border border-swiss-border bg-swiss-surface p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* User Header */}
          <div className="flex items-center gap-3 px-2 py-2 border-b border-swiss-border mb-2">
            <Avatar name={user?.name} src={user?.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-swiss-text truncate leading-tight">
                {user?.name}
              </p>
              <p className="text-[10px] text-swiss-muted truncate mt-0.5">
                {user?.email}
              </p>
              <div className="mt-1 inline-flex items-center px-1.5 py-0.2 rounded-xs border border-swiss-border text-[9px] font-mono uppercase font-bold tracking-wider text-swiss-text bg-swiss-surface-alt">
                {ROLE_LABELS[role] || role}
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-0.5">
            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-swiss-text hover:bg-swiss-surface-hover transition-colors"
            >
              My Profile
            </Link>
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-swiss-text hover:bg-swiss-surface-hover transition-colors"
            >
              Account Settings
            </Link>
            {role === 'ADMIN' && (
              <Link
                to="/admin/audit-logs"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-swiss-muted hover:text-swiss-text hover:bg-swiss-surface-hover transition-colors"
              >
                System Audit Logs
              </Link>
            )}
          </div>

          {/* Sign Out */}
          <div className="mt-2 pt-2 border-t border-swiss-border">
            <button
              type="button"
              disabled={signingOut}
              onClick={() => {
                setIsOpen(false)
                onSignOut()
              }}
              className="w-full flex items-center justify-between rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-red-500 hover:bg-red-950/20 hover:text-red-400 transition-colors"
            >
              <span>{signingOut ? 'Signing out...' : 'Sign out'}</span>
              <SignOutIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Mobile Slide-Over Drawer
function MobileDrawer({ isOpen, onClose, navCategories, user, role, unreadCount, onSignOut, signingOut, isAuthenticated }) {
  const [expandedGroups, setExpandedGroups] = useState({
    explore: true,
    opportunities: true,
    campus: false,
    ai: true,
    admin: true,
  })

  function toggleGroup(id) {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (!isOpen) return null

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="relative ml-auto w-80 max-w-[85vw] h-full bg-swiss-surface border-l border-swiss-border shadow-2xl flex flex-col z-10 overflow-y-auto">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-swiss-border">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-black tracking-widest bg-swiss-text text-swiss-base px-1.5 py-0.5 rounded-xs">
              VIT
            </span>
            <span className="text-xs font-bold tracking-tight uppercase">
              ALUMNI PORTAL
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-swiss-muted hover:text-swiss-text rounded-sm hover:bg-swiss-surface-hover"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* User Card in Mobile Drawer */}
        {isAuthenticated ? (
          <div className="p-4 border-b border-swiss-border bg-swiss-surface-alt/50">
            <div className="flex items-center gap-3">
              <Avatar name={user?.name} src={user?.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate text-swiss-text">{user?.name}</p>
                <p className="text-xs text-swiss-muted truncate">{user?.email}</p>
                <span className="mt-1 inline-block px-1.5 py-0.2 rounded-xs border border-swiss-border text-[9px] font-mono uppercase font-bold text-swiss-text bg-swiss-surface">
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
            </div>
            {/* Quick utility links */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-xs">
              <Link
                to="/messages"
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 py-1.5 border border-swiss-border rounded-sm hover:bg-swiss-surface-hover"
              >
                <ChatIcon />
                <span>Messages</span>
              </Link>
              <Link
                to="/notifications"
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 py-1.5 border border-swiss-border rounded-sm hover:bg-swiss-surface-hover relative"
              >
                <BellIcon />
                <span>Alerts</span>
                {unreadCount > 0 && (
                  <span className="bg-swiss-accent text-white text-[9px] px-1 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        ) : null}

        {/* Categorized Navigation Accordion */}
        <div className="flex-1 p-4 space-y-2">
          {isAuthenticated ? (
            navCategories.map((entry) => {
              if (entry.type === 'link') {
                return (
                  <NavLink
                    key={entry.id}
                    to={entry.to}
                    end={entry.end}
                    onClick={onClose}
                    className={({ isActive }) => cx(
                      'block rounded-sm px-3 py-2 text-xs font-mono uppercase tracking-wider border transition-colors',
                      isActive
                        ? 'bg-swiss-text text-swiss-base border-swiss-text font-bold'
                        : 'border-swiss-border hover:bg-swiss-surface-hover text-swiss-text'
                    )}
                  >
                    {entry.label}
                  </NavLink>
                )
              }

              const isExpanded = expandedGroups[entry.id] ?? true
              return (
                <div key={entry.id} className="border border-swiss-border rounded-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.id)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-swiss-surface hover:bg-swiss-surface-hover text-xs font-mono uppercase tracking-wider text-swiss-text font-semibold"
                  >
                    <div className="flex items-center gap-2">
                      <span>{entry.label}</span>
                      {entry.badge && (
                        <span className="bg-swiss-accent text-white px-1 py-0.2 text-[9px] rounded-xs font-bold">
                          {entry.badge}
                        </span>
                      )}
                    </div>
                    <ChevronDownIcon className={isExpanded ? 'rotate-180' : ''} />
                  </button>

                  {isExpanded && (
                    <div className="p-1 bg-swiss-surface-alt/30 border-t border-swiss-border flex flex-col gap-0.5">
                      {entry.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={onClose}
                          className={({ isActive }) => cx(
                            'block rounded-sm px-2.5 py-1.5 text-xs font-mono transition-colors',
                            isActive
                              ? 'bg-swiss-text text-swiss-base font-bold'
                              : 'text-swiss-muted hover:text-swiss-text hover:bg-swiss-surface-hover'
                          )}
                        >
                          <div className="uppercase tracking-wider">{item.label}</div>
                          {item.desc && (
                            <div className="text-[10px] opacity-75 capitalize tracking-normal">{item.desc}</div>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="space-y-2">
              <Link
                to="/"
                onClick={onClose}
                className="block rounded-sm px-3 py-2 text-xs font-mono uppercase tracking-wider border border-swiss-border hover:bg-swiss-surface-hover text-swiss-text"
              >
                Home
              </Link>
            </div>
          )}
        </div>

        {/* Drawer Footer / Actions */}
        <div className="p-4 border-t border-swiss-border bg-swiss-surface space-y-2">
          {isAuthenticated ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <Link
                  to="/profile"
                  onClick={onClose}
                  className="py-1.5 text-center border border-swiss-border rounded-sm hover:bg-swiss-surface-hover text-swiss-text uppercase"
                >
                  Profile
                </Link>
                <Link
                  to="/settings"
                  onClick={onClose}
                  className="py-1.5 text-center border border-swiss-border rounded-sm hover:bg-swiss-surface-hover text-swiss-text uppercase"
                >
                  Settings
                </Link>
              </div>
              <Button
                variant="danger"
                className="w-full justify-center font-mono text-xs uppercase"
                disabled={signingOut}
                onClick={() => {
                  onClose()
                  onSignOut()
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Link to="/login" onClick={onClose} className="w-full">
                <Button variant="secondary" className="w-full justify-center font-mono text-xs uppercase">Sign in</Button>
              </Link>
              <Link to="/register" onClick={onClose} className="w-full">
                <Button className="w-full justify-center font-mono text-xs uppercase">Join Network</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { isAuthenticated, user, role, logout, unreadCount } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState(null)
  const isHome = location.pathname === '/'

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setActiveDropdown(null)
  }, [location.pathname])

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    setSigningOut(false)
    navigate('/')
  }

  const navCategories = isAuthenticated ? getCategorizedNavigation(role, user) : []

  return (
    <div className="flex min-h-screen flex-col bg-swiss-base text-swiss-text">
      {/* Floating Role Switcher Pill in Bottom-Right Corner (Replaces bulky top bar) */}
      <RoleSwitcher />

      {/* Main Top Header - Fixed 64px (h-16), 3-Zone Architecture */}
      <header className="sticky top-0 z-40 h-16 border-b border-swiss-border bg-swiss-surface/95 backdrop-blur-xs">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4">
          
          {/* Zone 1 (Left): Branding & Quick Context */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="font-mono text-xs font-black tracking-widest bg-swiss-text text-swiss-base px-1.5 py-0.5 rounded-xs transition-transform group-hover:scale-105">
                VIT
              </span>
              <span className="text-sm font-bold tracking-tight text-swiss-text whitespace-nowrap">
                ALUMNI PORTAL
              </span>
            </Link>

            {isAuthenticated && (
              <>
                <span className="text-swiss-border text-sm font-light select-none">|</span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-xs border border-swiss-border text-swiss-muted bg-swiss-surface-alt">
                  {ROLE_LABELS[role] || role}
                </span>
              </>
            )}
          </div>

          {/* Zone 2 (Center): Primary Categorized Navigation (Max 4-5 items, strictly no wrapping) */}
          <nav className="hidden lg:flex items-center gap-1.5">
            {isAuthenticated ? (
              navCategories.map((entry) => {
                if (entry.type === 'link') {
                  const isActive = entry.to === '/'
                    ? location.pathname === '/'
                    : location.pathname === entry.to || location.pathname.startsWith(entry.to + '/')
                  return (
                    <NavLink
                      key={entry.id}
                      to={entry.to}
                      end={entry.end}
                      className={cx(
                        'rounded-sm px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors',
                        isActive
                          ? 'bg-swiss-text text-swiss-base font-bold shadow-xs'
                          : 'text-swiss-muted hover:bg-swiss-surface-hover hover:text-swiss-text'
                      )}
                    >
                      {entry.label}
                    </NavLink>
                  )
                }

                return (
                  <CategoryDropdown
                    key={entry.id}
                    category={entry}
                    currentPath={location.pathname}
                    openId={activeDropdown}
                    setOpenId={setActiveDropdown}
                  />
                )
              })
            ) : null}
          </nav>

          {/* Zone 3 (Right): Actions & User Menu */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                {/* Messages Icon Button */}
                <NavLink
                  to="/messages"
                  title="Messages"
                  className={({ isActive }) => cx(
                    'p-2 rounded-sm border transition-colors relative',
                    isActive
                      ? 'bg-swiss-text text-swiss-base border-swiss-text'
                      : 'border-swiss-border text-swiss-muted hover:text-swiss-text hover:bg-swiss-surface-hover'
                  )}
                >
                  <ChatIcon />
                </NavLink>

                {/* Notifications Icon Button with Counter Badge */}
                <NavLink
                  to="/notifications"
                  title="Notifications"
                  className={({ isActive }) => cx(
                    'p-2 rounded-sm border transition-colors relative',
                    isActive
                      ? 'bg-swiss-text text-swiss-base border-swiss-text'
                      : 'border-swiss-border text-swiss-muted hover:text-swiss-text hover:bg-swiss-surface-hover'
                  )}
                >
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-swiss-accent px-1 text-[9px] font-mono font-bold text-white shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </NavLink>

                {/* Subtle Divider */}
                <span className="hidden sm:inline text-swiss-border select-none">|</span>

                {/* Unified User Profile Popover */}
                <UserProfilePopover
                  user={user}
                  role={role}
                  onSignOut={handleLogout}
                  signingOut={signingOut}
                />
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="font-mono text-xs uppercase">Sign in</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" className="font-mono text-xs uppercase">Join Network</Button>
                </Link>
              </div>
            )}

            {/* Mobile / Tablet Drawer Toggle Button (<1024px) */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-sm border border-swiss-border text-swiss-text hover:bg-swiss-surface-hover transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation drawer"
            >
              <MenuIcon isOpen={mobileMenuOpen} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Component */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navCategories={navCategories}
        user={user}
        role={role}
        unreadCount={unreadCount}
        onSignOut={handleLogout}
        signingOut={signingOut}
        isAuthenticated={isAuthenticated}
      />

      {/* Main Content Viewport */}
      <main className={cx("mx-auto w-full max-w-6xl flex-1", !isHome && "px-4 py-8")}>
        <Outlet />
      </main>

      {/* Institutional Footer */}
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
