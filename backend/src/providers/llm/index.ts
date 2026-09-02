import { env } from '../../config/env.js'
import type { LlmProvider } from './types.js'
import { geminiProvider } from './gemini.js'
import { grokProvider } from './grok.js'
import { mockLlmProvider } from './mock.js'

/** Resolves the preferred LLM provider according to environment settings. */
export function resolveLlmProvider(): LlmProvider {
  if (env.llmProvider === 'mock') return mockLlmProvider
  if (env.llmProvider === 'grok') return grokProvider
  if (env.llmProvider === 'gemini') return geminiProvider
  if (process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim()) return grokProvider
  if (env.geminiApiKey) return geminiProvider
  return mockLlmProvider
}

export { geminiProvider, grokProvider, mockLlmProvider }
export { LlmError } from './types.js'
export type { GradeRequest, LlmProvider } from './types.js'
