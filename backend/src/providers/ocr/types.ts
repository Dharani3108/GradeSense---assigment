import type { OcrProviderName, OcrResult } from '../../types/grading.js'

export interface OcrInput {
  uploadId: string
  filePath: string
  mimeType: string
}

export interface OcrProvider {
  readonly name: OcrProviderName
  /** Whether this provider can read the given mime type at all. */
  supports(mimeType: string): boolean
  extract(input: OcrInput): Promise<OcrResult>
}

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg']
export const PDF_MIME_TYPE = 'application/pdf'
export const TEXT_MIME_TYPE = 'text/plain'
