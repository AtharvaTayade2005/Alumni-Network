import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import config from '../config/env.js'
import { unprocessable } from '../utils/errors.js'

/**
 * Storage abstraction for uploads.
 *
 * Object storage is not configured yet, so the interface is defined now and the
 * local driver implements it for development. Callers depend on `put`/`remove`,
 * not on a filesystem path, so swapping in S3 later is a driver change rather than
 * a change to every call site.
 *
 * Two scopes exist, and a driver stores them in separate directories:
 *
 *   photos     profile pictures, served back to whoever may see the profile
 *   documents  resumes, which are readable only through an authorized request
 *
 * Safety rules applied to every upload, independent of driver:
 *
 *   * The filename is generated, so a hostile `originalname` can never reach the
 *     filesystem. `../../etc/passwd` is not a path we ever construct.
 *   * The declared MIME type is not trusted. Magic bytes must agree with it.
 *   * The extension is derived from the detected type, never from user input, so an
 *     executable or a script can never be stored under a web-servable name.
 *   * A key is re-validated and the resolved path is checked for containment
 *     before any driver touches the disk, so a stored key cannot escape its scope
 *     even if a row in stored_files were tampered with.
 */

export const PHOTO_TYPES = {
  'image/jpeg': { ext: '.jpg', aliases: ['image/jpg', 'image/pjpeg'],
    extensions: ['.jpg', '.jpeg', '.jpe'] },
  'image/png': { ext: '.png', aliases: [], extensions: ['.png'] },
  'image/webp': { ext: '.webp', aliases: [], extensions: ['.webp'] },
  'image/gif': { ext: '.gif', aliases: [], extensions: ['.gif'] },
}

/**
 * Accepted document types for resumes.
 *
 * Each entry maps a content type to the extension the stored file gets. The
 * extension is chosen here rather than taken from the client, which is what keeps
 * a script renamed to `.docx` from being stored under a name a browser might
 * execute. `aliases` covers the types browsers and office suites disagree about.
 */
export const DOCUMENT_TYPES = {
  'application/pdf': { ext: '.pdf', aliases: ['application/x-pdf', 'application/acrobat'],
    extensions: ['.pdf'] },
  'application/msword': { ext: '.doc', aliases: ['application/x-msword'],
    extensions: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: '.docx', aliases: [], extensions: ['.docx'],
  },
}

/** Photo uploads are capped well below the general upload limit. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/** Directories, relative to the configured upload root, that a driver may use. */
const SCOPES = {
  photos: 'photos',
  documents: 'documents',
}

/**
 * Validates the client-supplied extension against the detected content type.
 *
 * The extension is never trusted for anything: the stored name is generated. It
 * is checked so a request that only ever names executable or server-parsed types
 * is refused outright rather than quietly accepted because its bytes happened to
 * start with a PNG signature. A request with no extension at all is allowed,
 * since some clients omit it.
 */
export function validatePhotoExtension(originalName, detected) {
  if (!originalName) return
  const ext = path.extname(String(originalName)).toLowerCase()
  if (ext === '') return

  const spec = PHOTO_TYPES[detected]
  if (!spec.extensions.includes(ext)) {
    throw unprocessable(
      `A ${detected} image must use one of: ${spec.extensions.join(', ')}`,
    )
  }
}

/**
 * Confirms the bytes really are an image of the type the client claimed.
 *
 * Detection is by signature rather than by extension, so a PHP or shell script
 * renamed to .png is rejected instead of being written to a served directory.
 */
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )) {
    return 'image/png'
  }

  // GIF: "GIF87a" or "GIF89a"
  const gif = buffer.subarray(0, 6).toString('latin1')
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'

  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF'
    && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp'
  }

  return null
}

/**
 * Validates an upload and returns everything the storage layer needs.
 * Throws with a 422 rather than silently accepting a bad file.
 */
export function validatePhotoUpload(file) {
  if (!file || !file.buffer) throw unprocessable('No image was uploaded')
  if (file.size === 0) throw unprocessable('The uploaded image is empty')
  if (file.size > PHOTO_MAX_BYTES) {
    throw unprocessable(
      `Image exceeds the ${Math.floor(PHOTO_MAX_BYTES / 1024 / 1024)}MB limit`,
    )
  }

  const detected = detectImageType(file.buffer)
  if (!detected) {
    throw unprocessable(
      'The file contents are not a supported image (JPEG, PNG, WebP or GIF)',
    )
  }

  // The client's claim must match the bytes. This rejects a mislabelled upload
  // and is the check that stops a non-image from entering the storage layer.
  const claimed = String(file.mimetype ?? '').toLowerCase()
  const spec = PHOTO_TYPES[detected]
  const claimMatches = claimed === detected || spec.aliases.includes(claimed)
  if (!claimMatches) {
    throw unprocessable(
      `The image contents (${detected}) do not match the declared type (${claimed})`,
    )
  }

  validatePhotoExtension(file.originalname, detected)

  return {
    buffer: file.buffer,
    contentType: detected,
    extension: spec.ext,
    size: file.size,
  }
}

