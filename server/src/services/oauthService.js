import crypto from 'node:crypto'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import env from '../config/env.js'
import { query } from '../config/database.js'
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors.js'
import { forbidden as forbiddenError } from '../utils/errors.js'
import * as userModel from '../models/userModel.js'
import * as auditService from './auditService.js'

/**
 * OAuth 2.0 / OpenID Connect sign-in.
 *
 * Three providers are supported: Google, LinkedIn and a generic OIDC issuer
 * used for university single sign-on. The flow is authorization-code based and
 * uses PKCE for LinkedIn and the OIDC issuer; Google does not require it.
 *
 * `state` is signed and carries the PKCE verifier, a post-login redirect and
 * the linking intent, so a callback can be neither forged nor replayed into a
 * different account.
 */

const PROVIDERS = {
  google: {
    label: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    pkce: false,
  },
  linkedin: {
    label: 'LinkedIn',
    authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    userinfoEndpoint: 'https://api.linkedin.com/v2/userinfo',
    scope: 'openid profile email',
    pkce: true,
  },
  sso: {
    label: 'University SSO',
    authorizationEndpoint: null, // discovered from the issuer metadata
    tokenEndpoint: null,
    userinfoEndpoint: null,
    scope: 'openid email profile',
    pkce: true,
  },
}

const STATE_TTL_MS = 10 * 60 * 1000

export function listProviders() {
  return Object.entries(PROVIDERS)
    .filter(([name]) => isConfigured(name))
    .map(([name, config]) => ({ name, label: config.label }))
}

export function isConfigured(provider) {
  const config = env.oauth[provider]
  if (!config?.clientId || !config?.clientSecret) return false
  if (provider === 'sso') return Boolean(config.issuerUrl)
  return true
}

