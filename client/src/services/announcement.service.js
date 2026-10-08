import { db } from '../data/index.js'
import { api } from './http.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const announcementService = {
  async list(params = {}) {
    await delay()
    let announcements = db.get('announcements')

    if (params.status) {
      announcements = announcements.filter((a) => a.status === params.status)
    } else {
      // By default show published for regular users
      if (!params.includeDrafts) {
        announcements = announcements.filter((a) => a.status === 'published')
      }
    }

    if (params.department) {
      announcements = announcements.filter((a) => a.department === params.department || a.department === 'University-Wide')
    }

    return {
      data: announcements,
      meta: { total: announcements.length },
    }
  },

  async create(payload) {
    await delay(120)
    let user = { id: 'u_faculty_1', name: 'Faculty Member' }
    try {
      const res = await api.get('/auth/me')
      user = res.data?.user || res.data || user
    } catch {
      // keep fallback
    }

    const newAnnouncement = {
      id: `ann_${Date.now()}`,
      title: payload.title,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.headline || 'Faculty Member',
      department: payload.department || user.department || 'Computer Science',
      targetAudience: payload.targetAudience || 'ALL',
      targetAudienceLabel: payload.targetAudience ? payload.targetAudience.replace(/_/g, ' ') : 'All Members',
      content: payload.content,
      status: payload.status || 'published',
      isPinned: Boolean(payload.isPinned),
      publishedAt: payload.status === 'draft' ? null : new Date().toISOString(),
      viewsCount: 1,
    }

    db.insert('announcements', newAnnouncement)
    return { data: newAnnouncement, message: 'Announcement created successfully' }
  },

  async update(id, payload) {
    await delay(80)
    db.update('announcements', (a) => a.id === id, (a) => ({
      ...a,
      ...payload,
      publishedAt: a.publishedAt || (payload.status === 'published' ? new Date().toISOString() : null),
    }))
    return { message: 'Announcement updated' }
  },

  async remove(id) {
    await delay(60)
    db.remove('announcements', (a) => a.id === id)
    return { message: 'Announcement deleted' }
  },
}
