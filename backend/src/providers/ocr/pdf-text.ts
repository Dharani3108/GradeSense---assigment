import { readFile } from 'node:fs/promises'
import type { OcrPage, OcrResult, OcrWord } from '../../types/grading.js'
import type { OcrInput, OcrProvider } from './types.js'
import { PDF_MIME_TYPE, TEXT_MIME_TYPE } from './types.js'

/** Synthetic page geometry used to position words extracted from a .txt file. */
const TEXT_PAGE = { columns: 92, rows: 52, width: 595, height: 842 }

interface TextItem {
  str: string
  width: number
  height: number
  transform: number[]
}

async function loadPdf(data: Uint8Array) {
  // The legacy build is the one that runs on the main thread under Node.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    // Only the text layer is read, so font warnings about glyph rendering are noise.
    verbosity: 0,
  }).promise
}

/**
 * Splits a pdf.js text chunk (which may hold several words) into word boxes by
 * allocating the chunk width proportionally to each word's character count.
 */
function splitChunk(item: TextItem, pageIndex: number, pageWidth: number, pageHeight: number): OcrWord[] {
  const raw = item.str
  if (!raw.trim()) return []
  const left = item.transform[4]
  const baseline = item.transform[5]
  const height = item.height || 10
  const perChar = raw.length ? item.width / raw.length : 0
  const words: OcrWord[] = []
  const pattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    const x = left + match.index * perChar
    const width = match[0].length * perChar
    words.push({
      text: match[0],
      // A text layer is exact by construction, unlike a recognition guess.
      confidence: 100,
      page: pageIndex,
      x: x / pageWidth,
      y: (pageHeight - baseline - height) / pageHeight,
      width: width / pageWidth,
      height: height / pageHeight,
    })
  }
  return words
}

async function extractPdf({ uploadId, filePath }: OcrInput): Promise<OcrResult> {
  const document = await loadPdf(new Uint8Array(await readFile(filePath)))
  const pages: OcrPage[] = []
  const words: OcrWord[] = []
  for (let index = 0; index < document.numPages; index += 1) {
    const page = await document.getPage(index + 1)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    // pdf.js also yields marked-content markers, which carry no geometry.
    const pageWords = content.items.flatMap(item => ('str' in item ? splitChunk(item as unknown as TextItem, index, viewport.width, viewport.height) : []))
    words.push(...pageWords)
    pages.push({ page: index, width: viewport.width, height: viewport.height, text: joinLines(pageWords) })
  }
  const warnings = words.length ? [] : ['This PDF has no selectable text layer, so it is a scan and needs handwriting recognition.']
  return { uploadId, provider: 'pdf-text', text: pages.map(page => page.text).join('\n\n'), averageConfidence: words.length ? 100 : 0, pages, words, warnings }
}

/** Reassembles reading order into lines using the vertical position of words. */
function joinLines(words: OcrWord[]) {
  const lines: OcrWord[][] = []
  for (const word of words) {
    const line = lines[lines.length - 1]
    const previous = line?.[line.length - 1]
    if (previous && Math.abs(previous.y - word.y) <= Math.max(previous.height, word.height) * 0.6) line.push(word)
    else lines.push([word])
  }
  return lines.map(line => line.map(word => word.text).join(' ')).join('\n')
}

async function extractPlainText({ uploadId, filePath }: OcrInput): Promise<OcrResult> {
  const raw = await readFile(filePath, 'utf8')
  const sourceLines = raw.replace(/\r\n/g, '\n').split('\n')
  const wrapped: string[] = []
  for (const line of sourceLines) {
    if (line.length <= TEXT_PAGE.columns) { wrapped.push(line); continue }
    let remaining = line
    while (remaining.length > TEXT_PAGE.columns) {
      const cut = remaining.lastIndexOf(' ', TEXT_PAGE.columns)
      const at = cut > 40 ? cut : TEXT_PAGE.columns
      wrapped.push(remaining.slice(0, at))
      remaining = remaining.slice(at).trimStart()
    }
    wrapped.push(remaining)
  }
  const words: OcrWord[] = []
  const pages: OcrPage[] = []
  const pageCount = Math.max(1, Math.ceil(wrapped.length / TEXT_PAGE.rows))
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const lines = wrapped.slice(pageIndex * TEXT_PAGE.rows, (pageIndex + 1) * TEXT_PAGE.rows)
    lines.forEach((line, row) => {
      const pattern = /\S+/g
      let match: RegExpExecArray | null
      while ((match = pattern.exec(line)) !== null) {
        words.push({
          text: match[0],
          confidence: 100,
          page: pageIndex,
          x: match.index / TEXT_PAGE.columns,
          y: (row + 0.2) / TEXT_PAGE.rows,
          width: match[0].length / TEXT_PAGE.columns,
          height: 0.8 / TEXT_PAGE.rows,
        })
      }
    })
    pages.push({ page: pageIndex, width: TEXT_PAGE.width, height: TEXT_PAGE.height, text: lines.join('\n') })
  }
  return { uploadId, provider: 'pdf-text', text: raw, averageConfidence: raw.trim() ? 100 : 0, pages, words, warnings: [] }
}

export const pdfTextProvider: OcrProvider = {
  name: 'pdf-text',
  supports: mimeType => mimeType === PDF_MIME_TYPE || mimeType === TEXT_MIME_TYPE,
  extract: input => (input.mimeType === TEXT_MIME_TYPE ? extractPlainText(input) : extractPdf(input)),
}
