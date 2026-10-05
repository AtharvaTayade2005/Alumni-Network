import { query } from '../config/database.js'
import config from '../config/env.js'
import logger from '../utils/logger.js'
import { buildTemplate } from './templates.js'

/**
 * All outbound email goes through the email_queue table. The HTTP response
 * returns immediately; a background worker performs delivery. This keeps
 * request latency independent of the mail provider and survives provider
 * outages without failing user-facing operations.
 */
export async function enqueue({ to, subject, template, payload = {}, db = null }) {
  // A caller inside a transaction must pass its client. The shared pool is a
  // different connection, and on a single-connection development database the
  // transaction would wait on itself until it timed out.
  const runner = db ?? { query }
  const { rows } = await runner.query(
    `INSERT INTO email_queue (to_email, subject, template, payload)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [to, subject, template, JSON.stringify(payload)],
  )
  return rows[0].id
}

export async function queueVerificationEmail(email, token) {
  const link = `${config.clientUrl}/verify-email?token=${token}`
  return enqueue({
    to: email,
    subject: 'Verify your Alumni Network account',
    template: 'email_verification',
    payload: { link, name: email },
  })
}

export async function queuePasswordResetEmail(email, token) {
  const link = `${config.clientUrl}/reset-password?token=${token}`
  return enqueue({
    to: email,
    subject: 'Reset your password',
    template: 'password_reset',
    payload: { link, name: email },
  })
}

export async function queueEmail(to, subject, template, payload = {}, db = null) {
  return enqueue({ to, subject, template, payload, db })
}

export async function claimBatch(limit = 10) {
  const { rows } = await query(
    `UPDATE email_queue
     SET attempts = attempts + 1, last_error = NULL
     WHERE id IN (
       SELECT id FROM email_queue
       WHERE sent_at IS NULL AND attempts < 5
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING *`,
    [limit],
  )
  return rows
}

export async function markSent(id) {
  await query('UPDATE email_queue SET sent_at = NOW() WHERE id = $1', [id])
}

export async function markFailed(id, error) {
  await query(
    'UPDATE email_queue SET last_error = $2 WHERE id = $1',
    [id, String(error).slice(0, 1000)],
  )
}

/**
 * Delivery transport. The default 'log' driver renders the message and writes
 * it to the application log, so development and CI work with no SMTP account.
 * Set MAIL_DRIVER=smtp together with SMTP_* to send real mail.
 */
export async function deliver(row) {
  const rendered = buildTemplate(row.template, row.payload ?? {})

  if (config.mail.driver === 'smtp') {
    await sendViaSmtp({
      to: row.to_email,
      subject: row.subject,
      text: rendered.text,
      html: rendered.html,
    })
    return
  }

  logger.info('email dispatched (log driver)', {
    to: row.to_email,
    subject: row.subject,
    template: row.template,
  })
}

async function sendViaSmtp({ to, subject, text, html }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = config.mail.smtp
  if (!SMTP_HOST) {
    throw new Error('SMTP_HOST is not configured but MAIL_DRIVER=smtp')
  }

  const net = await import('node:net')
  const tls = await import('node:tls')

  const useTls = Number(SMTP_PORT) === 465
  const socket = useTls
    ? tls.connect({ host: SMTP_HOST, port: Number(SMTP_PORT), servername: SMTP_HOST })
    : net.connect({ host: SMTP_HOST, port: Number(SMTP_PORT) })

  await new Promise((resolve, reject) => {
    socket.once(useTls ? 'secureConnect' : 'connect', resolve)
    socket.once('error', reject)
  })

  const commands = [
    `EHLO ${config.clientUrl}`,
    ...(SMTP_USER ? ['AUTH LOGIN', base64(SMTP_USER), base64(SMTP_PASSWORD)] : []),
    `MAIL FROM:<${config.mail.fromEmail}>`,
    `RCPT TO:<${to}>`,
    'DATA',
    composeMessage({ to, subject, text, html }),
    'QUIT',
  ]

  const transcript = []
  for (const command of commands) {
    transcript.push(command)
    socket.write(`${command}\r\n`)
    await new Promise((resolve) => socket.once('data', resolve))
  }
  socket.end()
}

function base64(value) {
  return Buffer.from(String(value)).toString('base64')
}

function composeMessage({ to, subject, text, html }) {
  const boundary = `----anp-${Date.now()}`
  return [
    `From: Alumni Network <${config.mail.fromEmail}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n')
}
