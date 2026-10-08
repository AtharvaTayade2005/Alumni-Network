import config from '../../../config/env.js'
import { AppError } from '../../../utils/errors.js'
import logger from '../../../utils/logger.js'

export class GeminiProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.ai.gemini.apiKey
    this.model = options.model || config.ai.gemini.model
    this.embeddingModel = options.embeddingModel || config.ai.gemini.embeddingModel
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new AppError(503, 'Gemini AI service is not configured. Please set GEMINI_API_KEY in the server environment.')
    }
  }

  async generateText(promptOrOpts, maybeSystemInstruction) {
    this.assertConfigured()

    const prompt = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts
    const systemInstruction = (typeof promptOrOpts === 'object' && promptOrOpts !== null
      ? promptOrOpts.systemInstruction
      : maybeSystemInstruction) || ''
    const temperature = typeof promptOrOpts === 'object' ? promptOrOpts.temperature : undefined
    const maxTokens = typeof promptOrOpts === 'object' ? promptOrOpts.maxTokens : undefined

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: temperature ?? config.ai.temperature,
        maxOutputTokens: maxTokens ?? config.ai.maxTokens,
      },
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `Gemini API returned HTTP ${response.status}`
      logger.error('Gemini text generation failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return text
  }

  async generateStructured(promptOrOpts, maybeSystemInstruction) {
    this.assertConfigured()

    const prompt = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts
    const systemInstruction = (typeof promptOrOpts === 'object' && promptOrOpts !== null
      ? promptOrOpts.systemInstruction
      : maybeSystemInstruction) || ''

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // Lower temperature for structured extraction
        maxOutputTokens: config.ai.maxTokens,
        responseMimeType: 'application/json',
      },
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: `${systemInstruction}\nReturn your answer strictly as a valid JSON object matching the requested schema.` }] }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `Gemini API returned HTTP ${response.status}`
      logger.error('Gemini structured generation failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    try {
      return JSON.parse(rawText)
    } catch {
      // Clean possible markdown code fences
      const cleaned = rawText.replace(/^```json/m, '').replace(/```$/m, '').trim()
      return JSON.parse(cleaned)
    }
  }

  async generateEmbedding(text) {
    this.assertConfigured()

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.embeddingModel)}:embedContent?key=${encodeURIComponent(this.apiKey)}`
    const body = {
      content: { parts: [{ text: String(text).slice(0, 8000) }] },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `Gemini Embedding API returned HTTP ${response.status}`
      logger.error('Gemini embedding generation failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    const values = data?.embedding?.values
    if (!Array.isArray(values) || values.length === 0) {
      throw new AppError(502, 'Gemini did not return an embedding vector')
    }
    return values
  }
}
