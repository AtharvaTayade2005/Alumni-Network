import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../services/api.js'
import {
  Alert, Button, Card, Field, FieldErrorSummary, Input, Spinner,
} from '../components/ui.jsx'

export default function VerifyEmail() {
  const location = useLocation()
  const navigate = useNavigate()

  const queryToken = new URLSearchParams(location.search).get('token') || ''
  const [token, setToken] = useState(queryToken)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [verified, setVerified] = useState(false)

  const handleVerify = useCallback(async (tokenToUse) => {
    const activeToken = (tokenToUse || token).trim()
    if (!activeToken) {
      setError(new Error('Verification token is missing. Please enter the token from your email.'))
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await auth.verifyEmail(activeToken)
      setVerified(true)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }, [token])

  // Auto-verify if token is provided in URL
  useEffect(() => {
    if (queryToken && !verified && !submitting && !error) {
      handleVerify(queryToken)
    }
  }, [queryToken, verified, submitting, error, handleVerify])

  function onSubmit(event) {
    event.preventDefault()
    handleVerify(token)
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="p-8">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">AUTH &mdash; 05</p>
        <h1 className="text-2xl font-bold tracking-tight text-swiss-text">EMAIL VERIFICATION</h1>
        <p className="mt-2 text-sm text-swiss-muted leading-relaxed">
          Confirm your email address to unlock alumni directory messaging, mentorship requests, and notifications.
        </p>

        {verified ? (
          <div className="mt-6 space-y-6">
            <Alert tone="success" title="Email Confirmed Successfully">
              Your email address has been verified. Your account is now in full standing.
            </Alert>
            <div className="pt-2 border-t border-swiss-border">
              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => navigate('/login')}
              >
                CONTINUE TO SIGN IN →
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <FieldErrorSummary error={error} />

            <Field
              label="Verification Token"
              required
              hint="Check your email or paste token link"
            >
              <Input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste verification token"
                disabled={submitting}
              />
            </Field>

            <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="border-white/40 border-t-white" /> VERIFYING EMAIL...
                </>
              ) : (
                'VERIFY EMAIL ADDRESS →'
              )}
            </Button>

            <div className="pt-4 border-t border-swiss-border flex items-center justify-between text-xs">
              <Link to="/login" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
                &larr; BACK TO SIGN IN
              </Link>
              <Link to="/register" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
                CREATE ACCOUNT →
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
