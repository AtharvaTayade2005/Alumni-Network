// Polyfill standard DOM globals expected by pdfjs-dist (bundled in pdf-parse) in Node 22+
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0
    }
  }
}
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(width = 0, height = 0) {
      this.width = width
      this.height = height
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {}
}

import { createRequire } from 'node:module'
import config from '../../config/env.js'
import { unprocessable } from '../../utils/errors.js'
import { detectDocumentType } from '../storageService.js'

const require = createRequire(import.meta.url)

let mammothModule = null
async function getMammoth() {
  if (mammothModule) return mammothModule
  try {
    const mod = await import('mammoth')
    mammothModule = mod.default || mod
    return mammothModule
  } catch (err) {
    throw unprocessable(`Document parsing library (mammoth) unavailable: ${err.message}`)
  }
}

let pdfParseModule = null
function getPdfParse() {
  if (pdfParseModule) return pdfParseModule
  try {
    const { PDFParse } = require('pdf-parse')
    pdfParseModule = PDFParse
    return pdfParseModule
  } catch (err) {
    throw unprocessable(`PDF parsing library (pdf-parse) unavailable: ${err.message}`)
  }
}

const MAX_RESUME_CHARS = 50000
const MIN_RESUME_CHARS = 20

/**
 * Normalizes extracted text:
 * - strips null and unprintable control characters
 * - converts Windows/Mac newlines to \n
 * - collapses excessive blank lines
 * - trims excessive leading/trailing whitespace
 */
export function cleanResumeText(raw = '') {
  if (typeof raw !== 'string') return ''

  return raw
    // Remove null bytes and non-printable control characters except \n, \r, \t
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    // Normalize newlines
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove repeated horizontal spaces/tabs
    .replace(/[ \t]+/g, ' ')
    // Collapse more than two consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Extracts and normalizes text from a PDF or DOCX buffer.
 *
 * @param {Buffer} buffer - Uploaded document file buffer
 * @param {Object} options - Metadata options: mimeType, originalName
 * @returns {Promise<{ text: string, charCount: number, detectedType: string }>}
 */
export async function extractTextFromBuffer(buffer, { mimeType = '', originalName = '' } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw unprocessable('The uploaded resume file is empty')
  }

  const maxBytes = config.uploads?.maxBytes || 5 * 1024 * 1024
  if (buffer.length > maxBytes) {
    throw unprocessable(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`)
  }

  // Detect type from magic bytes first, fallback to mimeType or extension
  let detectedType = detectDocumentType(buffer)

  if (!detectedType) {
    const ext = String(originalName).split('.').pop()?.toLowerCase()
    if (ext === 'pdf' || mimeType === 'application/pdf') {
      detectedType = 'application/pdf'
    } else if (ext === 'docx' || mimeType.includes('openxmlformats-officedocument.wordprocessingml')) {
      detectedType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
  }

  if (!detectedType) {
    throw unprocessable('The file contents are not a supported document (PDF or DOCX)')
  }

  let extractedRawText = ''

  if (detectedType === 'application/pdf') {
    try {
      const PDFParse = getPdfParse()
      const parser = new PDFParse({ data: buffer })
      const parsed = await parser.getText()
      await parser.destroy().catch(() => {})
      extractedRawText = parsed?.text || ''
    } catch (err) {
      throw unprocessable(`Failed to extract text from PDF: ${err.message || 'Corrupted or unreadable PDF structure'}`)
    }
  } else if (detectedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = await getMammoth()
      const result = await mammoth.extractRawText({ buffer })
      extractedRawText = result?.value || ''
    } catch (err) {
      throw unprocessable(`Failed to extract text from DOCX: ${err.message || 'Corrupted or unreadable DOCX structure'}`)
    }
  } else if (detectedType === 'application/msword') {
    throw unprocessable('Legacy binary .doc format is not supported for AI parsing. Please convert to PDF or DOCX.')
  } else {
    throw unprocessable('Unsupported document format. Please upload a PDF or DOCX resume.')
  }

  const normalized = cleanResumeText(extractedRawText)

  if (normalized.length < MIN_RESUME_CHARS) {
    throw unprocessable(
      `Extracted resume text is too short (minimum ${MIN_RESUME_CHARS} characters). Scanned image PDFs without text layers are not supported.`,
    )
  }

  const finalSafeText = normalized.length > MAX_RESUME_CHARS
    ? normalized.slice(0, MAX_RESUME_CHARS)
    : normalized

  return {
    text: finalSafeText,
    charCount: finalSafeText.length,
    detectedType,
  }
}
