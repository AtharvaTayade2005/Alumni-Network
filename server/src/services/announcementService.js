import * as announcementModel from '../models/announcementModel.js'
import { badRequest, forbidden, notFound } from '../utils/errors.js'
import { ROLES, hasAnyRole } from '../middleware/rbac.js'

const AUTHOR_ROLES = [ROLES.PROFESSOR, ROLES.FACULTY, ROLES.ADMIN]

export function assertCanBroadcast(user) {
  if (!user) throw forbidden('Authentication required')
  if (!hasAnyRole(user, ...AUTHOR_ROLES)) {
    throw forbidden('Only faculty members and administrators may post department announcements')
  }
}

export function assertCanManage(announcement, user) {
  if (!user) throw forbidden('Authentication required')
  const isAuthor = announcement.authorId === user.id
  const isAdmin = hasAnyRole(user, ROLES.ADMIN)
  if (!isAuthor && !isAdmin) {
    throw forbidden('You can only edit or delete announcements you authored')
  }
}

export async function listAnnouncements(user, query = {}) {
  const isStaffOrFaculty = user && hasAnyRole(user, ...AUTHOR_ROLES)
  const includeDrafts = Boolean(query.includeDrafts && isStaffOrFaculty)

  const announcements = await announcementModel.listAnnouncements({
    status: query.status,
    department: query.department,
    targetAudience: query.targetAudience,
    includeDrafts,
    limit: query.limit ? Math.min(Number(query.limit), 100) : 50,
    offset: query.offset ? Number(query.offset) : 0,
    authorId: query.myAnnouncements && user ? user.id : undefined,
  })

  const total = await announcementModel.countAnnouncements({
    status: query.status,
    includeDrafts,
  })

  return { announcements, total }
}

export async function getAnnouncement(user, id) {
  const announcement = await announcementModel.findAnnouncementById(id)
  if (!announcement) throw notFound('Announcement')

  if (announcement.status === 'draft') {
    const isStaffOrFaculty = user && hasAnyRole(user, ...AUTHOR_ROLES)
    if (!isStaffOrFaculty && announcement.authorId !== user?.id) {
      throw notFound('Announcement')
    }
  }

  // Increment views in background
  announcementModel.incrementViews(id).catch(() => {})
  return announcement
}

export async function createAnnouncement(user, payload) {
  assertCanBroadcast(user)

  if (!payload.title || !payload.title.trim()) {
    throw badRequest('Announcement title is required')
  }
  if (!payload.content || !payload.content.trim()) {
    throw badRequest('Announcement content is required')
  }

  return announcementModel.createAnnouncement({
    authorId: user.id,
    title: payload.title.trim(),
    content: payload.content.trim(),
    department: payload.department || 'Computer Science',
    targetAudience: payload.targetAudience || 'ALL',
    status: payload.status === 'draft' ? 'draft' : 'published',
    isPinned: Boolean(payload.isPinned),
  })
}

export async function updateAnnouncement(user, id, payload) {
  const existing = await announcementModel.findAnnouncementById(id)
  if (!existing) throw notFound('Announcement')
  assertCanManage(existing, user)

  const updates = {}
  if (payload.title !== undefined) updates.title = payload.title.trim()
  if (payload.content !== undefined) updates.content = payload.content.trim()
  if (payload.department !== undefined) updates.department = payload.department
  if (payload.targetAudience !== undefined) updates.target_audience = payload.targetAudience
  if (payload.status !== undefined) updates.status = payload.status
  if (payload.isPinned !== undefined) updates.is_pinned = Boolean(payload.isPinned)

  return announcementModel.updateAnnouncement(id, updates)
}

export async function deleteAnnouncement(user, id) {
  const existing = await announcementModel.findAnnouncementById(id)
  if (!existing) throw notFound('Announcement')
  assertCanManage(existing, user)

  return announcementModel.deleteAnnouncement(id)
}
