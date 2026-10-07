import { db } from '../data/index.js'
import { authService } from './auth.service.js'

const delay = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

export const resumeService = {
  async getResume(userId) {
    await delay()
    let targetId = userId
    if (!targetId) {
      const session = await authService.getSession()
      targetId = session.data.id
    }
    const resumes = db.get('resumes')
    const resume = resumes.find((r) => r.userId === targetId) || resumes[0]

    return { data: resume }
  },

  async uploadResume(fileData) {
    await delay(180)
    const session = await authService.getSession()
    const user = session.data

    const newResume = {
      id: `res_${Date.now()}`,
      userId: user.id,
      fileName: fileData.name || 'Student_Resume_2026.pdf',
      fileSize: fileData.size ? `${Math.round(fileData.size / 1024)} KB` : '512 KB',
      uploadedAt: new Date().toISOString(),
      fileType: 'application/pdf',
      parsedSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'System Design', 'Git'],
      experienceSummary: 'Coursework projects in full-stack web and distributed systems.',
      educationSummary: `${user.department || 'B.Tech'} (Class of ${user.graduationYear || 2026})`,
      atsScore: 86,
      strengths: [
        'Well organized sections with strong action verbs',
        'Demonstrates quantifiable technical impact in project bullet points',
      ],
      improvements: [
        'Add links to live deployments or demo videos alongside GitHub links',
      ],
      previewText: `${user.name.toUpperCase()}\n${user.email} | Vidyalankar Institute of Technology\n\nEDUCATION\n${user.department || 'B.Tech CSE'} (Graduation: ${user.graduationYear || 2026})\n\nSKILLS\nReact, TypeScript, Node.js, SQL, Distributed Systems, Git\n\nPROJECTS\nCampus Food Delivery Platform\n• Built real-time WebSockets tracking engine.\n• Designed scalable REST APIs and relational database models.`,
    }

    // Replace or insert
    const existing = db.get('resumes')
    const hasExisting = existing.some((r) => r.userId === user.id)
    if (hasExisting) {
      db.update('resumes', (r) => r.userId === user.id, () => newResume)
    } else {
      db.insert('resumes', newResume)
    }

    return { data: newResume, message: 'Resume uploaded and analyzed successfully' }
  },

  async deleteResume(resumeId) {
    await delay(80)
    db.remove('resumes', (r) => r.id === resumeId)
    return { message: 'Resume deleted successfully' }
  },
}
