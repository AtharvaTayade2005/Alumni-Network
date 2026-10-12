import { getAiProvider } from './aiProvider.js'
import { TestProvider } from './providers/testProvider.js'
import config from '../../config/env.js'
import { serviceUnavailable } from '../../utils/errors.js'
import logger from '../../utils/logger.js'

let fallbackTestProvider = null
function getFallbackProvider() {
  if (!fallbackTestProvider) fallbackTestProvider = new TestProvider()
  return fallbackTestProvider
}

/**
 * High-level LLM Service abstraction.
 * Wraps provider operations, handles JSON sanitization and standard error mapping.
 */
export async function generateText({ prompt, systemInstruction } = {}) {
  try {
    const provider = getAiProvider()
    return await provider.generateText(prompt, systemInstruction)
  } catch (err) {
    logger.warn(`[AI Engine] Remote AI text generation error (${err.message}). Falling back to dynamic local AI engine.`, {
      status: err.statusCode,
      error: err.message,
    })
    if (!config.isProduction) {
      return await getFallbackProvider().generateText(prompt, systemInstruction)
    }
    if (err.statusCode) throw err
    throw serviceUnavailable(err.message || 'AI service is currently unavailable.')
  }
}

/**
 * Generates structured JSON output from the model.
 * Performs robust parsing and markdown-fence stripping.
 */
export async function generateStructured({ prompt, systemInstruction, fallback: _fallback = {} } = {}) {
  try {
    const provider = getAiProvider()
    return await provider.generateStructured(prompt, systemInstruction)
  } catch (err) {
    logger.warn(`[AI Engine] Remote AI structured generation error (${err.message}). Falling back to dynamic local AI engine.`, {
      status: err.statusCode,
      error: err.message,
    })
    if (!config.isProduction) {
      return await getFallbackProvider().generateStructured(prompt, systemInstruction)
    }
    if (err.statusCode) throw err
    throw serviceUnavailable(err.message || 'AI service is currently unavailable.')
  }
}
