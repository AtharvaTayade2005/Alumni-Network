import crypto from 'node:crypto'
import config from '../config/env.js'
import { paymentRequest } from './paymentClient.js'

/** Stripe REST endpoint. */
const BASE_URL = 'https://api.stripe.com'

/** A payment intent the client can confirm in the browser. */
export async function createPaymentIntent({ amount, currency, donationId, userEmail }) {
  const secretKey = config.payments.stripe.secretKey
  if (!secretKey) {
    throw Object.assign(new Error('Stripe is not configured on this server'), {
      status: 503,
      code: 'PAYMENT_NOT_CONFIGURED',
    })
  }
  const minuteUnits = Math.round(amount * 100)
  const body = await paymentRequest('POST', `${BASE_URL}/v1/payment_intents`, {
    secretKey,
    body: {
      amount: String(minuteUnits),
      currency: currency.toLowerCase(),
      'metadata[donation_id]': donationId,
      ...(userEmail ? { receipt_email: userEmail } : {}),
    },
  })
  return {
    id: body.id,
    clientSecret: body.client_secret,
    status: body.status,
  }
}

/** Re-read a payment intent from the provider. */
export async function retrievePaymentIntent(paymentIntentId) {
  const secretKey = config.payments.stripe.secretKey
  if (!secretKey) {
    throw Object.assign(new Error('Stripe is not configured on this server'), {
      status: 503,
      code: 'PAYMENT_NOT_CONFIGURED',
    })
  }
  const body = await paymentRequest(
    'GET', `${BASE_URL}/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    { secretKey },
  )
  return {
    id: body.id,
    status: body.status,
    amount: (body.amount ?? 0) / 100,
    currency: body.currency ?? null,
    lastError: body.last_payment_error?.message ?? null,
  }
}

/**
 * Verifies a webhook delivery locally, without trusting anything the sender
 * claims. The signature is an HMAC-SHA256 over `t.<raw body>` keyed by the
 * webhook secret, computed here; the timestamp also bounds replay windows.
 *
 * @returns {string} the verified timestamp
 * @throws {Error} when the signature, age or configuration is invalid
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = config.payments.stripe.webhookSecret
  if (!secret) {
    throw Object.assign(new Error('Stripe webhook secret is not configured'), {
      status: 503,
      code: 'WEBHOOK_NOT_CONFIGURED',
    })
  }
  if (!rawBody) {
    throw Object.assign(new Error('Webhook payload is missing'), {
      status: 400,
      code: 'WEBHOOK_PAYLOAD_MISSING',
    })
  }

  const parts = (signatureHeader ?? '').split(',')
  let timestamp = null
  const signatures = []
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 't') timestamp = rest.join('=')
    if (name === 'v1') signatures.push(rest.join('='))
  }
  if (!timestamp || signatures.length === 0) {
    throw Object.assign(new Error('Webhook signature header is malformed'), {
      status: 400,
      code: 'WEBHOOK_SIGNATURE_INVALID',
    })
  }

  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) {
    throw Object.assign(new Error('Webhook signature timestamp is not a number'), {
      status: 400,
      code: 'WEBHOOK_SIGNATURE_INVALID',
    })
  }
  const toleranceSeconds = 300
  if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > toleranceSeconds) {
    // A replayed event older than the window is refused on purpose.
    throw Object.assign(new Error('Webhook delivery is outside the timestamp window'), {
      status: 400,
      code: 'WEBHOOK_TOO_OLD',
    })
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const matched = signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false
    const given = Buffer.from(sig, 'hex')
    return given.length === expectedBuf.length
      && crypto.timingSafeEqual(given, expectedBuf)
  })
  if (!matched) {
    throw Object.assign(new Error('Webhook signature does not match'), {
      status: 400,
      code: 'WEBHOOK_SIGNATURE_INVALID',
    })
  }
  return seconds
}

/** The provider's intent status translated to the internal lifecycle. */
export function toInternalStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'succeeded':
      return 'SUCCESS'
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_capture':
    case 'requires_payment_method':
      return 'PROCESSING'
    case 'canceled':
      return 'FAILED'
    default:
      return 'PROCESSING'
  }
}