/**
 * Confirms the bytes really are a document of the type the client claimed.
 *
 * Detection is by signature rather than by extension, so a shell script or an HTML
 * page renamed to `.docx` is rejected instead of being stored and later served.
 *
 *   PDF   "%PDF-"
 *   DOC   an OLE2 compound-file header, which is what .doc is
 *   DOCX  a zip archive that is a Word document specifically
 *
 * A zip is also what .xlsx and .jar are, so the archive has to be confirmed rather
 * than merely recognised as a zip.
 */
export function detectDocumentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf'
  }

  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf
    && buffer[2] === 0x11 && buffer[3] === 0xe0
  if (isOle) return 'application/msword'

  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  if (isZip && isWordDocument(buffer)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }

  return null
}

/**
 * A .docx is an OOXML zip, but so is a .xlsx or a .jar. Entry names live in the
 * local file headers and in the central directory at the end of the file, so the
 * whole buffer is searched rather than just the first bytes.
 */
function isWordDocument(buffer) {
  // End-of-central-directory record: proves it is a well-formed zip at all.
  if (buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) === -1) return false

  const text = buffer.toString('latin1')
  if (!text.includes('word/document.xml')) return false
  if (text.includes('xl/workbook.xml') || text.includes('ppt/presentation.xml')) return false
  return true
}

/**
 * Validates an uploaded document and returns everything the storage layer needs.
 *
 * Five separate checks, because each can be the only thing standing between a
 * hostile upload and stored bytes:
 *
 *   1. a file was actually sent, and it is not empty
 *   2. the size is inside the configured budget
 *   3. the extension is one this content type is allowed to use
 *   4. the client's declared MIME type is an accepted document type
 *   5. the bytes really are that document type
 *
 * Throws 422 rather than silently accepting a bad file.
 */
