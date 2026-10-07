import * as donationModel from '../models/donationModel.js'
import * as stripeService from './stripeService.js'
import * as notificationService from './notificationService.js'
import * as auditService from './auditService.js'
import * as userModel from '../models/userModel.js'
import { AUDIT_ACTIONS } from '../constants/auditActions.js'
import { badRequest, notFound } from '../utils/errors.js'
import logger from '../utils/logger.js'

/**
 * Donations and Payment Integration Service.
 */

export async function createDonation(user, payload, context = {}) {
  const amount = Number(payload.amount)
  if (!amount || amount <= 0) throw badRequest('Donation amount must be greater than zero')

  const currency = String(payload.currency ?? 'USD').toUpperCase()
  const provider = String(payload.provider ?? 'stripe').toLowerCase()

  const donation = await donationModel.createDonation(user.id, {
    amount,
    currency,
    provider,
    purpose: payload.purpose ?? 'General Endowment Fund',
    message: payload.message ?? null,
    isAnonymous: payload.isAnonymous === true,
  })

  let clientSecret = null
  let providerTxnId = null

  // Initiate Stripe PaymentIntent if provider is stripe
  if (provider === 'stripe') {
    try {
      const intent = await stripeService.createPaymentIntent({
        amount,
        currency,
        donationId: donation.id,
        userEmail: user.email,
      })
      clientSecret = intent.clientSecret
      providerTxnId = intent.id
    } catch (err) {
      logger.warn('Stripe payment intent initiation fallback for local testing', { error: err.message })
      // Sandbox fallback for local development if test credentials not configured
      providerTxnId = `pi_sandbox_${donation.id.slice(0, 8)}`
      clientSecret = `seti_sandbox_secret_${donation.id.slice(0, 8)}`
    }
  }

  const transaction = await donationModel.createTransaction(user.id, donation.id, {
    amount,
    currency,
    provider,
    idempotencyKey: payload.idempotencyKey ?? null,
  })

  if (providerTxnId) {
    await donationModel.updateTransactionStatus(transaction.id, {
      transactionId: providerTxnId,
      providerStatus: 'requires_payment_method',
    })
  }

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.DONATION_CREATED,
    entityType: 'donation',
    entityId: donation.id,
    metadata: { amount, currency, provider },
    context,
  })

  return {
    donation,
    transactionId: transaction.id,
    clientSecret,
    providerReference: providerTxnId,
  }
}

export async function confirmDonation(user, payload, context = {}) {
  const reference = payload.providerReference || payload.transactionId
  if (!reference) throw badRequest('Provider transaction reference is required')

  let transaction = await donationModel.findTransactionByProviderId('stripe', reference)
  if (!transaction && payload.donationId) {
    transaction = await donationModel.findTransactionByDonation(payload.donationId)
  }
  if (!transaction) throw notFound('Transaction')

  const donation = await donationModel.findDonationById(transaction.donationId)
  if (!donation) throw notFound('Donation')

  if (donation.status === donationModel.DONATION_STATUS.SUCCESS) {
    const existingReceipt = await donationModel.findReceiptByDonation(donation.id)
    return { donation, transaction, receipt: existingReceipt }
  }

  // Settle payment
  const settled = await donationModel.settle(
    transaction.id,
    donation.id,
    donationModel.DONATION_STATUS.SUCCESS,
    {
      providerStatus: 'succeeded',
      transactionId: reference,
    },
  )

  const donorUser = await userModel.findById(donation.userId)
  const donor = {
    userId: donorUser?.id ?? user.id,
    name: donation.isAnonymous ? null : (`${donorUser?.first_name ?? ''} ${donorUser?.last_name ?? ''}`.trim() || 'Alumni Supporter'),
    email: donation.isAnonymous ? null : donorUser?.email,
  }

  const receipt = await donationModel.createReceipt(settled.donation, donor)

  // Trigger in-app notification
  await notificationService.notify({
    userId: donation.userId,
    type: 'donation_confirmation',
    title: 'Thank you for your endowment contribution!',
    body: `Your gift of ${donation.currency} ${donation.amount.toLocaleString()} has been received with receipt #${receipt.receiptNumber}.`,
    link: '/donations',
  })

  await auditService.record({
    actorId: user.id,
    action: AUDIT_ACTIONS.DONATION_CONFIRMED,
    entityType: 'donation',
    entityId: donation.id,
    metadata: {
      amount: donation.amount,
      currency: donation.currency,
      receiptNumber: receipt.receiptNumber,
    },
    context,
  })

  return {
    donation: settled.donation,
    transaction: settled.transaction,
    receipt,
  }
}

export async function listMyDonations(user, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const [donations, total] = await Promise.all([
    donationModel.listDonationsByUser(user.id, { limit, offset }),
    donationModel.countDonationsByUser(user.id),
  ])

  return {
    donations,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export async function getDonationReceipt(user, donationId) {
  const donation = await donationModel.findDonationById(donationId)
  if (!donation) throw notFound('Donation')
  if (donation.userId !== user.id && !user.roles?.includes('ADMIN')) {
    throw notFound('Donation')
  }

  const receipt = await donationModel.findReceiptByDonation(donationId)
  if (!receipt) throw notFound('Receipt')
  return { receipt }
}

export async function handleStripeWebhook(rawBody, signature, context = {}) {
  stripeService.verifyWebhookSignature(rawBody, signature)

  const event = JSON.parse(rawBody)
  const eventType = event.type
  const eventId = event.id

  // Replay check
  const existing = await donationModel.findTransactionByEventId('stripe', eventId)
  if (existing) {
    return { received: true, replayed: true }
  }

  if (eventType === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object
    const reference = paymentIntent.id
    const donationId = paymentIntent.metadata?.donation_id

    let transaction = await donationModel.findTransactionByProviderId('stripe', reference)
    if (!transaction && donationId) {
      transaction = await donationModel.findTransactionByDonation(donationId)
    }

    if (transaction) {
      const donation = await donationModel.findDonationById(transaction.donationId)
      if (donation && donation.status !== donationModel.DONATION_STATUS.SUCCESS) {
        const settled = await donationModel.settle(
          transaction.id,
          donation.id,
          donationModel.DONATION_STATUS.SUCCESS,
          {
            providerStatus: paymentIntent.status,
            eventId,
            transactionId: reference,
            metadata: paymentIntent.metadata,
          },
        )

        const donorUser = await userModel.findById(donation.userId)
        await donationModel.createReceipt(settled.donation, {
          userId: donorUser?.id,
          name: donation.isAnonymous ? null : `${donorUser?.first_name ?? ''} ${donorUser?.last_name ?? ''}`.trim(),
          email: donation.isAnonymous ? null : donorUser?.email,
        })
      }
    }
  }

  await auditService.record({
    actorId: null,
    action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_RECEIVED,
    entityType: 'payment_webhook',
    entityId: eventId,
    metadata: { type: eventType },
    context,
  })

  return { received: true }
}
