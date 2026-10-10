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
    cachedProvider = new GeminiProvider()
    cachedProvider._type = 'gemini'
    return cachedProvider
  }

  if (type === 'openai') {
    cachedProvider = new OpenAIProvider()
    cachedProvider._type = 'openai'
    return cachedProvider
  }

  throw new AppError(500, `Unsupported AI provider configured: "${type}". Supported providers are "gemini" and "openai".`)
}

export function resetAiProviderCache() {
  cachedProvider = null
}
