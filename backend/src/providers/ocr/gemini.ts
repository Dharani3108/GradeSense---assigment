import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { OcrPage, OcrResult, OcrWord } from '../../types/grading.js'
import { ApiError } from '../../utils/api-error.js'
import type { OcrInput, OcrProvider } from './types.js'
import { IMAGE_MIME_TYPES, PDF_MIME_TYPE } from './types.js'

/**
 * Reads handwriting with the same GEMINI_API_KEY the grader uses, so a scanned
 * answer sheet works without a separate Google Cloud service account.
 *
 * Two things it does that a plain OCR engine does not:
 *
 *  - Returns a box per line, which is what lets a graded quote be located on
 *    the page. Boxes are checked for plausibility and dropped when they are
 *    not, in which case the report still stands and simply carries no page
 *    annotations.
 *  - Describes any diagram or graph in words, appended to the page text. The
 *    rubric awards marks for a circuit diagram and a demand-supply graph, and
 *    a description lets the existing text-based grading reason about them.
 */

/** Gemini returns boxes as [ymin, xmin, ymax, xmax] normalised to 0-1000. */
const boxSchema = z.array(z.number()).length(4)

const lineSchema = z.object({
  text: z.string(),
  box: boxSchema.optional(),
})

const pageSchema = z.object({
  page: z.number().int().nonnegative(),
  lines: z.array(lineSchema).default([]),
  diagram: z.string().optional(),
})

const responseSchema = z.object({ pages: z.array(pageSchema).default([]) })

const PROMPT = `You are transcribing a scanned exam answer sheet so it can be graded.

For every page, return:
- "lines": each line of handwriting, in reading order, transcribed EXACTLY as written.
  Preserve the student's own spelling and grammar mistakes; do not correct them.
  The grader needs the student's real words as evidence.
  Give each line a "box" as [ymin, xmin, ymax, xmax] normalised to 0-1000 of the
  page image, tight around that line of text.
- "diagram": if the page contains a diagram, circuit, graph or chart, describe what
  is actually drawn in one short paragraph: which components or axes are present,
  what each is labelled, and how they are connected or oriented. State what you
  see, not what a correct answer would show. Omit this field if there is no drawing.

If a page is rotated, transcribe it in its natural reading direction but keep the
boxes in the coordinates of the image as supplied.

Return only the JSON object.`

const geminiResponseSchema = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                box: { type: 'array', items: { type: 'number' } },
              },
              required: ['text'],
            },
          },
          diagram: { type: 'string' },
        },
        required: ['page', 'lines'],
      },
    },
  },
  required: ['pages'],
}

/** A box is only usable if it is inside the page and has real area. */
function usableBox(box: number[] | undefined) {
  if (!box || box.length !== 4) return undefined
  const [yMin, xMin, yMax, xMax] = box
  if (![yMin, xMin, yMax, xMax].every(value => Number.isFinite(value) && value >= 0 && value <= 1000)) return undefined
  const y = Math.min(yMin, yMax) / 1000
  const x = Math.min(xMin, xMax) / 1000
  const height = Math.abs(yMax - yMin) / 1000
  const width = Math.abs(xMax - xMin) / 1000
  if (height <= 0.002 || width <= 0.005) return undefined
  return { x, y, width, height }
}

/** Splits a transcribed line into word boxes by character share of the line. */
function wordsFromLine(text: string, page: number, box: { x: number; y: number; width: number; height: number }): OcrWord[] {
  const words: OcrWord[] = []
  const perChar = text.length ? box.width / text.length : 0
  const pattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    words.push({
      text: match[0],
      // Handwriting recognition is a judgement, not a certainty. This is the
      // ceiling the confidence blend and the review threshold work against.
      confidence: 88,
      page,
      x: box.x + match.index * perChar,
      y: box.y,
      width: Math.max(perChar, match[0].length * perChar),
      height: box.height,
    })
  }
  return words
}

export const geminiOcrProvider: OcrProvider = {
  name: 'gemini',
  supports: mimeType => mimeType === PDF_MIME_TYPE || IMAGE_MIME_TYPES.includes(mimeType),

  async extract({ uploadId, filePath, mimeType }: OcrInput): Promise<OcrResult> {
    if (!env.geminiApiKey) throw new ApiError(500, 'GEMINI_API_KEY is not configured, so handwriting cannot be read.')

    const { GoogleGenAI } = await import('@google/genai')
    const client = new GoogleGenAI({ apiKey: env.geminiApiKey })
    const data = (await readFile(filePath)).toString('base64')

    let raw: string | undefined
    try {
      const response = await client.models.generateContent({
        model: env.geminiModel,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data } }, { text: PROMPT }] }],
        config: { responseMimeType: 'application/json', responseSchema: geminiResponseSchema },
      })
      raw = response.text
    } catch (error) {
      throw new ApiError(502, `Gemini could not read the document: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
    if (!raw) throw new ApiError(502, 'Gemini returned an empty transcription.')

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new ApiError(502, 'Gemini returned a transcription that was not valid JSON.')
    }

    const result = responseSchema.safeParse(parsed)
    if (!result.success) throw new ApiError(502, 'Gemini returned a transcription in an unexpected shape.')

    const pages: OcrPage[] = []
    const words: OcrWord[] = []
    const warnings: string[] = []
    let linesWithBoxes = 0
    let totalLines = 0

    result.data.pages
      .slice()
      .sort((a, b) => a.page - b.page)
      .forEach((page, index) => {
        const pageIndex = Number.isInteger(page.page) ? page.page : index
        const text = page.lines.map(line => line.text).filter(Boolean)

        for (const line of page.lines) {
          if (!line.text.trim()) continue
          totalLines += 1
          const box = usableBox(line.box)
          if (!box) continue
          linesWithBoxes += 1
          words.push(...wordsFromLine(line.text, pageIndex, box))
        }

        // The diagram description joins the page text so the rubric points that
        // ask about the drawing have something to be graded against.
        if (page.diagram?.trim()) text.push(`[Diagram on page ${pageIndex + 1}: ${page.diagram.trim()}]`)

        pages.push({ page: pageIndex, width: 1000, height: 1000, text: text.join('\n') })
      })

    if (!pages.length) warnings.push('Gemini did not find any text on this document.')
    if (totalLines && linesWithBoxes / totalLines < 0.5) {
      warnings.push('Gemini could not place most lines on the page, so annotations may be incomplete. The marks and feedback are unaffected.')
    }

    return {
      uploadId,
      provider: 'gemini',
      text: pages.map(page => page.text).join('\n\n'),
      averageConfidence: words.length ? 88 : pages.some(page => page.text.trim()) ? 70 : 0,
      pages: pages.length ? pages : [{ page: 0, width: 1000, height: 1000, text: '' }],
      words,
      warnings,
    }
  },
}
