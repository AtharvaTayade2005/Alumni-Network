import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../services/api.js'
import {
  Alert, Button, Card, Field, FieldErrorSummary, Input, Spinner,
} from '../components/ui.jsx'

export default function ResetPassword() {
  const location = useLocation()
  const navigate = useNavigate()

  const queryToken = new URLSearchParams(location.search).get('token') || ''
  const [token, setToken] = useState(queryToken)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)

    if (!token.trim()) {
      setError(new Error('Reset token is required. Please check the link from your email.'))
      return
    }

    if (password.length < 10) {
      setError(new Error('Password must be at least 10 characters long.'))
      return
    }

    if (password !== confirmPassword) {
      setError(new Error('Passwords do not match. Please re-enter identical passwords.'))
      return
    }

    setSubmitting(true)
    try {
      await auth.resetPassword({ token: token.trim(), password })
      setSuccess(true)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="p-8">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">AUTH &mdash; 04</p>
        <h1 className="text-2xl font-bold tracking-tight text-swiss-text">RESET PASSWORD</h1>
        <p className="mt-2 text-sm text-swiss-muted leading-relaxed">
          Create a new secure password for your Alumni Network Portal account.
        </p>

        {success ? (
          <div className="mt-6 space-y-6">
            <Alert tone="success" title="Password Reset Complete">
              Your password has been successfully updated. You can now sign in with your new credentials.
            </Alert>
            <div className="pt-2 border-t border-swiss-border">
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => navigate('/login')}
              >
                PROCEED TO SIGN IN →
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <FieldErrorSummary error={error} />

            {!queryToken ? (
              <Field label="Reset Token" required hint="Found in your email reset link">
                <Input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from reset email"
                  disabled={submitting}
                />
              </Field>
            ) : null}

            <Field
              label="New Password"
              required
              hint="Min 10 characters with upper, lower, number, symbol"
            >
              <Input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter strong password"
                disabled={submitting}
              />
            </Field>

            <Field label="Confirm New Password" required>
              <Input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={submitting}
              />
            </Field>

            <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="border-white/40 border-t-white" /> UPDATING PASSWORD...
                </>
              ) : (
                'UPDATE PASSWORD →'
              )}
            </Button>

            <div className="pt-4 border-t border-swiss-border text-center">
              <Link to="/login" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
                ← BACK TO SIGN IN
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
