import { describe, it, expect, beforeEach } from 'vitest'
import { tokenStore, ApiError, normalizeFields } from './http.js'

describe('Client Vitest: Auth State & Token Regression Tests', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('TC-REG-01: tokenStore properly manages access tokens', () => {
    expect(tokenStore.get()).toBeNull()
    tokenStore.set('mock-access-token-xyz')
    expect(tokenStore.get()).toBe('mock-access-token-xyz')
    tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })

  it('TC-REG-02: ApiError correctly identifies 401 Unauthorized status', () => {
    const authErr = new ApiError(401, 'Authentication token is missing', { code: 'UNAUTHENTICATED' })
    expect(authErr.isUnauthorised).toBe(true)
    expect(authErr.status).toBe(401)
    expect(authErr.code).toBe('UNAUTHENTICATED')
    expect(authErr.message).toBe('Authentication token is missing')

    const notFoundErr = new ApiError(404, 'Resource not found', { code: 'NOT_FOUND' })
    expect(notFoundErr.isUnauthorised).toBe(false)
  })

  it('TC-REG-03: ApiError maps field validation errors from 422 responses', () => {
    const rawErrors = [
      { field: 'email', message: 'Email already registered' },
      { field: 'password', message: 'Password is too weak' },
    ]
    const fields = normalizeFields(rawErrors)
    expect(fields.email).toBe('Email already registered')
    expect(fields.password).toBe('Password is too weak')

    const validationErr = new ApiError(422, 'Validation failed', {
      code: 'VALIDATION_ERROR',
      errors: fields,
    })
    expect(validationErr.fields.email).toBe('Email already registered')
    expect(validationErr.fields.password).toBe('Password is too weak')
  })

  it('TC-REG-04: unauthenticated session invariant enforces token presence', () => {
    // Invariant: isAuthenticated = status === 'authenticated' && Boolean(user) && Boolean(tokenStore.get())
    const user = { id: 'usr-1', email: 'test@example.com' }
    let status = 'authenticated'

    // Case 1: Status is authenticated, user exists, but no token in tokenStore
    tokenStore.clear()
    const isAuthedWithoutToken = status === 'authenticated' && Boolean(user) && Boolean(tokenStore.get())
    expect(isAuthedWithoutToken).toBe(false)

    // Case 2: Token is added
    tokenStore.set('valid-token')
    const isAuthedWithToken = status === 'authenticated' && Boolean(user) && Boolean(tokenStore.get())
    expect(isAuthedWithToken).toBe(true)

    // Case 3: Status becomes anonymous
    status = 'anonymous'
    const isAuthedWhenAnonymous = status === 'authenticated' && Boolean(user) && Boolean(tokenStore.get())
    expect(isAuthedWhenAnonymous).toBe(false)
  })
})