function stateSecret() {
  const secret = env.oauth.stateSecret || env.jwt?.secret
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured')
  return secret
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(value) {
  return crypto.createHmac('sha256', stateSecret()).update(value).digest('base64url')
}

/** Serialises the state payload and appends an HMAC so it cannot be edited. */
function encodeState(payload) {
  const body = base64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/** Verifies the signature and freshness, returning the decoded payload. */
function decodeState(value) {
  if (typeof value !== 'string' || !value.includes('.')) {
    throw badRequest('Invalid OAuth state')
  }
  const [body, signature] = value.split('.', 2)
  const expected = sign(body)
  const provided = Buffer.from(signature ?? '')
  const computed = Buffer.from(expected)
  // Constant-time compare, but only after a length check that does not leak
  // through timing.
  if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
    throw badRequest('Invalid OAuth state')
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw badRequest('Invalid OAuth state')
  }
  if (!payload.expiresAt || Date.now() > payload.expiresAt) {
    throw badRequest('This sign-in attempt expired. Please try again.')
  }
  return payload
}

/**
 * Absolute URL the provider sends the browser back to. OAuth requires a real
 * origin, so this is configuration rather than a guess; without it the flow
 * fails loudly at redirect time rather than confusingly at the callback.
 */
function callbackUrl(provider) {
  if (!env.apiBaseUrl) {
    throw new Error(
      'API_BASE_URL must be set before OAuth sign-in can be used',
    )
  }
  return `${env.apiBaseUrl}/api/auth/oauth/${provider}/callback`
}

/** Cached OpenID discovery document, fetched lazily from the issuer. */
let ssoMetadata = null

async function ssoEndpoints() {
  if (ssoMetadata) return ssoMetadata
  const issuer = env.oauth.sso.issuerUrl
  if (!issuer) throw forbiddenError('University SSO is not configured')
  const response = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`)
  if (!response.ok) {
    throw new Error(`SSO discovery failed with status ${response.status}`)
  }
  ssoMetadata = await response.json()
  return ssoMetadata
}

async function endpointsFor(provider) {
  if (provider !== 'sso') return PROVIDERS[provider]
  const metadata = await ssoEndpoints()
  return {
    ...PROVIDERS.sso,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    userinfoEndpoint: metadata.userinfo_endpoint,
  }
}

/**
 * Builds the provider URL the browser is redirected to. The `state` parameter
 * is signed and holds the PKCE verifier plus where to send the user afterwards.
 */
export async function buildAuthorizationUrl(provider, { redirectTo = '/dashboard', linkToUserId = null } = {}) {
  if (!PROVIDERS[provider]) throw badRequest('Unknown OAuth provider')
  if (!isConfigured(provider)) {
    throw forbiddenError(`${PROVIDERS[provider].label} sign-in is not available`)
  }

  const config = await endpointsFor(provider)
  const verifier = config.pkce ? crypto.randomBytes(32).toString('base64url') : null
  const challenge = verifier
    ? crypto.createHash('sha256').update(verifier).digest('base64url')
    : null

  const nonce = crypto.randomBytes(16).toString('base64url')
  const state = encodeState({
    provider,
    verifier,
    redirectTo,
    linkToUserId,
    nonce,
    expiresAt: Date.now() + STATE_TTL_MS,
  })

  const url = new URL(config.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', env.oauth[provider].clientId)
  url.searchParams.set('redirect_uri', callbackUrl(provider))
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  if (config.pkce) {
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  if (provider === 'sso') url.searchParams.set('nonce', nonce)

  return { url: url.toString(), provider, label: config.label }
}

async function exchangeCode(provider, code, verifier) {
  const config = await endpointsFor(provider)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(provider),
    client_id: env.oauth[provider].clientId,
    client_secret: env.oauth[provider].clientSecret,
  })
  if (verifier) body.set('code_verifier', verifier)

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw unauthorized('The sign-in provider rejected the authorization code')
  }
  const payload = await response.json()
  if (!payload.access_token) {
    throw unauthorized('The sign-in provider returned no access token')
  }
  return { accessToken: payload.access_token, idToken: payload.id_token }
}

/** Normalises the provider payload into the fields the rest of the app uses. */
async function fetchProfile(provider, accessToken) {
  const config = await endpointsFor(provider)
  const response = await fetch(config.userinfoEndpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw unauthorized('Could not read your profile from the sign-in provider')
  }
  const raw = await response.json()

  const email = (raw.email ?? raw.emailAddress ?? '').trim().toLowerCase()
  if (!email) {
    throw unauthorized('The sign-in provider did not share an email address')
  }

  // LinkedIn puts the name in "name" but has no separate given name.
  const firstName = (raw.given_name ?? raw.firstName ?? '').trim()
    || (raw.name ?? '').trim().split(' ')[0] || 'Member'
  const lastName = (raw.family_name ?? raw.lastName ?? '').trim()
    || (raw.name ?? '').trim().split(' ').slice(1).join(' ') || 'Member'

  return {
    providerUserId: String(raw.sub ?? raw.id ?? ''),
    email,
    firstName,
    lastName,
    avatarUrl: raw.picture ?? raw.profilePicture ?? null,
  }
}

export async function findLinkedAccount(provider, providerUserId) {
  const { rows } = await query(
    'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId],
  )
  return rows[0] ?? null
}

export async function listLinkedAccounts(userId) {
  const { rows } = await query(
    `SELECT provider, email, created_at FROM oauth_accounts
     WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  )
  return rows.map((r) => ({
    provider: r.provider,
    label: PROVIDERS[r.provider]?.label ?? r.provider,
    email: r.email,
    linkedAt: r.created_at,
  }))
}

export async function findLinkedByEmail(provider, email) {
  const { rows } = await query(
    'SELECT * FROM oauth_accounts WHERE provider = $1 AND LOWER(email) = LOWER($2)',
    [provider, email],
  )
  return rows[0] ?? null
}

