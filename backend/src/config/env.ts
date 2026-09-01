import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config()

function num(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * `auto` picks the real provider when its credentials are present and silently
 * falls back to the deterministic mock otherwise, so the app runs end to end
 * with no cloud account. Tests pin the provider explicitly.
 */
export type ProviderMode = 'auto' | 'mock'
export type LlmProviderName = 'gemini' | 'mock'
export type OcrProviderName = 'vision' | 'pdf-text' | 'mock'

export const env = {
  port: num(process.env.PORT, 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  databasePath: resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/gradesense.sqlite'),
  uploadRoot: resolve(process.cwd(), process.env.UPLOAD_ROOT ?? './uploads'),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || undefined,
  llmProvider: (process.env.LLM_PROVIDER?.trim() as LlmProviderName | ProviderMode | undefined) ?? 'auto',
  ocrProvider: (process.env.OCR_PROVIDER?.trim() as OcrProviderName | ProviderMode | undefined) ?? 'auto',
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 45_000),
  llmMaxAttempts: num(process.env.LLM_MAX_ATTEMPTS, 3),
  /** Below this blended confidence a report is flagged for human review. */
  reviewConfidenceThreshold: num(process.env.REVIEW_CONFIDENCE_THRESHOLD, 70),
  /** Answers shorter than this are treated as blank rather than sent to the model. */
  blankAnswerMinChars: num(process.env.BLANK_ANSWER_MIN_CHARS, 40),
  maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
}
