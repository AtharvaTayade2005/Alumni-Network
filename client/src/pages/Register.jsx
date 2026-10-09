import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Button, Card, Checkbox, Field, FieldErrorSummary, Input, Select, Spinner,
} from '../components/ui.jsx'

const currentYear = new Date().getFullYear()
const graduationYears = Array.from({ length: 70 }, (_, index) => currentYear - index)

const initial = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'ALUMNI',
  graduationYear: '',
  degree: '',
  department: '',
  yearOfStudy: '1',
  acceptTerms: false,
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState(initial)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const isAlumni = form.role === 'ALUMNI'
  const isStudent = form.role === 'STUDENT'
  const isFaculty = form.role === 'PROFESSOR' || form.role === 'FACULTY'

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
      setForm((prev) => ({ ...prev, [field]: value }))
    }
  }

  function onRoleChange(event) {
    const role = event.target.value
    setForm((prev) => ({
      ...prev,
      role,
      graduationYear: role === 'ALUMNI' ? prev.graduationYear : '',
      yearOfStudy: role === 'STUDENT' ? (prev.yearOfStudy || '1') : '',
    }))
  }

  function getReadableErrorMessage(err) {
    if (!err) return null
    if (err.status === 409 || err.code === 'CONFLICT' || err.message?.toLowerCase().includes('already exists')) {
      return 'An account with this email address already exists. Please sign in or use forgot password.'
    }
    if (err.status === 503 || err.message?.toLowerCase().includes('database unavailable')) {
      return 'Database service is temporarily unavailable. Please verify the PostgreSQL or PGlite server is running.'
    }
    if (err.code === 'NETWORK_ERROR' || err.status === 0) {
      return 'Cannot reach the backend API at http://localhost:5000. Ensure the backend server is active.'
    }
    return err.message || 'An unexpected error occurred during account creation.'
  }

  async function onSubmit(event) {
    event.preventDefault()
    setError(null)

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      role: form.role,
      acceptTerms: form.acceptTerms,
    }

    if (isAlumni) {
      payload.graduationYear = Number(form.graduationYear) || undefined
    } else if (isStudent) {
      payload.yearOfStudy = Number(form.yearOfStudy) || undefined
    }

    if (form.degree.trim()) payload.degree = form.degree.trim()
    if (form.department.trim()) payload.department = form.department.trim()

    setSubmitting(true)
    try {
      await register(payload)
      navigate('/dashboard', { replace: true })
    } catch (caught) {
      setError(caught)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card className="p-8">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">AUTH &mdash; 02</p>
        <h1 className="text-2xl font-bold tracking-tight text-swiss-text">CREATE YOUR ACCOUNT</h1>
        <p className="mt-2 text-sm text-swiss-muted leading-relaxed">
          Join the alumni network to connect with peers, find mentors, share opportunities, and stay in touch.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
          {error && !Object.keys(error?.fields ?? {}).length ? (
            <Alert tone="error">{getReadableErrorMessage(error)}</Alert>
          ) : (
            <FieldErrorSummary error={error} />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" required>
              <Input
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={update('firstName')}
                invalid={Boolean(error?.fields?.firstName)}
                disabled={submitting}
              />
            </Field>
            <Field label="Last name" required>
              <Input
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={update('lastName')}
                invalid={Boolean(error?.fields?.lastName)}
                disabled={submitting}
              />
            </Field>
          </div>

          <Field label="Email address" required>
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.edu"
              value={form.email}
              onChange={update('email')}
              invalid={Boolean(error?.fields?.email)}
              disabled={submitting}
            />
          </Field>

          <Field
            label="Password"
            hint="At least 10 characters with upper, lower, number, and symbol"
            required
          >
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
              invalid={Boolean(error?.fields?.password)}
              disabled={submitting}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2 border-t border-swiss-border pt-6 mt-2">
            <Field label="I am a" required>
              <Select value={form.role} onChange={onRoleChange} disabled={submitting}>
                <option value="ALUMNI">Alumni</option>
                <option value="STUDENT">Current student</option>
                <option value="PROFESSOR">Faculty / Professor</option>
              </Select>
            </Field>

            {isAlumni && (
              <Field label="Graduation year" required>
                <Select
                  required
                  value={form.graduationYear}
                  onChange={update('graduationYear')}
                  invalid={Boolean(error?.fields?.graduationYear)}
                  disabled={submitting}
                >
                  <option value="">Select year</option>
                  {graduationYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </Select>
              </Field>
            )}

            {isStudent && (
              <Field label="Year of study" required>
                <Select
                  value={form.yearOfStudy}
                  onChange={update('yearOfStudy')}
                  disabled={submitting}
                >
                  {[1, 2, 3, 4, 5, 6].map((year) => (
                    <option key={year} value={year}>Year {year}</option>
                  ))}
                </Select>
              </Field>
            )}

            {isFaculty && (
              <Field label="Academic Department" required>
                <Input
                  value={form.department}
                  onChange={update('department')}
                  placeholder="e.g. Computer Science & Eng."
                  disabled={submitting}
                />
              </Field>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Degree / Qualification" hint="Optional">
              <Input
                value={form.degree}
                onChange={update('degree')}
                placeholder={isFaculty ? 'Ph.D. / M.Tech' : 'B.Tech Computer Science'}
                disabled={submitting}
              />
            </Field>
            {!isFaculty && (
              <Field label="Department / Major" hint="Optional">
                <Input
                  value={form.department}
                  onChange={update('department')}
                  placeholder="Computer Engineering"
                  disabled={submitting}
                />
              </Field>
            )}
          </div>

          <div className="border-t border-swiss-border pt-6">
            <Checkbox
              label="I accept the terms of use and privacy policy"
              checked={form.acceptTerms}
              onChange={update('acceptTerms')}
              disabled={submitting}
            />
            {error?.fields?.acceptTerms ? (
              <p className="mt-2 text-xs font-mono text-red-500">
                {error.fields.acceptTerms}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="border-white/40 border-t-white" /> CREATING ACCOUNT...
              </>
            ) : (
              'CREATE ACCOUNT →'
            )}
          </Button>
        </form>

        <div className="mt-8 border-t border-swiss-border pt-6 flex items-center justify-between text-xs">
          <p className="text-sm text-swiss-muted">
            Already registered?{' '}
            <Link to="/login" className="font-mono text-[10px] tracking-widest text-swiss-label uppercase hover:text-swiss-text">
              SIGN IN →
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