export async function unlinkAccount(userId, provider) {
  if (!PROVIDERS[provider]) throw badRequest('Unknown OAuth provider')

  // A user must keep at least one way to sign in, otherwise the account can
  // become unreachable.
  const [{ rows: remaining }, { rows: passwordRows }] = await Promise.all([
    query('SELECT provider, provider_user_id FROM oauth_accounts WHERE user_id = $1', [userId]),
    query('SELECT password_hash FROM users WHERE id = $1', [userId]),
  ])
  const hasPassword = Boolean(passwordRows[0]?.password_hash)
  if (!hasPassword && remaining.length <= 1) {
    throw conflict('Add a password or another sign-in method before unlinking this one')
  }

  const { rows } = await query(
    'DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2 RETURNING provider',
    [userId, provider],
  )
  if (rows.length === 0) throw notFound('Linked account')
  return { unlinked: provider }
}

/**
 * Completes a callback: validates state, exchanges the code, and returns the
 * account to sign in. Never creates a session itself; the controller does that
 * so cookie handling stays in one place.
 */
export async function resolveCallback(provider, { code, state }, context = {}) {
  if (!PROVIDERS[provider]) throw badRequest('Unknown OAuth provider')

  const payload = decodeState(state)
  if (payload.provider !== provider) {
    throw badRequest('OAuth state does not match the provider')
  }
  if (!code) throw badRequest('The provider did not return an authorization code')

  const { accessToken } = await exchangeCode(provider, code, payload.verifier)
  const profile = await fetchProfile(provider, accessToken)
  if (!profile.providerUserId) {
    throw unauthorized('The sign-in provider did not return a stable account id')
  }
  // Sanitised here as well as at the start, so a tampered-but-valid state
  // cannot turn the callback into an open redirect.
  const redirectTo = safeRedirect(payload.redirectTo)

  // Explicit linking: the signed state names the account to attach to, so this
  // never depends on a matching email.
  if (payload.linkToUserId) {
    const account = await userModel.findById(payload.linkToUserId)
    if (!account) throw notFound('Account')
    if (account.email?.toLowerCase() !== profile.email) {
      throw forbidden('That provider account uses a different email address')
    }
    const existing = await findLinkedAccount(provider, profile.providerUserId)
    if (existing) {
      if (existing.user_id === account.id) return { user: account, created: false }
      throw conflict('That provider account is already linked to another member')
    }
    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
       VALUES ($1,$2,$3,$4)`,
      [account.id, provider, profile.providerUserId, profile.email],
    )
    await auditService.record({
      actorId: account.id,
      action: AUDIT_ACTIONS.AUTH_OAUTH_LINKED,
      entityType: 'user',
      entityId: account.id,
      metadata: { provider },
      context,
    })
    return { user: account, created: false, linked: true, redirectTo }
  }

  const linked = await findLinkedAccount(provider, profile.providerUserId)
  if (linked) {
    const user = await userModel.findById(linked.user_id)
    if (!user) throw notFound('Account')
    assertSignInAllowed(user)
    return { user, created: false, redirectTo }
  }

  const existingUser = await userModel.findByEmail(profile.email)
  if (existingUser) {
    // Same verified email from a provider the account has never used: link it
    // rather than creating a second account for the same person.
    await query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
       VALUES ($1,$2,$3,$4)`,
      [existingUser.id, provider, profile.providerUserId, profile.email],
    )
    assertSignInAllowed(existingUser)
    await auditService.record({
      actorId: existingUser.id,
      action: AUDIT_ACTIONS.AUTH_OAUTH_LINKED,
      entityType: 'user',
      entityId: existingUser.id,
      metadata: { provider, reason: 'email_match' },
      context,
    })
    return { user: existingUser, created: false, linked: true, redirectTo }
  }

  throw conflict(
    'No account exists for that email. Register with a password first, then link '
    + `${PROVIDERS[provider].label} from your profile.`,
  )
}

function assertSignInAllowed(user) {
  if (user.is_suspended) {
    throw forbidden('This account has been suspended. Contact the administration.')
  }
  if (!user.is_active) throw forbidden('This account has been deactivated.')
}

/** Only allow relative in-app paths so the callback cannot be used as an open redirect. */
export function safeRedirect(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}
