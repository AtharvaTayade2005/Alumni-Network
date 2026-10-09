import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { oauth } from '../services/api.js'
import {
  Alert, Badge, Button, Card, Field, FieldErrorSummary, Input, Spinner,
} from '../components/ui.jsx'

const PROVIDER_ERRORS = {
  access_denied: 'Sign-in was cancelled.',
  no_google_account: 'No Google account matched an existing member.',
  no_linkedin_account: 'No LinkedIn account matched an existing member.',
  no_sso_account: 'No university account matched an existing member.',
  server_error: 'The provider could not complete sign-in. Please try again.',
}

const DEMO_PERSONAS = [
  { role: 'ADMIN', name: 'Portal Admin', email: 'admin.demo@alumniportal.test', tone: 'amber' },
  { role: 'ALUMNI', name: 'Aarav Mehta', email: 'alumni.demo@alumniportal.test', tone: 'green' },
  { role: 'STUDENT', name: 'Atharva Patil', email: 'student.demo@alumniportal.test', tone: 'blue' },
  { role: 'PROFESSOR', name: 'Dr. Rajesh Kulkarni', email: 'prof.kulkarni@alumniportal.test', tone: 'purple' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState([])

  const redirectTo = location.state?.from ?? '/dashboard'

  // Only configured providers are offered, so nobody clicks a dead button.
  useEffect(() => {
    let active = true
    oauth.providers()
      .then((res) => {
        if (active) setProviders(res.data?.providers || [])
      })
      .catch(() => {
        if (active) setProviders([])
      })
    return () => { active = false }
  }, [])

  // The provider redirects back with a failure query param rather than JSON.
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('oauth_error')
    if (code) setError(new Error(PROVIDER_ERRORS[code] ?? 'Provider sign-in failed.'))
  }, [location.search])

  function update(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  function fillDemoAccount(demo) {
    setForm({
      email: demo.email,
      password: 'Demo@Portal2026!',
    })
    setError(null)
  }

  function getReadableErrorMessage(err) {
    if (!err) return null
    if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
      return 'Invalid email or password. Please verify your credentials and try again.'
    }
    if (err.status === 503 || err.message?.toLowerCase().includes('database unavailable')) {
      return 'Database service is temporarily unavailable. Please verify the PostgreSQL or PGlite server is running.'
    }
    if (err.status === 408 || err.code === 'REQUEST_TIMEOUT') {
      return 'Sign-in request timed out. Please check your network and try again.'
    }
    if (err.code === 'NETWORK_ERROR' || err.status === 0) {
      return 'Cannot reach the backend API at http://localhost:5000. Ensure the backend server is active.'
    }
    if (err.status === 429) {
      return 'Too many sign-in attempts. Please wait a few moments before retrying.'
    }
    return err.message || 'An unexpected error occurred during sign in.'
  }

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)

    if (!form.email.trim() || !form.password) {
      setError(new Error('Please enter both your email address and password.'))
      return
    }

    setSubmitting(true)
    try {
      await login(form)
      navigate(redirectTo, { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="p-8">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">AUTH &mdash; 01</p>
        <h1 className="text-2xl font-bold tracking-tight text-swiss-text">SIGN IN</h1>
        <p className="mt-2 text-sm text-swiss-muted leading-relaxed">
          Welcome back. Sign in to reach your alumni network.
        </p>

        {/* Development / Demo Quick Login Panel (PART 3) */}
        {!import.meta.env.PROD && (
          <div className="mt-6 p-4 rounded-sm border border-swiss-border bg-swiss-surface-alt">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] tracking-widest uppercase text-swiss-label font-semibold">
                DEMO QUICK SIGN-IN
              </span>
              <span className="font-mono text-[9px] text-swiss-label">Demo@Portal2026!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {DEMO_PERSONAS.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  onClick={() => fillDemoAccount(demo)}
                  className="flex flex-col text-left p-2 rounded-sm border border-swiss-border bg-swiss-surface hover:border-swiss-accent transition-colors"
                >
                  <div className="flex items-center justify-between w-full">
                    <Badge tone={demo.tone}>{demo.role}</Badge>
                    <span className="text-[10px] font-mono text-swiss-label">Auto-fill</span>
                  </div>
                  <span className="text-xs font-medium text-swiss-text mt-1.5 truncate">{demo.name}</span>
                  <span className="text-[10px] text-swiss-label truncate">{demo.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
          {error && !Object.keys(error?.fields ?? {}).length ? (
            <Alert tone="error">{getReadableErrorMessage(error)}</Alert>
          ) : (
            <FieldErrorSummary error={error} />
          )}

          <Field label="Email address" required>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.edu"
              invalid={Boolean(error?.fields?.email)}
              disabled={submitting}
            />
          </Field>

          <Field
            label="Password"
            required
            hint={
              <Link
                to="/forgot-password"
                className="text-xs font-mono text-swiss-label hover:text-swiss-text underline"
              >
                Forgot password?
              </Link>
            }
          >
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={update('password')}
              invalid={Boolean(error?.fields?.password)}
              disabled={submitting}
            />
          </Field>

          <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="border-white/40 border-t-white" /> SIGNING IN...
              </>
            ) : (
              'SIGN IN →'
            )}
          </Button>
        </form>

        {providers.length ? (
          <div className="mt-8">
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-swiss-label">
              <span className="h-px flex-1 bg-swiss-border" />
              or continue with
              <span className="h-px flex-1 bg-swiss-border" />
            </div>
            <div className="mt-5 grid gap-3">
              {providers.map((provider) => (
                <Button
                  key={provider.provider}
                  type="button"
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => {
                    window.location.assign(
                      oauth.startUrl(provider.provider, { redirectTo }),
                    )
                  }}
                >
                  {provider.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 border-t border-swiss-border pt-6 flex items-center justify-between text-xs">
          <p className="text-sm text-swiss-muted">
            No account yet?{' '}
            <Link to="/register" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
              CREATE ONE →
            </Link>
          </p>
          <Link to="/verify-email" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
            VERIFY EMAIL →
          </Link>
        </div>
      </Card>
    </div>
  )
}
