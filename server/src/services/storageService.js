import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import config from '../config/env.js'
import { unprocessable } from '../utils/errors.js'

/**
 * Storage abstraction for profile photos.
 *
 * Object storage is not configured yet, so the interface is defined now and the
 * local driver implements it for development. Callers depend on `put`/`remove`,
 * not on a filesystem path, so swapping in S3 later is a driver change rather
 * than a change to every call site.
 *
 * Safety rules applied to every upload, independent of driver:
 *
 *   * The filename is generated, so a hostile `originalname` can never reach the
 *     filesystem. `../../etc/passwd` is not a path we ever construct.
 *   * The declared MIME type is not trusted. Magic bytes must agree with it.
 *   * The extension is derived from the detected type, never from user input, so
 *     an executable or a script can never be stored under a web-servable name.
 */

export const PHOTO_TYPES = {
  'image/jpeg': { ext: '.jpg', aliases: ['image/jpg', 'image/pjpeg'],
    extensions: ['.jpg', '.jpeg', '.jpe'] },
  'image/png': { ext: '.png', aliases: [], extensions: ['.png'] },
  'image/webp': { ext: '.webp', aliases: [], extensions: ['.webp'] },
  'image/gif': { ext: '.gif', aliases: [], extensions: ['.gif'] },
}

/** Photo uploads are capped well below the general upload limit. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

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
 * Local filesystem driver for development. Files live outside the web root and
 * are never served statically: app.js 404s the /uploads mount, and reads go
 * through an authorization check.
 */
export const localDriver = {
  name: 'local',

  async put(key, buffer) {
    const dir = path.join(config.uploads.localDir, 'photos')
    await fs.mkdir(dir, { recursive: true })
    const target = path.join(dir, key)
    await fs.writeFile(target, buffer)
    return `/uploads/photos/${key}`
  },

  async remove(key) {
    if (!key) return
    const dir = path.join(config.uploads.localDir, 'photos')
    const target = path.join(dir, path.basename(key))
    await fs.rm(target, { force: true })
  },

  async read(key) {
    const dir = path.join(config.uploads.localDir, 'photos')
    return fs.readFile(path.join(dir, path.basename(key)))
  },
}

/**
 * A driver that refuses writes. Present so production fails loudly instead of
 * silently writing to a container's ephemeral disk.
 */
export const unconfiguredDriver = {
  name: 'unconfigured',
  async put() {
    throw unprocessable('Profile photo storage is not configured on this server')
  },
  async remove() {},
  async read() {
    throw unprocessable('Profile photo storage is not configured on this server')
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

export async function storePhoto(userId, file) {
  const validated = validatePhotoUpload(file)
  const key = buildPhotoKey(userId, validated.extension)
  const driver = getStorageDriver()
  const url = await driver.put(key, validated.buffer)
  return { key, url, contentType: validated.contentType, size: validated.size }
}

export async function removePhoto(key) {
  await getStorageDriver().remove(key)
}

export default {
  PHOTO_TYPES,
  PHOTO_MAX_BYTES,
  validatePhotoUpload,
  validatePhotoExtension,
  detectImageType,
  buildPhotoKey,
  storePhoto,
  removePhoto,
  getStorageDriver,
}