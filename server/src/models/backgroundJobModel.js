import { query } from '../config/database.js'

/**
 * The background job ledger.
 *
 * A scheduled job is identified by its run key: the job name plus the window it
 * is covering, such as `event-sweeps:2026-02-14`. The key is the primary key,
 * so claiming one is a single INSERT and exactly one runner can ever hold it.
 * That is the whole point: a reminder that runs twice sends two emails, and no
 * amount of care in the job itself stops two processes from both believing they
 * are the first.
 *
 * Rows are never deleted here. The ledger is how a duplicate send gets explained
 * after the fact, so a window keeps its row for its whole life and a retry
 * re-claims that row rather than adding another.
 */

const staleInterval = (minutes) => `${Math.max(1, Number(minutes) || 60)} minutes`

/**
 * Claims a run, or reports that somebody else already has it.
 *
 * Two cases, in order:
 *
 *   1. The window has no row. The ON CONFLICT DO NOTHING is the lock: a second
 *      runner inserting the same key stores nothing and learns the run is taken,
 *      which is cheaper and clearer than a SELECT followed by an INSERT that
 *      might lose the same race.
 *   2. The window has a row, but it is older than the stale window. The previous
 *      attempt died, so this one takes it over and bumps `attempts`. Without this
 *      a crash would disable the job for the rest of the day, because the key it
 *      left behind could never be claimed again.
 *
 * A run that failed recently is left alone: it is not stale, so a mailer outage
 * is not retried in a tight loop. That is the difference between "retry what
 * died" and "retry what failed".
 */
export async function claimRun(runKey, jobName, { staleAfterMinutes = 60 } = {}) {
  const inserted = await query(
    `INSERT INTO background_jobs (run_key, job_name)
     VALUES ($1, $2)
     ON CONFLICT (run_key) DO NOTHING
     RETURNING *`,
    [runKey, jobName],
  )
  if (inserted.rows[0]) return inserted.rows[0]

  const takenOver = await query(
    `UPDATE background_jobs
        SET status = 'running',
            attempts = attempts + 1,
            started_at = NOW(),
            finished_at = NULL,
            result = NULL,
            error = NULL
      WHERE run_key = $1
        AND started_at < NOW() - $2::interval
      RETURNING *`,
    [runKey, staleInterval(staleAfterMinutes)],
  )
  return takenOver.rows[0] ?? null
}

/**
 * Records how a run ended.
 *
 * A failed run keeps its key, so the next tick will not retry it while it is still
 * recent; that is deliberate. A reminder that failed because the mailer was down
 * should not be retried in a loop, and an operator can see what happened.
 */
export async function finishRun(runKey, { status, result = null, error = null }) {
  const { rows } = await query(
    `UPDATE background_jobs
        SET status = $2,
            result = $3::jsonb,
            error = $4,
            finished_at = NOW()
      WHERE run_key = $1
        AND status = 'running'
      RETURNING *`,
    [runKey, status, result ? JSON.stringify(result) : null, error],
  )
  return rows[0] ?? null
}

/**
 * Closes off runs whose holder never came back.
 *
 * This does not release the key: claiming already takes over a stale window, and
 * doing it in two places would mean two definitions of "stale". What reaping adds
 * is the outcome. A run stuck at `running` forever tells an operator nothing,
 * whereas `failed` with an explanation says the process died mid-job, and the
 * retry that follows still happens because the row is old enough to be claimed.
 */
export async function reapStaleRuns(olderThanMinutes = 60) {
  const { rowCount } = await query(
    `UPDATE background_jobs
        SET status = 'failed',
            error = COALESCE(error, 'run never finished; process did not report back'),
            finished_at = NOW()
      WHERE status = 'running'
        AND started_at < NOW() - $1::interval`,
    [staleInterval(olderThanMinutes)],
  )
  return rowCount ?? 0
}

/** The recent ledger, newest first. Used by the operator-facing diagnostics. */
export async function recentRuns(limit = 50) {
  const { rows } = await query(
    `SELECT * FROM background_jobs
      ORDER BY started_at DESC
      LIMIT $1`,
    [limit],
  )
  return rows
}