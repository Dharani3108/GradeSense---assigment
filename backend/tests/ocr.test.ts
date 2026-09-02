import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sample = (name: string) => resolve(process.cwd(), 'docs/samples', name)

/** One place to fake what Gemini sends back for a page of handwriting. */
const generateContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
  Type: {},
}))

async function scannedPdf() {
  // A valid PDF with no text layer stands in for a scanned answer sheet.
  const { PDFDocument } = await import('pdf-lib')
  const document = await PDFDocument.create()
  document.addPage([595, 842])
  const path = resolve(process.env.UPLOAD_ROOT!, 'scan.pdf')
  await mkdir(process.env.UPLOAD_ROOT!, { recursive: true })
  await writeFile(path, await document.save())
  return path
}

const originalKey = process.env.GEMINI_API_KEY

beforeEach(() => {
  generateContent.mockReset()
  vi.resetModules()
  process.env.GEMINI_API_KEY = ''
  process.env.OCR_PROVIDER = 'auto'
})

afterEach(() => {
  process.env.GEMINI_API_KEY = originalKey ?? ''
  process.env.OCR_PROVIDER = 'pdf-text'
})

describe('choosing how to read a document', () => {
  it('reads a PDF text layer locally, without calling a model', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const { extractText } = await import('../src/providers/ocr/index.js')

    const result = await extractText({ uploadId: 'u', filePath: sample('student-answer.pdf'), mimeType: 'application/pdf' })

    expect(result.provider).toBe('pdf-text')
    expect(result.words.length).toBeGreaterThan(100)
    expect(generateContent).not.toHaveBeenCalled()
  })

  it('escalates a scan with no text layer to the model', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        pages: [{
          page: 0,
          lines: [
            { text: 'The voltmeter is connected in series with the bulb.', box: [100, 60, 140, 900] },
            { text: 'When resistance increases the current also increases.', box: [160, 60, 200, 900] },
          ],
          diagram: 'A circuit with a battery, a resistor labelled R, an ammeter A and a voltmeter V drawn in the main loop.',
        }],
      }),
    })
    const { extractText } = await import('../src/providers/ocr/index.js')

    const result = await extractText({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(result.provider).toBe('gemini')
    expect(result.text).toMatch(/voltmeter is connected in series/i)
    expect(result.words.length).toBeGreaterThan(10)
  })

  it('says what is missing when a scan arrives with no credentials at all', async () => {
    const { extractText } = await import('../src/providers/ocr/index.js')

    const result = await extractText({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })

    expect(result.words).toHaveLength(0)
    expect(result.warnings.join(" ")).toMatch(/text layer/i)
    expect(result.warnings.join(' ')).toMatch(/GEMINI_API_KEY/)
    expect(generateContent).not.toHaveBeenCalled()
  })
})

describe('reading handwriting with Gemini', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key' })

  const reply = (pages: unknown) => generateContent.mockResolvedValue({ text: JSON.stringify({ pages }) })

  it('turns each transcribed line into positioned words', async () => {
    reply([{ page: 0, lines: [{ text: 'the ammeter is connected in parallel', box: [200, 100, 240, 800] }] }])
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    const result = await geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })

    expect(result.words.map(word => word.text)).toEqual(['the', 'ammeter', 'is', 'connected', 'in', 'parallel'])
    for (const word of result.words) {
      expect(word.x).toBeGreaterThanOrEqual(0.1)
      expect(word.x + word.width).toBeLessThanOrEqual(1.001)
      expect(word.y).toBeCloseTo(0.2, 5)
      expect(word.page).toBe(0)
    }
  })

  it('keeps the student spelling rather than correcting it', async () => {
    reply([{ page: 0, lines: [{ text: 'the resistence is increased', box: [100, 100, 140, 500] }] }])
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    const result = await geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })
    expect(result.text).toContain('resistence')
  })

  /** The rubric awards marks for a circuit diagram and a demand-supply graph. */
  it('adds a diagram description to the page text so it can be graded', async () => {
    reply([{
      page: 0,
      lines: [{ text: 'Q1 answer', box: [10, 10, 40, 200] }],
      diagram: 'A voltmeter V is drawn in the main loop in series with the bulb.',
    }])
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    const result = await geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })

    expect(result.text).toMatch(/\[Diagram on page 1: .*voltmeter/i)
  })

  it('drops implausible boxes instead of drawing them on the paper', async () => {
    reply([{
      page: 0,
      lines: [
        { text: 'good line', box: [100, 100, 140, 800] },
        { text: 'no box at all' },
        { text: 'out of range', box: [-50, 100, 4000, 800] },
        { text: 'zero area', box: [300, 300, 300, 300] },
      ],
    }])
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    const result = await geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' })

    // Every line is still transcribed for grading...
    expect(result.text).toContain('no box at all')
    expect(result.text).toContain('out of range')
    // ...but only the usable box produces words to anchor an annotation to.
    expect(result.words.map(word => word.text).join(' ')).toBe('good line')
    expect(result.warnings.join(' ')).toMatch(/could not place most lines/i)
  })

  it('reports a model failure instead of returning empty text', async () => {
    generateContent.mockRejectedValue(new Error('429 rate limit'))
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    await expect(
      geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' }),
    ).rejects.toThrow(/could not read the document.*429/i)
  })

  it('rejects a transcription that is not valid JSON', async () => {
    generateContent.mockResolvedValue({ text: 'I was unable to read this page.' })
    const { geminiOcrProvider } = await import('../src/providers/ocr/gemini.js')

    await expect(
      geminiOcrProvider.extract({ uploadId: 'u', filePath: await scannedPdf(), mimeType: 'application/pdf' }),
    ).rejects.toThrow(/not valid JSON/i)
  })
})
