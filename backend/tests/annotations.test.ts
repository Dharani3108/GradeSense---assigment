import { beforeAll, describe, expect, it } from 'vitest'
import { mockLlmProvider } from '../src/providers/llm/mock.js'
import {
  createAnnotation,
  deleteAnnotation,
  generateAnnotations,
  listAnnotations,
  replaceAnnotations,
  updateAnnotation,
} from '../src/services/annotation.service.js'
import { gradeAnswer } from '../src/services/grading.service.js'
import { getReport, saveReport } from '../src/services/history.service.js'
import { createSession } from '../src/services/session.service.js'
import type { Annotation, GradingReport, GradingResult, OcrResult } from '../src/types/grading.js'
import { locateQuote } from '../src/utils/text.js'
import { answers, modelAnswerText, ocrFrom, questionPaperText, rubric, stubProvider } from './fixtures.js'

describe('locating a quote on the page', () => {
  const ocr = ocrFrom(answers.full)

  it('returns a box around the words it matched', () => {
    const rects = locateQuote('the ammeter is connected in series', ocr.words)

    expect(rects.length).toBeGreaterThan(0)
    for (const rect of rects) {
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(1.001)
    }
  })

  it('still matches when OCR damaged the characters', () => {
    const noisy = ocrFrom(answers.ocrNoise)
    expect(locateQuote('connected in series in a closed path', noisy.words).length).toBeGreaterThan(0)
  })

  it('returns nothing for text the student never wrote', () => {
    expect(locateQuote('photosynthesis converts light into chemical energy', ocr.words)).toEqual([])
  })

  it('produces one box per line for a quote that wraps', () => {
    const wrapped = ocrFrom(answers.full)
    const rects = locateQuote(answers.full.slice(0, 200), wrapped.words)
    expect(rects.length).toBeGreaterThan(1)
  })
})

describe('annotation generation', () => {
  let grading: GradingResult
  let ocr: OcrResult
  let generated: Annotation[]

  beforeAll(async () => {
    ocr = ocrFrom(answers.incorrect)
    grading = await gradeAnswer({ studentOcr: ocr, modelAnswerText, questionPaperText, rubric, provider: mockLlmProvider })
    generated = generateAnnotations({
      sessionId: 'session-fixture',
      reportId: 'report-fixture',
      grading,
      ocr,
      referenceText: modelAnswerText,
    })
  })

  it('annotates every rubric point it can locate on the page', () => {
    const locatable = grading.questions
      .flatMap(question => question.criteria)
      .filter(criterion => criterion.quote && criterion.quoteVerified)
    const rubricAnnotations = generated.filter(annotation => annotation.criterionId)

    expect(rubricAnnotations.length).toBeGreaterThan(0)
    expect(rubricAnnotations).toHaveLength(locatable.length)
  })

  /**
   * Marking the page where the student wrote nothing reads as an error against
   * text that is not there. Those points belong in the report beside the paper.
   */
  it('keeps rubric points with no evidence off the page', async () => {
    // A model reply that marks the first point of each question unaddressed.
    const ids = rubric.questions.flatMap(question => question.criteria.map(criterion => criterion.id))
    const unaddressedIds = rubric.questions.map(question => question.criteria[0].id)
    const provider = stubProvider({
      criteria: ids.map(criterionId => {
        const missing = unaddressedIds.includes(criterionId)
        return {
          criterionId,
          awarded: missing ? 0 : 1,
          status: missing ? 'missing' : 'partial',
          feedback: missing ? 'Not addressed anywhere in the answer.' : 'Partly there.',
          correction: 'What a full-credit answer would have said.',
          quote: missing ? '' : 'connected in series in a closed path',
        }
      }),
      strengths: [],
      improvements: [],
      summary: 'Test reply.',
    })

    const ocrPartial = ocrFrom(answers.partial)
    const gradingPartial = await gradeAnswer({
      studentOcr: ocrPartial,
      modelAnswerText,
      questionPaperText,
      rubric,
      provider,
    })

    const unaddressed = gradingPartial.questions
      .flatMap(question => question.criteria)
      .filter(criterion => criterion.status === 'missing')
    expect(unaddressed.map(criterion => criterion.criterionId).sort()).toEqual([...unaddressedIds].sort())

    const annotations = generateAnnotations({
      sessionId: 'session-fixture',
      reportId: 'report-fixture',
      grading: gradingPartial,
      ocr: ocrPartial,
      referenceText: modelAnswerText,
    })

    // Nothing on the page for them...
    const annotated = new Set(annotations.map(annotation => annotation.criterionId))
    for (const criterion of unaddressed) expect(annotated.has(criterion.criterionId)).toBe(false)
    expect(annotations.some(annotation => annotation.type === 'missing')).toBe(false)

    // ...but the report still carries each one, with its correction.
    for (const criterion of unaddressed) {
      expect(criterion.feedback.length).toBeGreaterThan(0)
      expect(criterion.correction.length).toBeGreaterThan(0)
    }
  })

  it('never places an annotation for an unverifiable quote', () => {
    const fabricated: GradingResult = {
      ...grading,
      questions: grading.questions.map(question => ({
        ...question,
        criteria: question.criteria.map(criterion => ({ ...criterion, quote: 'text the student never wrote', quoteVerified: false })),
      })),
    }
    const annotations = generateAnnotations({
      sessionId: 'session-fixture',
      reportId: 'report-fixture',
      grading: fabricated,
      ocr,
      referenceText: modelAnswerText,
    })
    expect(annotations.filter(annotation => annotation.criterionId)).toHaveLength(0)
  })

  it('carries the marks, the feedback and the correction', () => {
    const wrong = generated.find(annotation => annotation.type === 'incorrect')!
    expect(wrong.comment).toMatch(/^0\/\d/)
    expect(wrong.correction.length).toBeGreaterThan(0)
    expect(wrong.quote.length).toBeGreaterThan(0)
  })

  it('keeps every box inside the page', () => {
    for (const annotation of generated) {
      expect(annotation.x).toBeGreaterThanOrEqual(0)
      expect(annotation.y).toBeGreaterThanOrEqual(0)
      expect(annotation.x + annotation.width).toBeLessThanOrEqual(1.001)
      expect(annotation.y + annotation.height).toBeLessThanOrEqual(1.001)
      expect(annotation.page).toBeGreaterThanOrEqual(0)
    }
  })

  it('flags misspellings with the word the student meant', () => {
    const spelling = generateAnnotations({
      sessionId: 'session-fixture',
      reportId: 'report-fixture',
      grading,
      ocr: ocrFrom(answers.ocrNoise),
      referenceText: modelAnswerText,
    }).filter(annotation => annotation.type === 'spelling')

    expect(spelling.length).toBeGreaterThan(0)
    const suggestions = spelling.map(annotation => annotation.correction)
    expect(suggestions).toContain('voltmeter')
  })
})

