import { env } from '../../config/env.js'
import type { OcrProvider } from './types.js'
import { mockOcrProvider } from './mock.js'
import { pdfTextProvider } from './pdf-text.js'
import { visionProvider } from './vision.js'

/**
 * Resolution order for `auto`:
 *   1. Vision, when credentials exist and it can read the format.
 *   2. The local text-layer reader, for PDFs and plain text.
 *   3. The mock, which degrades honestly.
 */
export function resolveOcrProvider(mimeType: string): OcrProvider {
  const configured = env.ocrProvider
  if (configured === 'vision') return visionProvider
  if (configured === 'pdf-text') return pdfTextProvider
  if (configured === 'mock') return mockOcrProvider
  if (env.googleCredentials && visionProvider.supports(mimeType)) return visionProvider
  if (pdfTextProvider.supports(mimeType)) return pdfTextProvider
  return mockOcrProvider
}

export { mockOcrProvider, pdfTextProvider, visionProvider }
export type { OcrProvider } from './types.js'
