import { db } from '../data/index.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const directoryService = {
  async search(params = {}) {
    await delay()
    const users = db.get('users')
    const alumni = db.get('alumni')
    const students = db.get('students')
    const professors = db.get('professors')

    let filtered = users.map((u) => {
      const alum = alumni.find((a) => a.userId === u.id)
      const student = students.find((s) => s.userId === u.id)
      const prof = professors.find((p) => p.userId === u.id)
      return {
        ...u,
        currentCompany: alum?.currentCompany || (prof ? 'Vidyalankar Institute of Technology Faculty' : 'Student'),
        currentPosition: alum?.currentPosition || prof?.designation || 'Student',
        degree: alum?.degree || student?.course || 'Faculty',
        industry: alum?.industry || (prof ? 'Education & Research' : 'Technology'),
        skills: alum?.skills || student?.skills || [],
        openToMentor: Boolean(alum?.openToMentor || prof?.mentorshipAvailability),
        verified: u.verified,
        bio: alum?.bio || student?.careerGoals || prof?.researchInterests?.join(', ') || '',
      }
    })

    // Filter by role if specified
    if (params.role) {
      filtered = filtered.filter((u) => u.roles?.includes(params.role))
    }

    // Filter by search query
    if (params.search) {
      const query = params.search.toLowerCase()
      filtered = filtered.filter((u) => (
        u.name?.toLowerCase().includes(query) ||
        u.currentCompany?.toLowerCase().includes(query) ||
        u.currentPosition?.toLowerCase().includes(query) ||
        u.headline?.toLowerCase().includes(query) ||
        u.department?.toLowerCase().includes(query) ||
        u.skills?.some((s) => s.name?.toLowerCase().includes(query))
      ))
    }

    // Filter by graduation year
    if (params.graduationYear) {
      filtered = filtered.filter((u) => String(u.graduationYear) === String(params.graduationYear))
    }

    // Filter by industry
    if (params.industry) {
      filtered = filtered.filter((u) => u.industry?.toLowerCase() === params.industry.toLowerCase())
    }

    // Filter by country
    if (params.country) {
      filtered = filtered.filter((u) => u.country?.toLowerCase() === params.country.toLowerCase())
    }

    // Filter by openToMentor
    if (params.openToMentor) {
      filtered = filtered.filter((u) => u.openToMentor)
    }

    // Filter by verified
    if (params.verifiedOnly) {
      filtered = filtered.filter((u) => u.verified)
    }

    // Filter by skill
    if (params.skills) {
      const skillTerm = params.skills.toLowerCase()
      filtered = filtered.filter((u) => u.skills?.some((s) => s.name?.toLowerCase().includes(skillTerm)))
    }

    const page = Number(params.page) || 1
    const limit = Number(params.limit) || 12
    const total = filtered.length
    const pages = Math.ceil(total / limit) || 1
    const offset = (page - 1) * limit
    const paged = filtered.slice(offset, offset + limit)

    return {
      data: paged,
      meta: {
        total,
        page,
        totalPages: pages,
        limit,
        hasNext: page < pages,
        hasPrev: page > 1,
      },
    }
  },

  async getFilters() {
    await delay()
    return {
      data: {
        graduationYears: [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016],
        industries: ['Technology', 'E-commerce', 'Fintech', 'Education & Research', 'Consulting', 'Healthcare'],
        countries: ['India', 'United States', 'United Kingdom', 'Germany', 'Singapore'],
        departments: ['Computer Science', 'Information Technology', 'Electronics', 'Business Administration'],
      },
    }
  },

  async getById(userId) {
    await delay()
    const users = db.get('users')
    const alumni = db.get('alumni')
    const students = db.get('students')
    const professors = db.get('professors')

    const user = users.find((u) => u.id === userId) || users[0]
    const alum = alumni.find((a) => a.userId === user.id)
    const student = students.find((s) => s.userId === user.id)
    const prof = professors.find((p) => p.userId === user.id)

    return {
      data: {
        user,
        alumni: alum,
        student,
        professor: prof,
        skills: alum?.skills || student?.skills || [],
        connectionState: 'none',
      },
    }
  },
}
