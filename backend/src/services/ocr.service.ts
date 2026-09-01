import vision from '@google-cloud/vision'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import type { OCRResult, OCRWord } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

type VisionResponse = {
  fullTextAnnotation?: {
    text?: string | null
    pages?: Array<{
      blocks?: Array<{
        paragraphs?: Array<{
          words?: Array<{
            symbols?: Array<{ text?: string | null }>
            confidence?: number | null
            boundingBox?: { vertices?: Array<{ x?: number | null; y?: number | null }> | null } | null
          }>
        }>
      }>
    }>
  } | null
}

let client: vision.ImageAnnotatorClient | undefined

function getClient() {
  if (client) return client
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyFilename) throw new ApiError(500, 'GOOGLE_APPLICATION_CREDENTIALS is not configured.')
  client = new vision.ImageAnnotatorClient({ keyFilename })
  return client
}

function extractWords(response: VisionResponse): OCRWord[] {
  const words: OCRWord[] = []
  for (const page of response.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map(symbol => symbol.text ?? '').join('')
          if (!text) continue
          words.push({
            text,
            confidence: Math.round((word.confidence ?? 0) * 100),
            boundingBox: (word.boundingBox?.vertices ?? []).map(vertex => ({ x: vertex.x ?? 0, y: vertex.y ?? 0 })),
          })
        }
      }
    }
  }
  return words
}

function toOcrResult(uploadId: string, response: VisionResponse): OCRResult {
  const words = extractWords(response)
  return {
    uploadId,
    extractedText: response.fullTextAnnotation?.text ?? '',
    averageConfidence: words.length ? Math.round(words.reduce((total, word) => total + word.confidence, 0) / words.length) : 0,
    words,
  }
}

export async function runOcr(uploadId: string, filePath: string, mimeType: string): Promise<OCRResult> {
  const visionClient = getClient()
  if (mimeType === 'application/pdf') {
    // Local PDFs use Vision's synchronous batch API; asynchronous PDF OCR requires Cloud Storage input and output.
    const content = await readFile(filePath)
    const [result] = await visionClient.batchAnnotateFiles({
      requests: [{ inputConfig: { mimeType, content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
    })
    const response = result.responses?.[0]?.responses?.[0] as VisionResponse | undefined
    if (!response) throw new ApiError(502, 'Vision did not return an OCR response for this PDF.')
    return toOcrResult(uploadId, response)
  }

  const [response] = await visionClient.documentTextDetection(filePath)
  return toOcrResult(uploadId, response as VisionResponse)
}
