import { env } from '../../config/env.js'
import type { OcrResult } from '../../types/grading.js'
import { geminiOcrProvider } from './gemini.js'
import { mockOcrProvider } from './mock.js'
import { pdfTextProvider } from './pdf-text.js'
import type { OcrInput, OcrProvider } from './types.js'
import { PDF_MIME_TYPE, TEXT_MIME_TYPE } from './types.js'
import { visionProvider } from './vision.js'

const EXPLICIT: Record<string, OcrProvider> = {
  vision: visionProvider,
  'pdf-text': pdfTextProvider,
  gemini: geminiOcrProvider,
  mock: mockOcrProvider,
}

/** The recognition engines, in the order `auto` prefers them. */
function recognisers(mimeType: string) {
  const available: OcrProvider[] = []
  if (env.googleCredentials && visionProvider.supports(mimeType)) available.push(visionProvider)
  if (env.geminiApiKey && geminiOcrProvider.supports(mimeType)) available.push(geminiOcrProvider)
  return available
}

/**
 * Resolves a provider without reading the file. `auto` returns the text-layer
 * reader for documents that might have one; `extractText` below is what decides
 * whether that actually worked.
 */
export function resolveOcrProvider(mimeType: string): OcrProvider {
  const configured = env.ocrProvider
  if (configured !== 'auto' && EXPLICIT[configured]) return EXPLICIT[configured]
  if (pdfTextProvider.supports(mimeType)) return pdfTextProvider
  return recognisers(mimeType)[0] ?? mockOcrProvider
}

/**
 * Extracts text, escalating only when it has to.
 *
 * A PDF with a text layer is read locally: exact, free and instant. A scan has
 * no text layer, so it falls through to a recognition engine - Cloud Vision if
 * credentials exist, otherwise Gemini, which reads handwriting with the key the
 * grader already uses. With neither, the mock returns an empty result carrying
 * a warning, which becomes a flagged zero-score report rather than a guess.
 */
export async function extractText(input: OcrInput): Promise<OcrResult> {
  const configured = env.ocrProvider
  if (configured !== 'auto' && EXPLICIT[configured]) return EXPLICIT[configured].extract(input)

  const isTextLayerCandidate = input.mimeType === PDF_MIME_TYPE || input.mimeType === TEXT_MIME_TYPE
  if (isTextLayerCandidate) {
    const local = await pdfTextProvider.extract(input)
    if (local.words.length) return local
  }

  for (const provider of recognisers(input.mimeType)) {
    return provider.extract(input)
  }

  // Nothing can recognise handwriting here, so say exactly what would fix it
  // rather than returning an empty transcription with no explanation.
  const fallback = await mockOcrProvider.extract(input)
  return {
    ...fallback,
    warnings: [
      ...fallback.warnings,
      'Set GEMINI_API_KEY (or GOOGLE_APPLICATION_CREDENTIALS for Cloud Vision) so the handwriting can be read.',
    ],
  }
}

export { geminiOcrProvider, mockOcrProvider, pdfTextProvider, visionProvider }
export type { OcrProvider } from './types.js'
