import config from '../../config/env.js'
import { GeminiProvider } from './providers/geminiProvider.js'
import { OpenAIProvider } from './providers/openaiProvider.js'
import { TestProvider } from './providers/testProvider.js'
import { AppError } from '../../utils/errors.js'

let cachedProvider = null

export function getAiProvider(forcedType = null) {
  if (config.isTest) {
    return new TestProvider()
  }

  const type = (forcedType || config.ai.provider || 'gemini').toLowerCase()

  if (cachedProvider && cachedProvider._type === type) {
    return cachedProvider
  }

  if (type === 'test') {
    if (config.isProduction) {
      throw new AppError(500, 'Test AI provider is disabled in production. Configure a valid AI provider (gemini or openai).')
    }
    return new TestProvider()
  }

  if (type === 'gemini') {
    if (!config.ai.gemini.apiKey || !config.ai.gemini.apiKey.trim()) {
      if (config.isProduction) {
        throw new AppError(500, 'GEMINI_API_KEY is required in production when AI_PROVIDER is set to gemini.')
      }
      console.warn('[AI Provider] WARNING: GEMINI_API_KEY is not configured. Falling back to dynamic local testProvider.')
      return new TestProvider()
    }
    cachedProvider = new GeminiProvider()
    cachedProvider._type = 'gemini'
    return cachedProvider
  }

  if (type === 'openai') {
    if (!config.ai.openai.apiKey || !config.ai.openai.apiKey.trim()) {
      if (config.isProduction) {
        throw new AppError(500, 'OPENAI_API_KEY is required in production when AI_PROVIDER is set to openai.')
      }
      console.warn('[AI Provider] WARNING: OPENAI_API_KEY is not configured. Falling back to dynamic local testProvider.')
      return new TestProvider()
    }
    cachedProvider = new OpenAIProvider()
    cachedProvider._type = 'openai'
    return cachedProvider
  }

  throw new AppError(500, `Unsupported AI provider configured: "${type}". Supported providers are "gemini" and "openai".`)
}

export function resetAiProviderCache() {
  cachedProvider = null
}
