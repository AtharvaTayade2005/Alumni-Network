import { query } from '../config/database.js'
import { notFound, forbidden } from '../utils/errors.js'

export function formatRoadmap(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    targetRole: row.target_role,
    jobId: row.job_id,
    readinessScore: row.readiness_score,
    summary: row.summary,
    skillsGap: typeof row.skills_gap === 'string' ? JSON.parse(row.skills_gap) : (row.skills_gap || {}),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function formatTask(row) {
  if (!row) return null
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    userId: row.user_id,
    stage: row.stage,
    stageOrder: row.stage_order,
    taskOrder: row.task_order,
    title: row.title,
    description: row.description,
    skillFocus: row.skill_focus,
    priority: row.priority,
    estimatedDuration: row.estimated_duration,
    completionCriteria: Array.isArray(row.completion_criteria) ? row.completion_criteria : [],
    learningActivity: row.learning_activity,
    practiceProject: row.practice_project,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Gets the most recent roadmap for a user, optionally filtered by targetRole or jobId
 */
export async function getLatestRoadmapForUser(userId, { targetRole, jobId } = {}) {
  let sql = 'SELECT * FROM career_roadmaps WHERE user_id = $1'
  const params = [userId]

  if (jobId) {
    params.push(jobId)
    sql += ` AND job_id = $${params.length}`
  } else if (targetRole) {
    params.push(targetRole.toLowerCase().trim())
    sql += ` AND LOWER(target_role) = $${params.length}`
  }

  sql += ' ORDER BY updated_at DESC LIMIT 1'

  const { rows } = await query(sql, params)
  return formatRoadmap(rows[0])
}

/**
 * Gets a roadmap and all its tasks, verifying ownership
 */
export async function getRoadmapWithTasks(roadmapId, userId) {
  const { rows: roadmapRows } = await query(
    'SELECT * FROM career_roadmaps WHERE id = $1',
    [roadmapId],
  )
  if (!roadmapRows[0]) {
    throw notFound('Career roadmap')
  }

  const roadmap = formatRoadmap(roadmapRows[0])
  if (roadmap.userId !== userId) {
    throw forbidden('You do not have access to this roadmap')
  }

  const { rows: taskRows } = await query(
    `SELECT * FROM roadmap_tasks
     WHERE roadmap_id = $1
     ORDER BY stage_order ASC, task_order ASC, created_at ASC`,
    [roadmapId],
  )

  const tasks = taskRows.map(formatTask)
  const stats = calculateRoadmapStats(tasks)

  return {
    ...roadmap,
    tasks,
    stats,
  }
}

/**
 * Persists a new roadmap and its generated tasks
 */
export async function saveRoadmapWithTasks({
  userId,
  targetRole,
  jobId = null,
  readinessScore = 0,
  summary = '',
  skillsGap = {},
  metadata = {},
  version = 1,
  tasks = [],
}) {
  const client = await query(
    `INSERT INTO career_roadmaps (
       user_id, target_role, job_id, readiness_score, summary, skills_gap, metadata, version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      targetRole,
      jobId,
      Math.max(0, Math.min(100, Math.round(readinessScore))),
      summary,
      JSON.stringify(skillsGap),
      JSON.stringify(metadata),
      version,
    ],
  )

  const roadmap = formatRoadmap(client.rows[0])

  const savedTasks = []
  for (const t of tasks) {
    const { rows: taskRows } = await query(
      `INSERT INTO roadmap_tasks (
         roadmap_id, user_id, stage, stage_order, task_order,
         title, description, skill_focus, priority, estimated_duration,
         completion_criteria, learning_activity, practice_project,
         is_completed, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        roadmap.id,
        userId,
        t.stage || 'Core Skills',
        t.stageOrder || 1,
        t.taskOrder || 1,
        t.title,
        t.description,
        t.skillFocus || null,
        ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
        t.estimatedDuration || '1-2 weeks',
        Array.isArray(t.completionCriteria) ? t.completionCriteria : [],
        t.learningActivity || null,
        t.practiceProject || null,
        Boolean(t.isCompleted),
        t.isCompleted ? (t.completedAt || new Date()) : null,
      ],
    )
    savedTasks.push(formatTask(taskRows[0]))
  }

  const stats = calculateRoadmapStats(savedTasks)

  return {
    ...roadmap,
    tasks: savedTasks,
    stats,
  }
}

/**
 * Updates task completion status with tenant ownership enforcement
 */
export async function updateTaskStatus({ taskId, userId, isCompleted }) {
  const { rows: existing } = await query(
    'SELECT * FROM roadmap_tasks WHERE id = $1',
    [taskId],
  )
  if (!existing[0]) {
    throw notFound('Roadmap task')
  }

  if (existing[0].user_id !== userId) {
    throw forbidden('You cannot modify another user\'s roadmap task')
  }

  const { rows } = await query(
    `UPDATE roadmap_tasks
     SET is_completed = $1,
         completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [isCompleted, taskId, userId],
  )

  const updatedTask = formatTask(rows[0])

  // Recalculate roadmap-level stats
  const { rows: allTasks } = await query(
    `SELECT * FROM roadmap_tasks WHERE roadmap_id = $1 ORDER BY stage_order ASC, task_order ASC`,
    [updatedTask.roadmapId],
  )
  const stats = calculateRoadmapStats(allTasks.map(formatTask))

  return {
    task: updatedTask,
    stats,
  }
}

/**
 * Retrieves all previously completed tasks for a user to reconcile during roadmap regeneration
 */
export async function getCompletedTasksForUser(userId) {
  const { rows } = await query(
    `SELECT * FROM roadmap_tasks WHERE user_id = $1 AND is_completed = true`,
    [userId],
  )
  return rows.map(formatTask)
}

/**
 * Helper to compute task completion progress & stats
 */
export function calculateRoadmapStats(tasks = []) {
  const total = tasks.length
  const completed = tasks.filter((t) => t.isCompleted).length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  const stagesMap = new Map()
  for (const t of tasks) {
    const stage = t.stage || 'General'
    if (!stagesMap.has(stage)) {
      stagesMap.set(stage, { stage, total: 0, completed: 0, order: t.stageOrder || 99 })
    }
    const entry = stagesMap.get(stage)
    entry.total += 1
    if (t.isCompleted) entry.completed += 1
  }

  const stages = [...stagesMap.values()].sort((a, b) => a.order - b.order)

  return {
    totalTasks: total,
    completedTasks: completed,
    remainingTasks: total - completed,
    progressPercentage: percentage,
    stages,
  }
}
