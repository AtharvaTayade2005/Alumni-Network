import crypto from 'node:crypto'
import * as fileModel from '../models/fileModel.js'
import * as storageService from './storageService.js'
import { getStorageDriver } from './storageService.js'
import * as auditService from './auditService.js'
import { conflict, notFound, unprocessable, AppError } from '../utils/errors.js'
import { ROLES, hasRole } from '../middleware/rbac.js'

/**
 * Uploaded files: resumes and, later, other attachments.
 *
 * Nothing here is ever served from a public path. Every read goes through
 * `canRead`, which is the only place that decides access, and both the metadata and
 * the download endpoint call it. The storage key is never returned to a client, so a
 * captured response cannot be replayed against the filesystem directly.
 *
 * Who may read a file:
 *
 *   * its owner
 *   * an administrator
 *   * the poster of a job the file is attached to, which is what gives a recruiter
 *     access to the applicants who applied to them and nothing else
 *
 * A member who may not read a file gets the same 404 as a member asking for a file
 * that does not exist. File ids are unguessable, so refusing to confirm existence
 * costs a legitimate client nothing and keeps "someone else's resume exists" from
 * being an oracle.
 */

/** Kinds accepted from clients. Anything else is rejected rather than coerced. */
const KINDS = new Set(['resume', 'attachment'])

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Stores an uploaded file and records its metadata.
 *
 * The bytes are written before the row is inserted so a storage failure never leaves
 * a row promising a file nobody can read, and the reverse compensation removes the
 * bytes if the insert fails. There is no transaction to lean on here because the two
 * halves are different systems: a database rollback cannot unwrite a file, so the
 * file write is the step that has to be undone by hand.
 */
export async function uploadFile(user, file, { kind = 'resume', context = {} } = {}) {
  if (!KINDS.has(kind)) throw unprocessable(`Unsupported file kind: ${kind}`)

  const validated = storageService.validateDocumentUpload(file)
  const key = storageService.buildDocumentKey(validated.extension)
  const driver = getStorageDriver()

  await driver.put(key, validated.buffer, { scope: 'documents' })
  let row
  try {
    row = await fileModel.insertStoredFile({
      ownerId: user.id,
      kind,
      storageDriver: driver.name,
      storageKey: key,
      originalFilename: validated.originalFilename,
      contentType: validated.contentType,
      byteSize: validated.size,
      checksumSha256: sha256(validated.buffer),
    })
  } catch (error) {
    // The row is what callers trust; a key with no row behind it is dead weight in
    // the upload directory, so it goes.
    await driver.remove(key, { scope: 'documents' }).catch(() => {})
    throw error
  }

  await auditService.record({
    actorId: user.id,
    action: 'file.uploaded',
    entityType: 'stored_file',
    entityId: row.id,
    metadata: { kind, contentType: row.content_type, byteSize: row.byte_size },
    context,
  })

  return fileModel.formatStoredFile(row)
}

/** Loads a file the caller may read, or throws. */
export async function loadReadableFile(user, fileId) {
  const row = await fileModel.findStoredFileById(fileId)
  if (!row) throw notFound('File')
  if (!(await canRead(user, row))) throw notFound('File')
  return row
}

export async function getFile(user, fileId) {
  return fileModel.formatStoredFile(await loadReadableFile(user, fileId))
}

/**
 * The bytes, with the checksum re-checked on the way out.
 *
 * The hash is stored so that a file changed on disk after it was written is caught
 * rather than served. Storage is treated as untrusted here for the same reason the
 * upload was validated on the way in.
 */
export async function downloadFile(user, fileId) {
  const row = await loadReadableFile(user, fileId)
  const buffer = await getStorageDriver().read(row.storage_key, { scope: 'documents' })

  if (sha256(buffer) !== row.checksum_sha256) {
    throw new AppError(500, 'The stored file failed its integrity check')
  }

  return {
    buffer,
    contentType: row.content_type,
    filename: row.original_filename,
    // Always an attachment, never inline: a stored document rendered in a browser
    // context is a stored-XSS risk even when it is "only" a PDF.
    disposition: 'attachment',
    byteSize: row.byte_size,
  }
}

