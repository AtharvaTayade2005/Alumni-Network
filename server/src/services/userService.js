import * as userRepository from '../repositories/userRepository.js'
import { notFound } from '../utils/errors.js'

/**
 * User management rules. The service layer is deliberately thin in this phase:
 * it coordinates the repository and shapes the pagination envelope. Account
 * state changes, suspension and role editing belong to the administration phase
 * and are not implemented here.
 */
export async function listUsers({ search, role, status, page, limit }) {
  const offset = (page - 1) * limit
  const { rows, total } = await userRepository.listUsers({
    search, role, status, limit, offset,
  })

  return {
    users: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export async function getUser(userId) {
  const user = await userRepository.findUserById(userId)
  if (!user) throw notFound('User')
  return { user }
}