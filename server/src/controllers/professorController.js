import * as professorService from '../services/professorService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSuccess } from '../utils/response.js'

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await professorService.getProfessorAnalytics(req.user)
  sendSuccess(res, analytics)
})