/**
 * Removes a file.
 *
 * Refused while an application references it: removing it would leave that
 * application with no resume, which the attachment constraint rightly forbids, and
 * silently dropping the reference would rewrite somebody's application history. Only
 * an administrator may delete somebody else's file.
 */
export async function deleteFile(user, fileId, context = {}) {
  const row = await fileModel.findStoredFileById(fileId)
  if (!row) throw notFound('File')
  if (row.owner_id !== user.id && !hasRole(user, ROLES.ADMIN)) throw notFound('File')

  const used = await fileModel.countApplicationsUsingFile(fileId)
  if (used > 0) {
    throw conflict(
      `This file is attached to ${used} application${used === 1 ? '' : 's'} and cannot be deleted`,
    )
  }

  await fileModel.deleteStoredFile(fileId)
  await getStorageDriver().remove(row.storage_key, { scope: 'documents' })

  await auditService.record({
    actorId: user.id,
    action: 'file.deleted',
    entityType: 'stored_file',
    entityId: fileId,
    // The owner is recorded because an administrator deleting somebody else's file
    // changes nothing else an audit reader could see.
    metadata: { ownerId: row.owner_id },
    context,
  })

  return { deleted: true }
}

export async function listMyFiles(user, { limit = 20, offset = 0 } = {}) {
  const { rows, total } = await fileModel.listStoredFilesForOwner(user.id, { limit, offset })
  return { files: rows.map(fileModel.formatStoredFile), total }
}

/** The read decision itself, in one place. */
async function canRead(user, row) {
  if (row.owner_id === user.id) return true
  if (hasRole(user, ROLES.ADMIN)) return true
  return fileModel.isFileAttachedToJobPostedBy(row.id, user.id)
}

/**
 * Confirms a file the caller is allowed to attach to an application.
 *
 * Uploading a file is not the same as handing it to a recruiter: this is the check
 * that keeps one member from attaching another member's resume to their own
 * application. It is deliberately stricter than `canRead`, which is about reading.
 */
export async function assertOwnedFile(user, fileId, kind = 'resume') {
  const row = await fileModel.findStoredFileById(fileId)
  if (!row) throw unprocessable('The attached file does not exist')
  if (row.owner_id !== user.id) {
    throw unprocessable('You can only attach a file that you uploaded')
  }
  if (kind && row.kind !== kind) {
    throw unprocessable(`The attached file is a ${row.kind}, not a ${kind}`)
  }
  return row
}

/** The resume on the caller's own profile, for the legacy profile endpoints. */
export async function getProfileResume(user) {
  const row = await fileModel.findProfileResume(user.id)
  return row ? fileModel.formatStoredFile(row) : null
}

/**
 * Points a member's profile at a file, replacing whatever was there.
 *
 * The previous file is only removed once the new one is recorded, so a failure in the
 * middle leaves the member with a working resume rather than none.
 */
export async function setProfileResume(user, fileId, context = {}) {
  const row = await assertOwnedFile(user, fileId, 'resume')
  const replaced = await fileModel.setProfileResume(user.id, row.id)
  if (replaced && replaced !== row.id) await discardUnreferenced(replaced)
  await auditService.record({
    actorId: user.id,
    action: 'profile.resume_set',
    entityType: 'stored_file',
    entityId: row.id,
    context,
  })
  return fileModel.formatStoredFile(row)
}

/** Detaches the caller's profile resume. */
export async function clearProfileResume(user, context = {}) {
  const previous = await fileModel.clearProfileResume(user.id)
  if (!previous) return null
  await discardUnreferenced(previous.id)
  await auditService.record({
    actorId: user.id,
    action: 'profile.resume_cleared',
    entityType: 'stored_file',
    entityId: previous.id,
    context,
  })
  return fileModel.formatStoredFile(previous)
}

/**
 * Deletes a file nothing points at any more.
 *
 * Called after a reference is removed. The attachment constraint is the reason the
 * caller checks applications first; a file an application still references is kept so
 * that application stays valid.
 */
async function discardUnreferenced(fileId) {
  const used = await fileModel.countApplicationsUsingFile(fileId)
  if (used > 0) return false
  const row = await fileModel.findStoredFileById(fileId)
  if (!row) return false
  await fileModel.deleteStoredFile(fileId)
  await getStorageDriver().remove(row.storage_key, { scope: 'documents' })
  return true
}
