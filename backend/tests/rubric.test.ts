import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pdfTextProvider } from '../src/providers/ocr/pdf-text.js'
import { extractProse, parseRubric } from '../src/services/rubric.service.js'

const sample = (name: string) => resolve(process.cwd(), 'docs/samples', name)

async function textOf(name: string) {
  const result = await pdfTextProvider.extract({ uploadId: name, filePath: sample(name), mimeType: 'application/pdf' })
  return result.text
}

describe('rubric parsing', () => {
  it('reads every question and criterion out of the real model answer', async () => {
    const rubric = parseRubric(await textOf('model-answer.pdf'))

    expect(rubric.inferred).toBe(false)
    expect(rubric.maxMarks).toBe(15)
    expect(rubric.questions.map(question => question.number)).toEqual([1, 2, 3])
    expect(rubric.questions.map(question => question.subject)).toEqual(['Science', 'English', 'Economics'])

    for (const question of rubric.questions) {
      expect(question.maxMarks).toBe(5)
      expect(question.criteria).toHaveLength(5)
      // The rubric total must equal the sum of its rows.
      expect(question.criteria.reduce((total, criterion) => total + criterion.maxMarks, 0)).toBe(question.maxMarks)
    }

    expect(rubric.questions[0].criteria[1].text).toMatch(/ammeter in series and voltmeter in parallel/i)
  })

  it('gives every criterion a stable id', async () => {
    const rubric = parseRubric(await textOf('model-answer.pdf'))
    const ids = rubric.questions.flatMap(question => question.criteria.map(criterion => criterion.id))

    expect(ids).toContain('q1-c1')
    expect(ids).toContain('q3-c5')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to a flagged generic rubric when the document has no questions', () => {
    const rubric = parseRubric('Some notes about the topic that follow no structure at all.')

    expect(rubric.inferred).toBe(true)
    expect(rubric.maxMarks).toBeGreaterThan(0)
    expect(rubric.questions[0].criteria.length).toBeGreaterThan(0)
  })

  it('infers a per-question criterion when the marking table is missing', () => {
    const rubric = parseRubric(['Q1 - Science', 'Model Answer - 5 marks', 'Some prose with no table.'].join('\n'))

    expect(rubric.inferred).toBe(true)
    expect(rubric.questions).toHaveLength(1)
    expect(rubric.questions[0].maxMarks).toBe(5)
  })
})

describe('prose extraction', () => {
  it('drops the marking tables and the grading guidance', async () => {
    const full = await textOf('model-answer.pdf')
    const prose = extractProse(full)

    // The guidance states the wrong pairing as an example of a student error,
    // which would otherwise teach the offline grader the opposite relationship.
    expect(full).toMatch(/places the voltmeter in series/i)
    expect(prose).not.toMatch(/places the voltmeter in series/i)
    expect(prose).not.toMatch(/Marking rubric/i)

    // The explanatory answer itself must survive.
    expect(prose).toMatch(/connected in parallel across the bulb/i)
    expect(prose).toMatch(/quantity on the horizontal axis/i)
  })
})

describe('pdf text extraction', () => {
  it('returns positioned words for the sample student answer', async () => {
    const result = await pdfTextProvider.extract({
      uploadId: 'student',
      filePath: sample('student-answer.pdf'),
      mimeType: 'application/pdf',
    })

    expect(result.pages).toHaveLength(2)
    expect(result.words.length).toBeGreaterThan(200)
    expect(result.warnings).toEqual([])
    expect(result.averageConfidence).toBe(100)

    for (const word of result.words) {
      expect(word.x).toBeGreaterThanOrEqual(0)
      expect(word.x).toBeLessThanOrEqual(1)
      expect(word.y).toBeGreaterThanOrEqual(0)
      expect(word.y).toBeLessThanOrEqual(1)
      expect(word.width).toBeGreaterThan(0)
    }
  })

  it('warns rather than throwing when a PDF has no text layer', async () => {
    // A valid but empty PDF stands in for a scanned page.
    const { PDFDocument } = await import('pdf-lib')
    const document = await PDFDocument.create()
    document.addPage([595, 842])
    const path = resolve(process.env.UPLOAD_ROOT!, 'scan.pdf')
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(process.env.UPLOAD_ROOT!, { recursive: true })
    await writeFile(path, await document.save())

    const result = await pdfTextProvider.extract({ uploadId: 'scan', filePath: path, mimeType: 'application/pdf' })

    expect(result.words).toHaveLength(0)
    expect(result.warnings[0]).toMatch(/no selectable text layer/i)
  })

  it('positions words from a plain text answer', async () => {
    const path = resolve(process.env.UPLOAD_ROOT!, 'answer.txt')
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(process.env.UPLOAD_ROOT!, { recursive: true })
    await writeFile(path, 'The voltmeter is connected in parallel across the bulb.\nThe ammeter is in series.')

    const result = await pdfTextProvider.extract({ uploadId: 'txt', filePath: path, mimeType: 'text/plain' })

    expect(result.words.map(word => word.text)).toContain('voltmeter')
    expect(result.words.every(word => word.width > 0)).toBe(true)
  })
})

describe('sample documents', () => {
  it('ships the question paper, model answer and student answer', async () => {
    for (const name of ['question-paper.pdf', 'model-answer.pdf', 'student-answer.pdf']) {
      const bytes = await readFile(sample(name))
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    }
  })
})
