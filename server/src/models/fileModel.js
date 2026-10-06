import { query } from '../config/database.js'

/**
 * Stored-file metadata.
 *
 * The bytes live in the storage driver; this table holds only what is needed to
 * find them and to decide who may read them. `storage_key` is the single value that
 * ever reaches a driver, and `original_filename` is display text only.
 *
 * Mapping is here so a storage key, which is a server-side secret in the sense that
 * knowing it is useless without permission, never has to be formatted by a caller.
 */
export function formatStoredFile(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    filename: row.original_filename,
    contentType: row.content_type,
    size: row.byte_size,
    // A path, not a URL. It is still a permission-checked request: the route
    // re-reads the row and re-decides on every call, so it grants nothing on its own.
    downloadPath: `/api/files/${row.id}/download`,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  }
}

export async function insertStoredFile({
  ownerId, kind, storageDriver, storageKey, originalFilename,
  contentType, byteSize, checksumSha256,
}) {
  const { rows } = await query(
    `INSERT INTO stored_files (owner_id, kind, storage_driver, storage_key,
       original_filename, content_type, byte_size, checksum_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [ownerId, kind, storageDriver, storageKey, originalFilename,
      contentType, byteSize, checksumSha256],
  )
  return rows[0]
}

/** Includes soft state only: a file row is either present or gone. */
export async function findStoredFileById(id) {
  const { rows } = await query('SELECT * FROM stored_files WHERE id = $1', [id])
  return rows[0] ?? null
}

export async function listStoredFilesForOwner(ownerId, { limit = 20, offset = 0 } = {}) {
  const { rows: counts } = await query(
    'SELECT COUNT(*)::int AS c FROM stored_files WHERE owner_id = $1', [ownerId],
  )
  const { rows } = await query(
    `SELECT * FROM stored_files WHERE owner_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [ownerId, limit, offset],
  )
  return { rows, total: counts[0].c }
}

export async function deleteStoredFile(id) {
  const { rows } = await query(
    'DELETE FROM stored_files WHERE id = $1 RETURNING *', [id],
  )
  return rows[0] ?? null
}

/**
 * The applications a file is attached to.
 *
 * Deleting a file that is on an application would leave that application with no
 * resume at all, which the attachment constraint refuses, so this is asked before
 * a delete and answered by idx_applications_resume_file.
 */
export async function countApplicationsUsingFile(fileId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS c FROM job_applications WHERE resume_file_id = $1',
    [fileId],
  )
  return rows[0].c
}

/**
 * Whether the given user may read a file because they posted a job it is attached
 * to.
 *
 * This is the rule that gives a recruiter access to exactly the applicants who
 * applied to them: the join goes through job_applications, so attaching a resume to
 * an application is what grants the read, and nothing else does.
 */
export async function isFileAttachedToJobPostedBy(fileId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM job_applications a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.resume_file_id = $1 AND j.posted_by = $2
     LIMIT 1`,
    [fileId, userId],
  )
  return rows.length > 0
}

/**
 * The file a profile resume points at.
 *
 * Students keep a resume on their profile as well as attaching one to each
 * application, so this is a convenience default rather than a requirement: an
 * application can be sent without ever touching the profile.
 */
export async function findProfileResume(userId) {
  const { rows } = await query(
    `SELECT f.* FROM student_profiles sp
     JOIN stored_files f ON f.id = sp.resume_file_id
     WHERE sp.user_id = $1`,
    [userId],
  )
  return rows[0] ?? null
}

/**
 * Points a profile at a file and returns the file it had before, so the caller can
 * clean up the old one once the new reference has landed.
 *
 * The previous id is read in a CTE rather than from `RETURNING`, because `RETURNING`
 * gives the row's new value: asking the statement for `resume_file_id` after the update
 * returns the file just set, which would look like "replaced by itself" and leave the
 * replaced file on disk forever.
 */
export async function setProfileResume(userId, fileId) {
  const { rows } = await query(
    `WITH previous AS (
       SELECT resume_file_id FROM student_profiles WHERE user_id = $1
     )
     UPDATE student_profiles
     SET resume_file_id = $2,
         resume_url = NULL,
         resume_filename = (SELECT original_filename FROM stored_files WHERE id = $2)
     WHERE user_id = $1
     RETURNING (SELECT resume_file_id FROM previous) AS previous_resume_file_id`,
    [userId, fileId],
  )
  return rows[0]?.previous_resume_file_id ?? null
}

/** Detaches a profile resume, returning the file row that was pointed at. */
export async function clearProfileResume(userId) {
  const previous = await findProfileResume(userId)
  if (!previous) return null
  await query(
    `UPDATE student_profiles
     SET resume_file_id = NULL, resume_url = NULL, resume_filename = NULL
     WHERE user_id = $1`,
    [userId],
  )
  return previous
}
