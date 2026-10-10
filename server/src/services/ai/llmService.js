import { getAiProvider } from './aiProvider.js'
import { serviceUnavailable } from '../../utils/errors.js'
import logger from '../../utils/logger.js'

/**
 * High-level LLM Service abstraction.
 * Wraps provider operations, handles JSON sanitization and standard error mapping.
 */
export async function generateText({ prompt, systemInstruction } = {}) {
  try {
    const provider = getAiProvider()
    return await provider.generateText(prompt, systemInstruction)
  } catch (err) {
    logger.error('LLM generateText error', { message: err.message })
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
    logger.error('LLM generateStructured error', { message: err.message })
    if (err.statusCode) throw err
    throw serviceUnavailable(err.message || 'AI service is currently unavailable.')
  }
}
