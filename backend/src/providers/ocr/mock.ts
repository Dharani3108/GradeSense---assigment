import { readFile } from 'node:fs/promises'
import type { OcrResult } from '../../types/grading.js'
import type { OcrInput, OcrProvider } from './types.js'
import { pdfTextProvider } from './pdf-text.js'
import { IMAGE_MIME_TYPES, PDF_MIME_TYPE, TEXT_MIME_TYPE } from './types.js'

/**
 * The fallback of last resort. It reads what it honestly can (text layers, plain
 * text) and, for formats it cannot read without a cloud OCR account, returns an
 * empty result carrying a warning rather than pretending to have recognised
 * text. The grading layer turns that into a flagged, zero-score report.
 */
export const mockOcrProvider: OcrProvider = {
  name: 'mock',
  supports: () => true,
  async extract(input: OcrInput): Promise<OcrResult> {
    if (input.mimeType === PDF_MIME_TYPE || input.mimeType === TEXT_MIME_TYPE) {
      const result = await pdfTextProvider.extract(input)
      return { ...result, provider: 'mock' }
    }
    const bytes = await readFile(input.filePath).then(buffer => buffer.byteLength).catch(() => 0)
    const warning = IMAGE_MIME_TYPES.includes(input.mimeType)
      ? 'Reading handwriting from an image needs a recognition engine. Set GEMINI_API_KEY, or GOOGLE_APPLICATION_CREDENTIALS for Cloud Vision, or upload a PDF with a text layer.'
      : `No OCR provider can read ${input.mimeType}.`
    return {
      uploadId: input.uploadId,
      provider: 'mock',
      text: '',
      averageConfidence: 0,
      pages: [{ page: 0, width: 595, height: 842, text: '' }],
      words: [],
      warnings: [`${warning} (${bytes} bytes received)`],
    }
  },
}
