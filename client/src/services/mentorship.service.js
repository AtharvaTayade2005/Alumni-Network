import { db } from '../data/index.js'
import { authService } from './auth.service.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const mentorshipService = {
  async getMentors(params = {}) {
    await delay()
    const users = db.get('users')
    const alumni = db.get('alumni')

    let mentors = alumni
      .filter((a) => a.openToMentor)
      .map((a) => {
        const u = users.find((usr) => usr.id === a.userId)
        return {
          id: a.userId,
          name: a.name,
          email: a.email,
          currentPosition: a.currentPosition,
          currentCompany: a.currentCompany,
          graduationYear: a.graduationYear,
          industry: a.industry,
          bio: a.bio,
          skills: a.skills,
          openSlots: a.mentorSlotsAvailable ?? 1,
          totalSlots: a.mentorSlotsTotal ?? 3,
          mentorshipAreas: a.mentorshipAreas || [],
          avatarUrl: u?.avatarUrl || null,
        }
      })

    if (params.search) {
      const q = params.search.toLowerCase()
      mentors = mentors.filter((m) => (
        m.name.toLowerCase().includes(q) ||
        m.currentCompany.toLowerCase().includes(q) ||
        m.currentPosition.toLowerCase().includes(q) ||
        m.mentorshipAreas.some((area) => area.toLowerCase().includes(q))
      ))
    }

    return {
      data: mentors,
      meta: { total: mentors.length, page: 1, pages: 1 },
    }
  },

  async getRequests() {
    await delay()
    const session = await authService.getSession()
    const currentUserId = session.data.id
    const requests = db.get('mentorshipRequests')

    // Requests where current user is either mentor (incoming) or student (outgoing)
    const userRequests = requests
      .filter((r) => r.mentorId === currentUserId || r.studentId === currentUserId)
      .map((r) => {
        const isIncoming = r.mentorId === currentUserId
        const peer = isIncoming ? r.student : r.mentor
        return {
          ...r,
          direction: isIncoming ? 'incoming' : 'outgoing',
          peer: {
            id: peer.id,
            name: peer.name,
            currentPosition: peer.course || peer.position,
            currentCompany: peer.company || 'Vidyalankar Institute of Technology Student',
            avatarUrl: peer.avatarUrl || null,
          },
        }
      })

    return {
      data: userRequests,
      meta: { total: userRequests.length },
    }
  },

  async request(payload) {
    await delay(100)
    const session = await authService.getSession()
    const currentUser = session.data
    const users = db.get('users')
    const mentorUser = users.find((u) => u.id === payload.mentorId)

    const newRequest = {
      id: `mreq_${Date.now()}`,
      mentorId: payload.mentorId,
      mentor: {
        id: mentorUser?.id || payload.mentorId,
        name: mentorUser?.name || 'Alumni Mentor',
        position: mentorUser?.headline || 'Mentor',
        company: mentorUser?.currentCompany || 'Company',
        avatarUrl: null,
      },
      studentId: currentUser.id,
      student: {
        id: currentUser.id,
        name: currentUser.name,
        course: currentUser.department || 'B.Tech Student',
        year: 'Student',
        email: currentUser.email,
        avatarUrl: null,
      },
      careerGoal: payload.careerGoal,
      areaOfInterest: payload.areaOfInterest || 'General Mentorship',
      preferredMode: payload.preferredMode || 'video',
      message: payload.message || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
      responseNote: null,
    }

    db.insert('mentorshipRequests', newRequest)
    return { data: newRequest, message: 'Mentorship request sent successfully' }
  },

  async respond(requestId, payload) {
    await delay(100)
    const { status, responseNote } = payload // 'accepted' | 'declined'

    db.update('mentorshipRequests', (r) => r.id === requestId, (r) => {
      const updated = {
        ...r,
        status,
        responseNote: responseNote || null,
        respondedAt: new Date().toISOString(),
      }

      // If accepted, add to active mentorships
      if (status === 'accepted') {
        db.insert('activeMentorships', {
          id: `ment_${Date.now()}`,
          requestId: r.id,
          mentorId: r.mentorId,
          mentor: {
            id: r.mentor.id,
            name: r.mentor.name,
            currentPosition: r.mentor.position,
            currentCompany: r.mentor.company,
            avatarUrl: null,
          },
          studentId: r.studentId,
          student: {
            id: r.student.id,
            name: r.student.name,
            currentPosition: r.student.course,
            currentCompany: 'Vidyalankar Institute of Technology',
            avatarUrl: null,
          },
          areaOfInterest: r.areaOfInterest,
          preferredMode: r.preferredMode,
          status: 'active',
          startedAt: new Date().toISOString(),
          endedAt: null,
          endReason: null,
          sessionCount: 1,
          nextSession: new Date(Date.now() + 7 * 86400000).toISOString(),
          goalsCompleted: [],
        })
      }

      return updated
    })

    return { message: `Request ${status} successfully` }
  },

  async cancel(requestId) {
    await delay(50)
    db.remove('mentorshipRequests', (r) => r.id === requestId)
    return { message: 'Request cancelled' }
  },

  async getMentorships() {
    await delay()
    const session = await authService.getSession()
    const currentUserId = session.data.id
    const mentorships = db.get('activeMentorships')

    const userMentorships = mentorships
      .filter((m) => m.mentorId === currentUserId || m.studentId === currentUserId)
      .map((m) => {
        const isMentor = m.mentorId === currentUserId
        const peer = isMentor ? m.student : m.mentor
        return {
          ...m,
          role: isMentor ? 'mentor' : 'mentee',
          peer: {
            id: peer.id,
            name: peer.name,
            currentPosition: peer.currentPosition,
            currentCompany: peer.currentCompany,
            avatarUrl: peer.avatarUrl || null,
          },
        }
      })

    return {
      data: userMentorships,
      meta: { total: userMentorships.length },
    }
  },

  async complete(mentorshipId) {
    await delay(80)
    db.update('activeMentorships', (m) => m.id === mentorshipId, (m) => ({
      ...m,
      status: 'completed',
      endedAt: new Date().toISOString(),
      endReason: 'Completed structured mentorship milestones.',
    }))
    return { message: 'Mentorship marked as completed' }
  },

  async end(mentorshipId) {
    await delay(80)
    db.update('activeMentorships', (m) => m.id === mentorshipId, (m) => ({
      ...m,
      status: 'ended',
      endedAt: new Date().toISOString(),
      endReason: 'Concluded by participant.',
    }))
    return { message: 'Mentorship ended' }
  },
}
