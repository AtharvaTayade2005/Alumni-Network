import config from '../config/env.js'

/**
 * The provider the donation service talks to.
 *
 * Real calls go out through fetch to the Stripe REST API. Tests have no network
 * access, so the transport is replaceable through __setPaymentTransport; the
 * signature check that guards webhooks lives in stripeService and is verified
 * with a local HMAC, so it never depends on the transport.
 */

let transportOverride = null

/**
 * Test seam. Replaces the network transport for the lifetime of a suite; the
 * real behavior is one HTTP call wrapped in enough parsing to behave like a
 * client. The double underscore is deliberate: this is not a public API.
 *
 * @param {(method: string, url: string, init: {headers: object, body: string}) => Promise<{status: number, body: unknown}> | void} fn
 */
export function __setPaymentTransport(fn) {
  transportOverride = fn
}

function isTest() {
  return config.env === 'test'
}

async function defaultRequest(method, url, init) {
  const response = await fetch(url, { method, ...init })
  let body = null
  const text = await response.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { status: response.status, body }
}

/**
 * One outbound call to the configured provider. Returns the parsed provider
 * response or throws a typed error for non-2xx replies.
 */
export async function paymentRequest(method, url, { body = null, secretKey } = {}) {
  const init = {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  }

  let response
  if (transportOverride) {
    response = await transportOverride(method, url, { headers: init.headers, body: init.body })
  } else {
    if (isTest()) {
      throw new Error('A payment call was attempted during tests without a transport stub')
    }
    response = await defaultRequest(method, url, init)
  }

  if (!response || typeof response.status !== 'number') {
    throw new Error('Payment transport returned an invalid response')
  }
  if (response.status >= 400) {
    const error = new Error(
      `Payment provider rejected ${method} ${url} (${response.status})`,
    )
    error.status = response.status
    error.providerBody = response.body
    throw error
  }
  return response.body
}