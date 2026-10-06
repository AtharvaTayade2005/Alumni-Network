import { query, withTransaction } from '../config/database.js'

/**
 * Data access for donations, payment transactions and receipt records.
 */

export const DONATION_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
}

export function formatDonation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    currency: String(row.currency).trim(),
    provider: row.provider,
    status: row.status,
    purpose: row.purpose,
    message: row.message,
    isAnonymous: row.is_anonymous,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function formatTransaction(row) {
  return {
    id: row.id,
    donationId: row.donation_id,
    userId: row.user_id,
    amount: Number(row.amount),
    currency: String(row.currency).trim(),
    provider: row.provider,
    transactionId: row.transaction_id,
    providerStatus: row.provider_status,
    failureCode: row.failure_code,
    idempotencyKey: row.idempotency_key,
    eventId: row.event_id,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function formatReceipt(row) {
  return {
    id: row.id,
    donationId: row.donation_id,
    receiptNumber: row.receipt_number,
    issuedAt: row.issued_at,
    amount: Number(row.amount),
    currency: String(row.currency).trim(),
    donorUserId: row.donor_user_id,
    donorName: row.donor_name,
    donorEmail: row.donor_email,
  }
}

export async function createDonation(userId, data, now = new Date()) {
  const { rows } = await query(
    `INSERT INTO donations (user_id, amount, currency, provider, status, purpose,
       message, is_anonymous, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING *`,
    [
      userId, data.amount, data.currency, data.provider, DONATION_STATUS.PENDING,
      data.purpose ?? null, data.message ?? null, data.isAnonymous === true, now,
    ],
  )
  return formatDonation(rows[0])
}

export async function createTransaction(userId, donationId, data, now = new Date()) {
  const { rows } = await query(
    `INSERT INTO payment_transactions
       (donation_id, user_id, amount, currency, provider, status,
        idempotency_key, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     RETURNING *`,
    [
      donationId, userId, data.amount, data.currency, data.provider,
      DONATION_STATUS.PENDING, data.idempotencyKey ?? null, now,
    ],
  )
  return formatTransaction(rows[0])
}

export async function updateTransactionStatus(id, patch, now = new Date()) {
  const { rows } = await query(
    `UPDATE payment_transactions
        SET status = COALESCE($2, status),
            transaction_id = COALESCE($3, transaction_id),
            provider_status = COALESCE($4, provider_status),
            failure_code = COALESCE($5, failure_code),
            event_id = COALESCE($6, event_id),
            metadata = CASE WHEN $7::jsonb IS NULL THEN metadata ELSE metadata || $7::jsonb END,
            updated_at = $8
      WHERE id = $1
      RETURNING *`,
    [
      id,
      patch.status ?? null,
      patch.transactionId ?? null,
      patch.providerStatus ?? null,
      patch.failureCode ?? null,
      patch.eventId ?? null,
      patch.metadata ? JSON.stringify(patch.metadata) : null,
      now,
    ],
  )
  return rows[0] ? formatTransaction(rows[0]) : null
}

export async function updateDonationStatus(donationId, status, now = new Date()) {
  const { rows } = await query(
    `UPDATE donations SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *`,
    [donationId, status, now],
  )
  return rows[0] ? formatDonation(rows[0]) : null
}

export async function findDonationById(donationId) {
  const { rows } = await query(`SELECT * FROM donations WHERE id = $1`, [donationId])
  return rows[0] ? formatDonation(rows[0]) : null
}

export async function listDonationsByUser(userId, { limit, offset }) {
  const { rows } = await query(
    `SELECT * FROM donations WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return rows.map(formatDonation)
}

export async function countDonationsByUser(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM donations WHERE user_id = $1`,
    [userId],
  )
  return rows[0].total
}

export async function findTransactionByProviderId(provider, transactionId) {
  const { rows } = await query(
    `SELECT * FROM payment_transactions
      WHERE provider = $1 AND transaction_id = $2`,
    [provider, transactionId],
  )
  return rows[0] ? formatTransaction(rows[0]) : null
}

export async function findTransactionByEventId(provider, eventId) {
  const { rows } = await query(
    `SELECT * FROM payment_transactions
      WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  )
  return rows[0] ? formatTransaction(rows[0]) : null
}

export async function findTransactionByDonation(donationId) {
  const { rows } = await query(
    `SELECT * FROM payment_transactions WHERE donation_id = $1 ORDER BY created_at DESC`,
    [donationId],
  )
  return rows[0] ? formatTransaction(rows[0]) : null
}

/** The next receipt number from the shared sequence, formatted for the year. */
export async function nextReceiptNumber(now = new Date()) {
  const { rows } = await query(`SELECT NEXTVAL('receipt_number_seq') AS n`)
  const year = now.getUTCFullYear()
  return `RCPT-${year}-${String(rows[0].n).padStart(6, '0')}`
}

export async function createReceipt(donation, donor, now = new Date()) {
  const { rows } = await query(
    `INSERT INTO donation_receipts
       (donation_id, receipt_number, issued_at, amount, currency, donor_user_id,
        donor_name, donor_email, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING *`,
    [
      donation.id, donation.receiptNumber ?? await nextReceiptNumber(now), now,
      donation.amount, donation.currency, donor?.userId ?? null,
      donation.isAnonymous ? null : (donor?.name ?? null),
      donation.isAnonymous ? null : (donor?.email ?? null),
      now,
    ],
  )
  return formatReceipt(rows[0])
}

export async function findReceiptByDonation(donationId) {
  const { rows } = await query(
    `SELECT * FROM donation_receipts WHERE donation_id = $1`,
    [donationId],
  )
  return rows[0] ? formatReceipt(rows[0]) : null
}

export async function listReceiptsForUser(userId, { limit, offset }) {
  const { rows } = await query(
    `SELECT * FROM donation_receipts WHERE donor_user_id = $1
     ORDER BY issued_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
  return rows.map(formatReceipt)
}

/** Mark the donation and its transaction final in one shot. */
export async function settle(transactionId, donationId, status, patch = {}, now = new Date()) {
  return withTransaction(async (db) => {
    const txn = await db.query(
      `UPDATE payment_transactions
          SET status = $1,
              provider_status = COALESCE($2, provider_status),
              failure_code = COALESCE($3, failure_code),
              event_id = COALESCE($4, event_id),
              metadata = CASE WHEN $5::jsonb IS NULL
                              THEN metadata ELSE metadata || $5::jsonb END,
              updated_at = $6
        WHERE id = $7
        RETURNING *`,
      [
        status,
        patch.providerStatus ?? null,
        patch.failureCode ?? null,
        patch.eventId ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        now, transactionId,
      ],
    )
    const donation = await db.query(
      `UPDATE donations SET status = $1, updated_at = $2
        WHERE id = $3 RETURNING *`,
      [status, now, donationId],
    )
    return {
      transaction: txn.rows[0] ? formatTransaction(txn.rows[0]) : null,
      donation: donation.rows[0] ? formatDonation(donation.rows[0]) : null,
    }
  })
}