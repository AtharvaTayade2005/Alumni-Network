import { useState } from 'react'
import { Link } from 'react-router-dom'
import { auth } from '../services/api.js'
import {
  Alert, Button, Card, Field, FieldErrorSummary, Input, Spinner,
} from '../components/ui.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (!email.trim()) {
      setError(new Error('Please enter your account email address.'))
      return
    }

    setSubmitting(true)
    try {
      const res = await auth.forgotPassword(email.trim().toLowerCase())
      setSuccessMessage(
        res?.data?.message || res?.message || 'If an account exists with this email, password reset instructions have been dispatched.',
      )
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="p-8">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">AUTH &mdash; 03</p>
        <h1 className="text-2xl font-bold tracking-tight text-swiss-text">FORGOT PASSWORD</h1>
        <p className="mt-2 text-sm text-swiss-muted leading-relaxed">
          Enter your registered university or personal email to receive secure recovery instructions.
        </p>

        {successMessage ? (
          <div className="mt-6 space-y-6">
            <Alert tone="success" title="Recovery Link Dispatched">
              {successMessage}
            </Alert>
            <p className="text-xs text-swiss-muted">
              Check your inbox and spam folders. The link will remain active for 2 hours.
            </p>
            <div className="pt-2 border-t border-swiss-border">
              <Link to="/login">
                <Button variant="secondary" className="w-full justify-center">
                  RETURN TO SIGN IN →
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <FieldErrorSummary error={error} />

            <Field label="Registered email address" required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.edu"
                disabled={submitting}
              />
            </Field>

            <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="border-white/40 border-t-white" /> SENDING INSTRUCTIONS...
                </>
              ) : (
                'SEND RESET INSTRUCTIONS →'
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
