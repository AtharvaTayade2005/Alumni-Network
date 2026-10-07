import * as donationService from '../services/donationService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendCreated, sendSuccess } from '../utils/response.js'
import { getBody, getParams, getQuery } from '../middleware/validate.js'

function contextOf(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') }
}

export const create = asyncHandler(async (req, res) => {
  const body = getBody(req)
  const result = await donationService.createDonation(req.user, body, contextOf(req))
  sendCreated(res, result, 'Donation initiated')
})

export const confirm = asyncHandler(async (req, res) => {
  const body = getBody(req)
  const result = await donationService.confirmDonation(req.user, body, contextOf(req))
  sendSuccess(res, result, { message: 'Donation confirmed successfully' })
})

export const myDonations = asyncHandler(async (req, res) => {
  const query = getQuery(req)
  const result = await donationService.listMyDonations(req.user, query)
  sendSuccess(res, result.donations, { meta: result.meta })
})

export const getReceipt = asyncHandler(async (req, res) => {
  const { id } = getParams(req)
  const result = await donationService.getDonationReceipt(req.user, id)
  sendSuccess(res, result.receipt)
})

export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.get('stripe-signature')
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body)
  const result = await donationService.handleStripeWebhook(rawBody, signature, contextOf(req))
  sendSuccess(res, result)
})
