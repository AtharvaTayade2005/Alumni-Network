import { api } from './http.js'
import { db } from '../data/index.js'

export const announcementService = {
  async list(params = {}) {
    try {
      const res = await api.get('/announcements', { params })
      if (Array.isArray(res.data)) {
        return res
      }
    } catch {
      // offline fallback
    }

    let announcements = db.get('announcements') || []
    if (params.status) {
      announcements = announcements.filter((a) => a.status === params.status)
    } else if (!params.includeDrafts) {
      announcements = announcements.filter((a) => a.status === 'published')
    }
    if (params.department && params.department !== 'University-Wide') {
      announcements = announcements.filter((a) => a.department === params.department || a.department === 'University-Wide')
    }
    return {
      data: announcements,
      meta: { total: announcements.length },
    }
  },

  async byId(id) {
    try {
      const res = await api.get(`/announcements/${id}`)
      if (res.data) return res
    } catch {
      // fallback
    }
    const item = (db.get('announcements') || []).find((a) => a.id === id)
    return { data: item }
  },

  async create(payload) {
    // Real backend API call persists to PostgreSQL
    const res = await api.post('/announcements', payload)
    return res
  },

  async update(id, payload) {
    const res = await api.patch(`/announcements/${id}`, payload)
    return res
  },

  async remove(id) {
    const res = await api.delete(`/announcements/${id}`)
    return res
  },
}