export function validateDocumentUpload(file, { maxBytes = config.uploads.maxBytes } = {}) {
  if (!file || !file.buffer) throw unprocessable('No file was uploaded')
  if (file.size === 0) throw unprocessable('The uploaded file is empty')
  if (file.size > maxBytes) {
    throw unprocessable(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`)
  }

  const detected = detectDocumentType(file.buffer)
  if (!detected) {
    throw unprocessable(
      'The file contents are not a supported document (PDF, DOC or DOCX)',
    )
  }

  const claimed = String(file.mimetype ?? '').toLowerCase()
  const spec = DOCUMENT_TYPES[detected]
  const claimMatches = claimed === detected || spec.aliases.includes(claimed)
  if (!claimMatches) {
    throw unprocessable(
      `The file contents (${detected}) do not match the declared type (${claimed || 'none'})`,
    )
  }

  // Checked even though the stored name is generated: a request that only ever
  // names an executable or a server-parsed type is refused outright rather than
  // quietly accepted because its bytes happened to start with a PDF signature.
  const original = String(file.originalname ?? '')
  const ext = path.extname(original).toLowerCase()
  if (ext !== '' && !spec.extensions.includes(ext)) {
    throw unprocessable(
      `A ${detected} document must use one of: ${spec.extensions.join(', ')}`,
    )
  }

  return {
    buffer: file.buffer,
    contentType: detected,
    extension: spec.ext,
    size: file.size,
    originalFilename: sanitiseDisplayName(original) ?? 'document',
  }
}

/**
 * The name shown to whoever downloads the file.
 *
 * Only the base name survives, control characters and quotes are dropped so the value
 * is safe in a Content-Disposition header and in a log line, and the result is capped at
 * the column width. Returns null when nothing usable is left, which is the caller's cue
 * to fall back to a generic name.
 *
 * Multipart filenames arrive as raw bytes read as latin1, which turns `résumé.pdf` into
 * `rÃ©sumÃ©.pdf`. Reinterpreting those bytes as UTF-8 is what puts the name back the way
 * the client typed it; a name that was genuinely latin1 either decodes to itself or is
 * replaced by U+FFFD, neither of which is a security problem for a display string.
 */
export function sanitiseDisplayName(name) {
  const raw = decodeUploadedName(name)
  const base = path.basename(raw.replace(/\\/g, '/'))
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '')
    .trim()
    .replace(/^\.+/, '')
  if (!cleaned || cleaned === '..' || cleaned === '.') return null
  return cleaned.slice(0, 255)
}

/** Undoes the latin1 decoding a multipart header goes through. */
function decodeUploadedName(name) {
  const value = String(name ?? '')
  if (!/[\u0080-\u00ff]/.test(value)) return value
  return Buffer.from(value, 'latin1').toString('utf8')
}

/**
 * Local filesystem driver for development. Files live outside the web root and
 * are never served statically: app.js 404s the /uploads mount, and reads go
 * through an authorization check.
 */
export const localDriver = {
  name: 'local',

  /**
   * Resolves a key to an absolute path and proves it is inside the scope.
   *
   * `path.join` alone would happily follow `../../`, so containment is asserted
   * against the resolved path. A key that does not survive this is never used.
   */
  resolve(key, scope) {
    const dir = path.join(config.uploads.localDir, SCOPES[scope] ?? SCOPES.photos)
    const root = path.resolve(dir)
    const target = path.resolve(root, String(key ?? ''))
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw unprocessable('The storage key does not resolve inside the upload directory')
    }
    return target
  },

  async put(key, buffer, { scope = 'photos' } = {}) {
    const target = this.resolve(key, scope)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, buffer)
    // A relative descriptor, not a URL. Nothing here is served statically, and
    // handing out a path that looks like a permanent link is exactly what the
    // download endpoint exists to avoid.
    return { key, scope }
  },

  async remove(key, { scope = 'photos' } = {}) {
    if (!key) return
    await fs.rm(this.resolve(key, scope), { force: true })
  },

  async read(key, { scope = 'photos' } = {}) {
    return fs.readFile(this.resolve(key, scope))
  },

  /**
   * The local driver has nothing to sign, so it returns null and the caller serves
   * the bytes through its own authenticated endpoint instead. A real object-store
   * driver implements this and returns a short-lived presigned URL.
   */
  async createSignedUrl() {
    return null
  },
}

/**
 * A driver that refuses writes. Present so production fails loudly instead of
 * silently writing to a container's ephemeral disk.
 */
export const unconfiguredDriver = {
  name: 'unconfigured',
  async put() {
    throw unprocessable('File storage is not configured on this server')
  },
  async remove() {},
  async read() {
    throw unprocessable('File storage is not configured on this server')
  },
  async createSignedUrl() {
    return null
  },
}

const drivers = {
  local: localDriver,
  unconfigured: unconfiguredDriver,
}

export function getStorageDriver() {
  return drivers[config.uploads.storageDriver] ?? unconfiguredDriver
}

/**
 * Builds a collision-free key. Only generated components appear: the user id is
 * a UUID from our database, and the suffix is random. No part of the client's
 * filename survives.
 */
export function buildPhotoKey(userId, extension) {
  const safeUser = String(userId).replace(/[^a-f0-9-]/gi, '')
  const rand = crypto.randomBytes(16).toString('hex')
  return `${safeUser}-${Date.now()}-${rand}${extension}`
}

/**
 * Same idea as a photo key, with a random name that carries no user id.
 *
 * Resumes deliberately do not encode who uploaded them: the key is handed out in
 * API responses and stored in job_applications, and a key that starts with a user
 * id would confirm to any applicant whose file that is attached to.
 */
export function buildDocumentKey(extension) {
  const rand = crypto.randomBytes(24).toString('hex')
  return `${Date.now()}-${rand}${extension}`
}

export async function storePhoto(userId, file) {
  const validated = validatePhotoUpload(file)
  const key = buildPhotoKey(userId, validated.extension)
  await getStorageDriver().put(key, validated.buffer, { scope: 'photos' })
  return {
    key,
    // The public-looking path older clients already have stored. Nothing serves
    // /uploads statically, so this is a label for an existing row, not a link that
    // grants access to the bytes.
    url: `/uploads/photos/${key}`,
    contentType: validated.contentType,
    size: validated.size,
  }
}

export async function removePhoto(key) {
  await getStorageDriver().remove(key, { scope: 'photos' })
}

/**
 * Stores an uploaded document and returns the facts about it, never a public URL.
 *
 * There is deliberately no `url` field. A resume is personal, and the only ways to
 * read one are the download endpoints, which re-check permission on every request.
 */
export async function storeDocument(userId, file) {
  const validated = validateDocumentUpload(file)
  const key = buildDocumentKey(validated.extension)
  await getStorageDriver().put(key, validated.buffer, { scope: 'documents' })
  return {
    ownerId: userId,
    key,
    contentType: validated.contentType,
    size: validated.size,
    originalFilename: validated.originalFilename,
  }
}

export async function removeDocument(key) {
  await getStorageDriver().remove(key, { scope: 'documents' })
}

export async function readDocument(key) {
  return getStorageDriver().read(key, { scope: 'documents' })
}

/**
 * A short-lived direct link, when the driver has one.
 *
 * The local driver returns null, so the caller streams the bytes itself after its
 * own authorization check. This exists so an object-storage driver can hand the
 * request straight to the bucket without proxying megabytes through the API.
 */
export async function createDocumentUrl(key, { expiresIn = 300 } = {}) {
  return getStorageDriver().createSignedUrl(key, { scope: 'documents', expiresIn })
}

export default {
  PHOTO_TYPES,
  PHOTO_MAX_BYTES,
  DOCUMENT_TYPES,
  validatePhotoUpload,
  validatePhotoExtension,
  validateDocumentUpload,
  detectImageType,
  detectDocumentType,
  sanitiseDisplayName,
  buildPhotoKey,
  buildDocumentKey,
  storePhoto,
  removePhoto,
  storeDocument,
  removeDocument,
  readDocument,
  createDocumentUrl,
  getStorageDriver,
}
