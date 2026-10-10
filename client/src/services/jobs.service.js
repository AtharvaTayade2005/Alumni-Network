import { db } from '../data/index.js'
import { authService } from './auth.service.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const jobsService = {
  async list(params = {}) {
    await delay()
    const session = await authService.getSession()
    const currentUserId = session.data.id
    let jobsList = db.get('jobs')
    const savedIds = db.store.savedJobIdsByUser?.[currentUserId] || []
    const applications = db.get('applications')

    // Filter by postedByMe
    if (params.postedByMe === 'true') {
      jobsList = jobsList.filter((j) => j.postedBy?.id === currentUserId)
    } else {
      // Regular board only displays approved active jobs
      if (!params.includePending) {
        jobsList = jobsList.filter((j) => j.moderationStatus === 'approved' || j.postedBy?.id === currentUserId)
      }
    }

    if (params.search) {
      const q = params.search.toLowerCase()
      jobsList = jobsList.filter((j) => (
        j.title.toLowerCase().includes(q) ||
        j.companyName.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.skills?.some((s) => s.name.toLowerCase().includes(q))
      ))
    }

    if (params.workMode) {
      jobsList = jobsList.filter((j) => j.workMode === params.workMode)
    }

    if (params.employmentType) {
      jobsList = jobsList.filter((j) => j.employmentType === params.employmentType)
    }

    if (params.experienceLevel) {
      jobsList = jobsList.filter((j) => j.experienceLevel === params.experienceLevel)
    }

    if (params.location) {
      const loc = params.location.toLowerCase()
      jobsList = jobsList.filter((j) => j.location?.toLowerCase().includes(loc))
    }

    const enhanced = jobsList.map((job) => {
      const hasApplied = applications.some((a) => a.jobId === job.id && a.applicantId === currentUserId)
      const isSaved = savedIds.includes(job.id)
      return {
        ...job,
        hasApplied,
        isSaved,
      }
    })

    const limit = Number(params.limit) || 20
    const page = Number(params.page) || 1
    const total = enhanced.length

    return {
      data: enhanced.slice((page - 1) * limit, page * limit),
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        limit,
      },
    }
  },

  async byId(jobId) {
    await delay()
    const session = await authService.getSession()
    const currentUserId = session.data.id
    const jobsList = db.get('jobs')
    const job = jobsList.find((j) => j.id === jobId) || jobsList[0]
    const savedIds = db.store.savedJobIdsByUser?.[currentUserId] || []
    const applications = db.get('applications')

    const hasApplied = applications.some((a) => a.jobId === job.id && a.applicantId === currentUserId)
    const isSaved = savedIds.includes(job.id)

    return {
      data: {
        ...job,
        hasApplied,
        isSaved,
      },
    }
  },

  async company(companyId) {
    await delay()
    const jobsList = db.get('jobs')
    const companyJobs = jobsList.filter((j) => j.companyId === companyId || j.companyName?.toLowerCase() === companyId?.toLowerCase())
    const first = companyJobs[0] || jobsList[0]

    return {
      data: {
        company: {
          id: companyId,
          name: first.companyName,
          industry: first.industry,
          location: first.location,
          website: first.companyWebsite,
          openJobCount: companyJobs.length,
        },
        jobs: companyJobs,
      },
    }
  },

  async create(payload) {
    await delay(120)
    const session = await authService.getSession()
    const user = session.data

    const newJob = {
      id: `job_${Date.now()}`,
      title: payload.title,
      companyName: payload.companyName,
      companyId: `comp_${payload.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      companyWebsite: payload.companyWebsite || null,
      industry: payload.industry || 'Technology',
      description: payload.description,
      requirements: payload.requirements || 'Relevant experience',
      location: payload.location || 'Location flexible',
      workMode: payload.workMode || 'hybrid',
      employmentType: payload.employmentType || 'full_time',
      experienceLevel: payload.experienceLevel || 'mid',
      salaryMin: payload.salaryMin ? Number(payload.salaryMin) : null,
      salaryMax: payload.salaryMax ? Number(payload.salaryMax) : null,
      salaryCurrency: payload.salaryCurrency || 'INR',
      skills: (payload.skills || []).map((s, i) => ({ id: `sk_${i}`, name: s })),
      status: payload.status || 'active',
      moderationStatus: 'approved',
      postedBy: {
        id: user.id,
        name: user.name,
        position: user.headline || 'Member',
        isAlumni: user.roles?.includes('ALUMNI'),
      },
      postedAt: new Date().toISOString(),
      deadline: payload.deadline || new Date(Date.now() + 30 * 86400000).toISOString(),
      applicantCount: 0,
      recommendedForRoles: ['STUDENT'],
    }

    db.insert('jobs', newJob)
    return { data: newJob, message: 'Job posted successfully' }
  },

  async save(jobId) {
    await delay(50)
    const session = await authService.getSession()
    const userId = session.data.id
    if (!db.store.savedJobIdsByUser) db.store.savedJobIdsByUser = {}
    if (!db.store.savedJobIdsByUser[userId]) db.store.savedJobIdsByUser[userId] = []
    if (!db.store.savedJobIdsByUser[userId].includes(jobId)) {
      db.store.savedJobIdsByUser[userId].push(jobId)
      db.save()
    }
    return { message: 'Job saved to your list' }
  },

  async unsave(jobId) {
    await delay(50)
    const session = await authService.getSession()
    const userId = session.data.id
    if (db.store.savedJobIdsByUser?.[userId]) {
      db.store.savedJobIdsByUser[userId] = db.store.savedJobIdsByUser[userId].filter((id) => id !== jobId)
      db.save()
    }
    return { message: 'Job removed from saved list' }
  },

  async saved() {
    await delay()
    const session = await authService.getSession()
    const userId = session.data.id
    const savedIds = db.store.savedJobIdsByUser?.[userId] || []
    const jobsList = db.get('jobs')
    const savedJobs = jobsList.filter((j) => savedIds.includes(j.id)).map((j) => ({ ...j, isSaved: true }))

    return {
      data: savedJobs,
      meta: { total: savedJobs.length },
    }
  },

  async apply(jobId, payload) {
    await delay(120)
    const session = await authService.getSession()
    const user = session.data
    const jobsList = db.get('jobs')
    const job = jobsList.find((j) => j.id === jobId)

    const newApplication = {
      id: `app_${Date.now()}`,
      jobId,
      jobTitle: job?.title || 'Job Opening',
      companyName: job?.companyName || 'Company',
      applicantId: user.id,
      applicant: {
        id: user.id,
        name: user.name,
        email: user.email,
        headline: user.headline || 'Student',
        degree: user.department || 'B.Tech',
        graduationYear: user.graduationYear || 2026,
      },
      resumeUrl: payload.resumeUrl || 'https://vit.edu.in/resumes/default.pdf',
      coverLetter: payload.coverLetter || '',
      status: 'submitted',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewerNotes: null,
    }

    db.insert('applications', newApplication)
    db.update('jobs', (j) => j.id === jobId, (j) => ({ ...j, applicantCount: (j.applicantCount || 0) + 1 }))

    return { data: newApplication, message: 'Application submitted successfully' }
  },

  async myApplications() {
    await delay()
    const session = await authService.getSession()
    const userId = session.data.id
    const applications = db.get('applications')
    const myApps = applications.filter((a) => a.applicantId === userId)

    return {
      data: myApps,
      meta: { total: myApps.length },
    }
  },

  async applicationsForJob(jobId) {
    await delay()
    const applications = db.get('applications')
    const forJob = applications.filter((a) => a.jobId === jobId)

    return {
      data: forJob,
      meta: { total: forJob.length },
    }
  },

  async review(jobId, applicationId, status) {
    await delay(80)
    db.update('applications', (a) => a.id === applicationId, (a) => ({
      ...a,
      status,
      updatedAt: new Date().toISOString(),
    }))
    return { message: `Application status updated to ${status}` }
  },

  async withdraw(applicationId) {
    await delay(80)
    db.update('applications', (a) => a.id === applicationId, (a) => ({
      ...a,
      status: 'withdrawn',
      updatedAt: new Date().toISOString(),
    }))
    return { message: 'Application withdrawn' }
  },
}
