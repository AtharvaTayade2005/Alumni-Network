import * as jobModel from '../models/backgroundJobModel.js'
import { dateOnly } from '../models/eventModel.js'
import { runEventSweeps } from './eventService.js'
import { query } from '../config/database.js'
import config from '../config/env.js'
import logger from '../utils/logger.js'

/**
 * The scheduler.
 *
 * Its only real responsibility is making sure a job runs once, and saying what
 * happened. Everything a job actually does belongs in a service; everything about
 * *when* it runs belongs here. The two are separated so a test can call the job
 * directly, without an interval and without waiting for a claim.
 *
 * Idempotency is layered, deliberately:
 *
 *   1. The run key stops two processes running the same window at all. It is the
 *      primary key of `background_jobs`, so the claim is atomic.
 *   2. The dedupe key on each notification stops the same person being told
 *      twice even if the first layer is bypassed or the run is reaped and retried.
 *
 * Either layer alone would leave a gap. The claim alone would let a reaped run
 * resend; the dedupe keys alone would let two processes race through the same
 * work and only be stopped at the last write.
 */

let timer = null
let running = false

/**
 * Runs one job once, recording the outcome in the ledger.
 *
 * A job that is already claimed is reported as skipped rather than queued: the
 * holder is either running or dead, and the reaper decides which.
 */
export async function runJob({ name, runKey, work }) {
  const claim = await jobModel.claimRun(runKey, name, {
    staleAfterMinutes: config.scheduler.staleRunMinutes,
  })
  if (!claim) {
    logger.info('background job already claimed for this window', { name, runKey })
    return { name, runKey, status: 'skipped' }
  }

  try {
    const result = await work()
    await jobModel.finishRun(runKey, { status: 'succeeded', result })
    logger.info('background job finished', { name, runKey, result })
    return { name, runKey, status: 'succeeded', result }
  } catch (error) {
    await jobModel.finishRun(runKey, { status: 'failed', error: error.message })
    logger.error('background job failed', { name, runKey, error: error.message })
    return { name, runKey, status: 'failed', error: error.message }
  }
}

/**
 * The day's event work: reminders for what is coming, and closing off what is over.
 *
 * The run key carries the date, so each day gets one run of its own and a restart
 * in the middle of the afternoon does not skip the evening's reminders.
 */
export async function runEventSweepsJob({ now = new Date() } = {}) {
  const day = dateOnly(now)
  return runJob({
    name: 'event-sweeps',
    runKey: `event-sweeps:${day}`,
    work: () => runEventSweeps({ now }),
  })
}

/**
 * Frees run keys whose holder never came back.
 *
 * This is the one job with no claim of its own, which is why it is safe: it only
 * ever touches rows older than the stale window, so it cannot reclaim a run that
 * is genuinely in progress.
 */
export async function reapStaleRunsJob() {
  const reaped = await jobModel.reapStaleRuns(config.scheduler.staleRunMinutes)
  if (reaped) logger.warn('reclaimed background runs that never finished', { reaped })
  return { reaped }
}

/** One pass over every job, in the order they depend on each other. */
export async function runAllJobs({ now = new Date() } = {}) {
  return {
    reaped: await reapStaleRunsJob(),
    events: await runEventSweepsJob({ now }),
  }
}

/**
 * Starts the interval.
 *
 * The timer is unref'd so it never holds a process open on its own, and the first
 * pass runs immediately rather than one interval later: a server that starts at
 * 23:50 should still send the reminders for tomorrow morning.
 *
 * `now` is the clock for that first pass and nothing else. Every later pass reads
 * the clock again, because the run key carries the day: a scheduler that reuses
 * the time it started would keep computing today's key every fifteen minutes
 * until tomorrow, and tomorrow's reminders would never be sent at all.
 */
export function startScheduler({ now = null } = {}) {
  if (!config.scheduler.enabled) {
    logger.info('scheduler disabled')
    return null
  }
  if (timer) return timer

  const pass = async (at = new Date()) => {
    if (running) return
    running = true
    try {
      await runAllJobs({ now: at })
    } catch (error) {
      logger.error('scheduler pass failed', { error: error.message })
    } finally {
      running = false
    }
  }

  timer = setInterval(() => pass(), config.scheduler.intervalMs)
  timer.unref?.()
  pass(now ?? new Date())
  logger.info('scheduler started', { intervalMs: config.scheduler.intervalMs })
  return timer
}

export function stopScheduler() {
  if (!timer) return false
  clearInterval(timer)
  timer = null
  logger.info('scheduler stopped')
  return true
}

export function schedulerRunning() {
  return timer !== null
}

/**
 * A one-line health answer for the diagnostics endpoint.
 *
 * It reports what the ledger holds rather than what the process believes, because
 * the ledger is the part that survives a restart.
 */
export async function schedulerStatus() {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = 'running')     AS running,
            COUNT(*) FILTER (WHERE status = 'failed')      AS failed,
            COUNT(*) FILTER (WHERE status = 'succeeded')   AS succeeded,
            MAX(started_at)                                AS last_started
       FROM background_jobs`,
  )
  return {
    enabled: config.scheduler.enabled,
    intervalMs: config.scheduler.intervalMs,
    inProcess: schedulerRunning(),
    ...(rows[0] ?? {}),
  }
}