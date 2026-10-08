import config from '../../../config/env.js'
import { AppError } from '../../../utils/errors.js'
import logger from '../../../utils/logger.js'

export class OpenAIProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.ai.openai.apiKey
    this.model = options.model || config.ai.openai.model
    this.embeddingModel = options.embeddingModel || config.ai.openai.embeddingModel
    this.baseUrl = 'https://api.openai.com/v1'
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new AppError(503, 'OpenAI service is not configured. Please set OPENAI_API_KEY in the server environment.')
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

    const messages = []
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: temperature ?? config.ai.temperature,
        max_tokens: maxTokens ?? config.ai.maxTokens,
      }),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `OpenAI returned HTTP ${response.status}`
      logger.error('OpenAI text generation failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    return data?.choices?.[0]?.message?.content ?? ''
  }

  async generateStructured(promptOrOpts, maybeSystemInstruction) {
    this.assertConfigured()

    const prompt = typeof promptOrOpts === 'object' && promptOrOpts !== null ? promptOrOpts.prompt : promptOrOpts
    const systemInstruction = (typeof promptOrOpts === 'object' && promptOrOpts !== null
      ? promptOrOpts.systemInstruction
      : maybeSystemInstruction) || ''

    const sys = systemInstruction
      ? `${systemInstruction}\nReturn your answer strictly as a valid JSON object.`
      : 'You are a helpful assistant. Output valid JSON.'

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: config.ai.maxTokens,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `OpenAI returned HTTP ${response.status}`
      logger.error('OpenAI structured generation failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content ?? '{}'
    return JSON.parse(content)
  }

  async generateEmbedding(text) {
    this.assertConfigured()

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: String(text).slice(0, 8000),
      }),
    })

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}))
      const msg = errJson?.error?.message || `OpenAI Embeddings returned HTTP ${response.status}`
      logger.error('OpenAI embeddings failed', { status: response.status, message: msg })
      throw new AppError(502, `AI Provider Error: ${msg}`)
    }

    const data = await response.json()
    const vector = data?.data?.[0]?.embedding
    if (!Array.isArray(vector)) {
      throw new AppError(502, 'OpenAI did not return an embedding vector')
    }
    return vector
  }
}
