import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import { auth as authApi, notifications } from '../services/api.js'
import { getUserPrimaryRole } from '../utils/permissions.js'
import { ROLES } from '../utils/roles.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [sessionError, setSessionError] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const loadSession = useCallback(async () => {
    try {
      const res = await authApi.getSession()
      setUser(res.data)
      setStatus('authenticated')
    } catch (err) {
      setSessionError(err)
      setStatus('anonymous')
    }
  }, [])

  const loadUnread = useCallback(async () => {
    try {
      const res = await notifications.unreadCount()
      setUnreadCount(res.data?.count ?? 0)
    } catch {
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (status === 'authenticated' && user) {
      loadUnread()
      const timer = setInterval(loadUnread, 15000)
      return () => clearInterval(timer)
    }
  }, [status, user, loadUnread])

  const switchDemoUser = useCallback(async (userIdOrRole) => {
    try {
      const res = await authApi.switchDemoUser(userIdOrRole)
      setUser(res.data)
      setStatus('authenticated')
      setSessionError(null)
      loadUnread()
      return res.data
    } catch (err) {
      setSessionError(err)
      setStatus(user ? 'authenticated' : 'anonymous')
      return null
    }
  }, [loadUnread, user])

  const login = useCallback(async (credentials) => {
    try {
      const res = await authApi.login(credentials)
      setUser(res.data.user)
      setStatus('authenticated')
      setSessionError(null)
      loadUnread()
      return res.data.user
    } catch (err) {
      setUser(null)
      setStatus('anonymous')
      setSessionError(err)
      throw err
    }
  }, [loadUnread])

  const register = useCallback(async (payload) => {
    try {
      const res = await authApi.register(payload)
      setUser(res.data.user)
      setStatus('authenticated')
      setSessionError(null)
      loadUnread()
      return res.data.user
    } catch (err) {
      setUser(null)
      setStatus('anonymous')
      setSessionError(err)
      throw err
    }
  }, [loadUnread])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setUnreadCount(0)
      setStatus('anonymous')
      setSessionError(null)
    }
  }, [])

  const primaryRole = useMemo(() => getUserPrimaryRole(user), [user])
  const isStaff = primaryRole === ROLES.ADMIN

  const value = useMemo(() => ({
    user,
    role: primaryRole,
    status,
    sessionError,
    unreadCount,
    refreshUnreadCount: loadUnread,
    isAuthenticated: status === 'authenticated' && Boolean(user),
    isLoading: status === 'loading',
    isStaff,
    switchDemoUser,
    login,
    register,
    logout,
    refreshUser: loadSession,
  }), [user, primaryRole, status, sessionError, unreadCount, loadUnread, isStaff, switchDemoUser, login, register, logout, loadSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
