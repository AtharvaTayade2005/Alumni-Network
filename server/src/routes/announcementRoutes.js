import { Router } from 'express'
import { z } from 'zod'
import * as controller from '../controllers/announcementController.js'
import { validate } from '../middleware/validate.js'
import { authenticate } from '../middleware/auth.js'
import { uuidSchema } from '../validators/authValidators.js'

const idParamSchema = z.object({ id: uuidSchema })

const announcementCreateSchema = z.object({
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().min(5),
  department: z.string().trim().max(100).optional(),
  targetAudience: z.enum(['ALL', 'ALL_STUDENTS', 'SENIORS_JUNIORS', 'ALUMNI', 'FACULTY']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isPinned: z.boolean().optional(),
})

const announcementUpdateSchema = announcementCreateSchema.partial()

const announcementQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  department: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  includeDrafts: z.coerce.boolean().optional(),
  myAnnouncements: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const router = Router()

router.use(authenticate)

router.get('/', validate({ query: announcementQuerySchema }), controller.list)
router.post('/', validate({ body: announcementCreateSchema }), controller.create)
router.get('/:id', validate({ params: idParamSchema }), controller.get)
router.patch('/:id', validate({ params: idParamSchema, body: announcementUpdateSchema }), controller.update)
router.delete('/:id', validate({ params: idParamSchema }), controller.remove)

export default router
