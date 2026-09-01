import { env } from '../../config/env.js'
import type { LlmProvider } from './types.js'
import { geminiProvider } from './gemini.js'
import { mockLlmProvider } from './mock.js'

/** `auto` uses Gemini when a key is present and the offline grader otherwise. */
export function resolveLlmProvider(): LlmProvider {
  if (env.llmProvider === 'mock') return mockLlmProvider
  if (env.llmProvider === 'gemini') return geminiProvider
  return env.geminiApiKey ? geminiProvider : mockLlmProvider
}

export { geminiProvider, mockLlmProvider }
export { LlmError } from './types.js'
export type { GradeRequest, LlmProvider } from './types.js'