describe('editing annotations', () => {
  let report: GradingReport
  let sessionId: string
  let annotations: Annotation[]

  beforeAll(async () => {
    const session = createSession({ studentName: 'Test Student', assignment: 'Editing' })
    sessionId = session.id
    const ocr = ocrFrom(answers.partial)
    const grading = await gradeAnswer({ studentOcr: ocr, modelAnswerText, questionPaperText, rubric, provider: mockLlmProvider })
    report = saveReport({
      sessionId,
      studentName: session.studentName,
      assignment: session.assignment,
      ocrText: ocr.text,
      grading,
      rubric,
    })
    annotations = replaceAnnotations(sessionId, generateAnnotations({
      sessionId,
      reportId: report.id,
      grading,
      ocr,
      referenceText: modelAnswerText,
    }))
  })

  it('persists the generated set', () => {
    expect(listAnnotations(sessionId)).toHaveLength(annotations.length)
  })

  /** The assignment's "editable output" requirement, stated as a test. */
  it('moves an annotation without regrading the paper', () => {
    const before = getReport(report.id)!
    const target = listAnnotations(sessionId)[0]

    const moved = updateAnnotation(target.id, { x: 0.42, y: 0.61, width: 0.2, height: 0.05 })

    expect(moved.x).toBeCloseTo(0.42)
    expect(moved.y).toBeCloseTo(0.61)
    expect(moved.updatedAt >= target.updatedAt).toBe(true)

    const after = getReport(report.id)!
    expect(after.totalAwarded).toBe(before.totalAwarded)
    expect(JSON.stringify(after.grading)).toBe(JSON.stringify(before.grading))
  })

  it('rewrites the comment and the correction in place', () => {
    const target = listAnnotations(sessionId)[1]
    const edited = updateAnnotation(target.id, { comment: 'Teacher note: discuss in class.', correction: 'Say series, not parallel.' })

    expect(edited.comment).toBe('Teacher note: discuss in class.')
    expect(edited.correction).toBe('Say series, not parallel.')
    // Untouched fields survive.
    expect(edited.page).toBe(target.page)
    expect(edited.quote).toBe(target.quote)
  })

  it('changes the type of an annotation', () => {
    const target = listAnnotations(sessionId)[2]
    expect(updateAnnotation(target.id, { type: 'feedback' }).type).toBe('feedback')
  })

  it('adds a teacher annotation of its own', () => {
    const before = listAnnotations(sessionId).length
    const created = createAnnotation(sessionId, {
      page: 0,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.04,
      type: 'feedback',
      comment: 'Handwriting is hard to read here.',
    })

    expect(created.source).toBe('teacher')
    expect(listAnnotations(sessionId)).toHaveLength(before + 1)
  })

  it('clamps an annotation dragged off the page', () => {
    const created = createAnnotation(sessionId, { page: 0, x: 5, y: -3, width: 2, height: 0.04, type: 'feedback' })

    expect(created.x).toBeLessThanOrEqual(1)
    expect(created.y).toBeGreaterThanOrEqual(0)
    expect(created.width).toBeLessThanOrEqual(1)
  })

  it('deletes an annotation and leaves the rest alone', () => {
    const before = listAnnotations(sessionId)
    expect(deleteAnnotation(before[0].id)).toBe(true)

    const after = listAnnotations(sessionId)
    expect(after).toHaveLength(before.length - 1)
    expect(after.find(annotation => annotation.id === before[0].id)).toBeUndefined()
    expect(deleteAnnotation(before[0].id)).toBe(false)
  })

  it('reports a missing annotation instead of creating one', () => {
    expect(() => updateAnnotation('11111111-1111-4111-8111-111111111111', { x: 0.5 })).toThrow(/not found/i)
  })
})
