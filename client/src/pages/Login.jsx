import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { oauth } from '../services/api.js'
import {
  Alert, Button, Card, Field, FieldErrorSummary, Input, Spinner,
} from '../components/ui.jsx'

const PROVIDER_ERRORS = {
  access_denied: 'Sign-in was cancelled.',
  no_google_account: 'No Google account matched an existing member.',
  no_linkedin_account: 'No LinkedIn account matched an existing member.',
  no_sso_account: 'No university account matched an existing member.',
  server_error: 'The provider could not complete sign-in. Please try again.',
}

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
        if (active) setProviders(res.data.providers)
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

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)
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
          Welcome back. Sign in to reach your network.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          <FieldErrorSummary error={error} />

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
            />
          </Field>

          <Field label="Password" required>
            <Input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={update('password')}
              invalid={Boolean(error?.fields?.password)}
            />
          </Field>

          <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
            {submitting ? <><Spinner className="border-white/40 border-t-white" /> SIGNING IN...</> : 'SIGN IN &rarr;'}
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
            <p className="mt-4 text-xs text-swiss-label">
              Provider sign-in only works for an existing account. Set a password once to
              connect {providers.length === 1 ? 'this provider' : 'a provider'}.
            </p>
          </div>
        ) : null}

        <div className="mt-8 border-t border-swiss-border pt-6">
          <p className="text-sm text-swiss-muted">
            No account yet?{' '}
            <Link to="/register" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
              CREATE ONE &rarr;
            </Link>
          </p>
        </div>
      </Card>
    </div>
  )
}
