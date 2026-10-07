import { Router } from 'express'
import * as controller from '../controllers/donationController.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  createDonationSchema,
  confirmDonationSchema,
  donationIdParamSchema,
  listDonationsQuerySchema,
} from '../validators/donationValidators.js'

const router = Router()

router.use(authenticate)

router.post('/create', validate({ body: createDonationSchema }), controller.create)
router.post('/confirm', validate({ body: confirmDonationSchema }), controller.confirm)
router.get('/my', validate({ query: listDonationsQuerySchema }), controller.myDonations)
router.get('/receipts/:id', validate({ params: donationIdParamSchema }), controller.getReceipt)

export default router
