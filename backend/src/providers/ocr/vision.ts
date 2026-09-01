import { readFile } from 'node:fs/promises'
import { env } from '../../config/env.js'
import type { OcrPage, OcrResult, OcrWord } from '../../types/grading.js'
import { ApiError } from '../../utils/api-error.js'
import type { OcrInput, OcrProvider } from './types.js'
import { IMAGE_MIME_TYPES, PDF_MIME_TYPE } from './types.js'

type Vertex = { x?: number | null; y?: number | null }
type VisionWord = { symbols?: Array<{ text?: string | null }>; confidence?: number | null; boundingBox?: { vertices?: Vertex[] | null } | null }
type VisionPage = { width?: number | null; height?: number | null; blocks?: Array<{ paragraphs?: Array<{ words?: VisionWord[] }> }> }
type VisionResponse = { fullTextAnnotation?: { text?: string | null; pages?: VisionPage[] } | null }

let client: import('@google-cloud/vision').ImageAnnotatorClient | undefined

async function getClient() {
  if (client) return client
  if (!env.googleCredentials) throw new ApiError(500, 'GOOGLE_APPLICATION_CREDENTIALS is not configured.')
  const { default: vision } = await import('@google-cloud/vision')
  client = new vision.ImageAnnotatorClient({ keyFilename: env.googleCredentials })
  return client
}

function toWords(pages: VisionPage[]): { words: OcrWord[]; pages: OcrPage[] } {
  const words: OcrWord[] = []
  const outPages: OcrPage[] = []
  pages.forEach((page, pageIndex) => {
    const pageWidth = page.width || 1
    const pageHeight = page.height || 1
    outPages.push({ page: pageIndex, width: pageWidth, height: pageHeight, text: '' })
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map(symbol => symbol.text ?? '').join('')
          const vertices = word.boundingBox?.vertices ?? []
          if (!text || !vertices.length) continue
          const xs = vertices.map(vertex => vertex.x ?? 0)
          const ys = vertices.map(vertex => vertex.y ?? 0)
          const x = Math.min(...xs)
          const y = Math.min(...ys)
          words.push({
            text,
            confidence: Math.round((word.confidence ?? 0) * 100),
            page: pageIndex,
            x: x / pageWidth,
            y: y / pageHeight,
            width: (Math.max(...xs) - x) / pageWidth,
            height: (Math.max(...ys) - y) / pageHeight,
          })
        }
      }
    }
  })
  return { words, pages: outPages }
}

function toResult(uploadId: string, response: VisionResponse): OcrResult {
  const { words, pages } = toWords(response.fullTextAnnotation?.pages ?? [])
  const text = response.fullTextAnnotation?.text ?? ''
  return {
    uploadId,
    provider: 'vision',
    text,
    averageConfidence: words.length ? Math.round(words.reduce((total, word) => total + word.confidence, 0) / words.length) : 0,
    pages: pages.length ? pages : [{ page: 0, width: 1, height: 1, text }],
    words,
    warnings: words.length ? [] : ['Vision did not recognise any text in this document.'],
  }
}

export const visionProvider: OcrProvider = {
  name: 'vision',
  supports: mimeType => mimeType === PDF_MIME_TYPE || IMAGE_MIME_TYPES.includes(mimeType),
  async extract({ uploadId, filePath, mimeType }: OcrInput) {
    const visionClient = await getClient()
    if (mimeType === PDF_MIME_TYPE) {
      // Synchronous batch OCR keeps the file local; the async API needs Cloud Storage.
      const content = await readFile(filePath)
      const [result] = await visionClient.batchAnnotateFiles({
        requests: [{ inputConfig: { mimeType, content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
      })
      const responses = (result.responses?.[0]?.responses ?? []) as VisionResponse[]
      if (!responses.length) throw new ApiError(502, 'Vision did not return an OCR response for this PDF.')
      // Merge the per-page responses into one document-level result.
      const merged = responses.reduce<VisionResponse>((accumulator, response) => ({
        fullTextAnnotation: {
          text: `${accumulator.fullTextAnnotation?.text ?? ''}${response.fullTextAnnotation?.text ?? ''}`,
          pages: [...(accumulator.fullTextAnnotation?.pages ?? []), ...(response.fullTextAnnotation?.pages ?? [])],
        },
      }), { fullTextAnnotation: { text: '', pages: [] } })
      return toResult(uploadId, merged)
    }
    const [response] = await visionClient.documentTextDetection(filePath)
    return toResult(uploadId, response as VisionResponse)
  },
}
