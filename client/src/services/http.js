/**
 * Single entry point for every HTTP call the app makes.
 *
 * Responsibilities:
 *  - unwrap the API envelope ({ success, data, meta }) and throw ApiError
 *  - attach the access token from the auth store
 *  - read the CSRF cookie and mirror it into a header for cookie-auth calls
 *  - transparently refresh an expired access token once, then replay
 *  - serialise concurrent refreshes so a burst of 401s performs only one
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

const ACCESS_TOKEN_KEY = 'anp.accessToken'
const CSRF_COOKIE = 'csrf_token'

export class ApiError extends Error {
  constructor(status, message, { code, details, errors } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    /** Field-level messages from a 422, keyed by field name. */
    this.fields = errors ?? {}
  }

  get isUnauthorised() {
    return this.status === 401
  }
}

export const tokenStore = {
  get: () => {
    try {
      return sessionStorage.getItem(ACCESS_TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token) => {
    try {
      if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
      else sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    } catch {
      /* private browsing - the in-memory copy still works for this tab */
    }
  },
  clear: () => tokenStore.set(null),
}

function readCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function buildUrl(path, params) {
  const url = `${BASE_URL}${path}`
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

async function parseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function normalizeFields(errors) {
  if (!errors) return {}
  if (Array.isArray(errors)) {
    const map = {}
    for (const item of errors) {
      if (item && item.field) {
        map[item.field] = item.message || 'Invalid value'
      }
    }
    return map
  }
  if (typeof errors === 'object') return errors
  return {}
}

function toError(status, body) {
  const fields = normalizeFields(body?.errors || body?.error?.details)
  const message = body?.message || body?.error?.message || `Request failed (${status})`
  return new ApiError(status, message, {
    code: body?.error?.code,
    details: body?.error?.details,
    errors: fields,
  })
}

let refreshInFlight = null

/**
 * A single in-flight refresh shared by every caller that got a 401, so ten
 * parallel requests do not trigger ten refresh-token rotations (which would
 * invalidate each other, since rotation is single-use).
 */
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeader(),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const token = body?.data?.accessToken
        if (token) tokenStore.set(token)
        return token
      })
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

function csrfHeader() {
  const token = readCookie(CSRF_COOKIE)
  return token ? { 'x-csrf-token': token } : {}
}

async function send(path, { method = 'GET', body, params, signal, retry = true } = {}) {
  const headers = { ...csrfHeader() }
  let payload

  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const accessToken = tokenStore.get()
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: payload,
      credentials: 'include',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. Please try again.', { code: 'REQUEST_TIMEOUT' })
    }
    throw new ApiError(0, 'Unable to connect to the server. Please ensure the backend is running.', { code: 'NETWORK_ERROR' })
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    const refreshed = await refreshAccessToken().catch(() => null)
    if (refreshed) return send(path, { method, body, params, signal, retry: false })
    tokenStore.clear()
  }

  if (response.status === 204) return null

  const parsed = await parseBody(response)
  if (!response.ok || parsed?.success === false) throw toError(response.status, parsed)

  return parsed
}

export const api = {
  get: (path, options) => send(path, { ...options, method: 'GET' }),
  post: (path, body, options) => send(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => send(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => send(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => send(path, { ...options, method: 'DELETE' }),
  refresh: refreshAccessToken,
  tokenStore,
  /** Absolute API URL, for the few flows that redirect the browser instead of using fetch. */
  url: buildUrl,
}
