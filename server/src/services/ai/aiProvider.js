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

  if (type === 'test') {
    return new TestProvider()
  }

  if (type === 'gemini') {
    return new GeminiProvider()
  }

  if (type === 'openai') {
    return new OpenAIProvider()
  }

  throw new AppError(500, `Unsupported AI provider configured: "${type}". Supported providers are "gemini" and "openai".`)
}

export function resetAiProviderCache() {
  cachedProvider = null
}
