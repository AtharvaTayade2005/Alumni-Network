import { Router } from 'express'
import * as controller from '../controllers/donationController.js'

const router = Router()

// Webhooks are unauthenticated server-to-server deliveries
router.post('/stripe/webhook', controller.stripeWebhook)

export default router
