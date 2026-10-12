import { query } from '../config/database.js'
import { forbidden } from '../utils/errors.js'
import { ROLES, hasAnyRole } from '../middleware/rbac.js'

export async function getProfessorAnalytics(user) {
  if (!user) throw forbidden('Authentication required')
  if (!hasAnyRole(user, ROLES.PROFESSOR, ROLES.FACULTY, ROLES.ADMIN)) {
    throw forbidden('Only faculty members and administrators may view student advising analytics')
  }

  const professorId = user.id

  // 1. Total student cohort count
  const { rows: studentCountRows } = await query(`
    SELECT COUNT(DISTINCT u.id)::int AS count
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE LOWER(r.name) = 'student' AND u.is_active = TRUE AND u.is_suspended = FALSE
  `)
  const totalStudents = studentCountRows[0]?.count ?? 0

  // 2. Active mentorship relationships for this professor
  const { rows: activeMenteesRows } = await query(`
    SELECT COUNT(*)::int AS count
    FROM mentorship_relationships
    WHERE mentor_id = $1 AND status = 'active'
  `, [professorId])
  const activeMentees = activeMenteesRows[0]?.count ?? 0

  // 3. Pending advising / mentorship requests
  const { rows: pendingRequestsRows } = await query(`
    SELECT COUNT(*)::int AS count
    FROM mentorship_requests
    WHERE mentor_id = $1 AND status = 'pending'
  `, [professorId])
  const pendingRequests = pendingRequestsRows[0]?.count ?? 0

  // 4. Completed mentorships / advised alumni
  const { rows: completedRows } = await query(`
    SELECT COUNT(*)::int AS count
    FROM mentorship_relationships
    WHERE mentor_id = $1 AND status = 'completed'
  `, [professorId])
  const completedMentees = completedRows[0]?.count ?? 0

  // 5. Total announcements broadcasted
  const { rows: announcementsRows } = await query(`
    SELECT COUNT(*)::int AS count
    FROM announcements
    WHERE author_id = $1
  `, [professorId])
  const announcementsPublished = announcementsRows[0]?.count ?? 0

  // 6. Cohort distribution across academic years
  const { rows: cohortRows } = await query(`
    SELECT COALESCE(sp.degree, 'B.Tech Computer Science') AS degree,
           COALESCE(sp.graduation_year, 2026) AS graduation_year,
           COUNT(*)::int AS count
    FROM student_profiles sp
    GROUP BY sp.degree, sp.graduation_year
    ORDER BY sp.graduation_year ASC
    LIMIT 10
  `)

  // 7. Recent student advising activities
  const { rows: activityRows } = await query(`
    SELECT r.id, r.status, r.career_goal, r.area_of_interest, r.created_at,
           u.first_name, u.last_name, u.email,
           CONCAT(u.first_name, ' ', u.last_name) AS student_name,
           sp.degree, sp.year_of_study
    FROM mentorship_requests r
    JOIN users u ON u.id = r.mentee_id
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    WHERE r.mentor_id = $1
    ORDER BY r.created_at DESC
    LIMIT 8
  `, [professorId])

  return {
    metrics: {
      totalStudents,
      activeMentees,
      pendingRequests,
      completedMentees,
      announcementsPublished,
    },
    cohortBreakdown: cohortRows,
    recentAdvisingActivity: activityRows.map((r) => ({
      id: r.id,
      status: r.status ? r.status.toUpperCase() : 'PENDING',
      studentName: r.student_name,
      studentEmail: r.email,
      degree: r.degree || 'B.Tech Computer Science',
      yearOfStudy: r.year_of_study ? `Year ${r.year_of_study}` : '3rd Year',
      careerGoal: r.career_goal,
      areaOfInterest: r.area_of_interest,
      createdAt: r.created_at,
    })),
    dataScope: {
      institution: 'Vidyalankar Institute of Technology',
      department: user.department || 'Computer Science & Engineering',
      professorName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      academicGradingNote: 'Academic grades, transcripts, and official classroom attendance are managed via the university ERP system and are not tracked in the portal database.',
    },
  }
}
