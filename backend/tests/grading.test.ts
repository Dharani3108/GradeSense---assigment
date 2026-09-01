import { describe, expect, it } from 'vitest'
import { mockLlmProvider } from '../src/providers/llm/mock.js'
import { gradeAnswer } from '../src/services/grading.service.js'
import type { GradingResult } from '../src/types/grading.js'
import { answers, failingProvider, gradingReply, modelAnswerText, ocrFrom, questionPaperText, rubric, stubProvider } from './fixtures.js'

const grade = (studentText: string, provider = mockLlmProvider, ocrOptions = {}) =>
  gradeAnswer({
    studentOcr: ocrFrom(studentText, ocrOptions),
    modelAnswerText,
    questionPaperText,
    rubric,
    provider,
  })

const criteriaOf = (result: GradingResult) => result.questions.flatMap(question => question.criteria)
const find = (result: GradingResult, id: string) => criteriaOf(result).find(criterion => criterion.criterionId === id)!

/** The two invariants the assignment states as hard rules. */
function expectMarkInvariants(result: GradingResult) {
  expect(result.totalAwarded).toBeLessThanOrEqual(result.maxMarks)
  expect(result.totalAwarded).toBeGreaterThanOrEqual(0)

  const summed = result.questions.reduce((total, question) => total + question.awarded, 0)
  expect(result.totalAwarded).toBeCloseTo(summed, 5)

  for (const question of result.questions) {
    const fromCriteria = question.criteria.reduce((total, criterion) => total + criterion.awarded, 0)
    expect(question.awarded).toBeCloseTo(fromCriteria, 5)
    expect(question.awarded).toBeLessThanOrEqual(question.maxMarks)
    for (const criterion of question.criteria) {
      expect(criterion.awarded).toBeLessThanOrEqual(criterion.maxMarks)
      expect(criterion.awarded).toBeGreaterThanOrEqual(0)
    }
  }
}

describe('a fully correct answer', () => {
  it('awards full marks with no reversed-reasoning findings', async () => {
    const result = await grade(answers.full)

    expectMarkInvariants(result)
    expect(result.totalAwarded).toBe(rubric.maxMarks)
    expect(result.percentage).toBe(100)
    expect(criteriaOf(result).every(criterion => criterion.status === 'correct')).toBe(true)
    expect(result.adjustments).toEqual([])
  })
})

describe('a partially correct answer', () => {
  it('scores between zero and full, and names what is missing', async () => {
    const result = await grade(answers.partial)

    expectMarkInvariants(result)
    expect(result.totalAwarded).toBeGreaterThan(0)
    expect(result.totalAwarded).toBeLessThan(rubric.maxMarks)

    const unmet = criteriaOf(result).filter(criterion => criterion.status !== 'correct')
    expect(unmet.length).toBeGreaterThan(0)
    for (const criterion of unmet) {
      expect(criterion.feedback.length).toBeGreaterThan(0)
      expect(criterion.correction.length).toBeGreaterThan(0)
    }
  })
})

describe('an incorrect answer', () => {
  it('detects reversed relationships that share the expected vocabulary', async () => {
    const result = await grade(answers.incorrect)

    expectMarkInvariants(result)
    // A keyword grader would pass all three: every expected word is present.
    expect(find(result, 'q1-c2').status).toBe('incorrect')
    expect(find(result, 'q1-c3').status).toBe('incorrect')
    expect(find(result, 'q2-c2').status).toBe('incorrect')
    expect(find(result, 'q1-c2').awarded).toBe(0)
    expect(find(result, 'q1-c2').feedback).toMatch(/parallel/i)
  })

  it('still credits the points the student did get right', async () => {
    const result = await grade(answers.incorrect)
    expect(find(result, 'q1-c1').awarded).toBeGreaterThan(0)
  })
})

describe('a blank answer', () => {
  it('scores zero, flags review, and never calls the model', async () => {
    let called = false
    const provider = stubProvider(() => {
      called = true
      return gradingReply(99)
    })

    const result = await grade(answers.blank, provider)

    expect(called).toBe(false)
    expectMarkInvariants(result)
    expect(result.totalAwarded).toBe(0)
    expect(result.needsReview).toBe(true)
    expect(result.confidence).toBe(0)
    expect(criteriaOf(result).every(criterion => criterion.status === 'missing')).toBe(true)
    expect(result.summary).toMatch(/blank|too short/i)
  })

  it('reports why an unreadable scan produced nothing', async () => {
    const result = await gradeAnswer({
      studentOcr: ocrFrom('', { warnings: ['Reading handwriting from an image needs Google Cloud Vision.'] }),
      modelAnswerText,
      questionPaperText,
      rubric,
      provider: mockLlmProvider,
    })

    expect(result.needsReview).toBe(true)
    expect(result.reviewReasons.join(' ')).toMatch(/Vision/i)
  })
})

describe('an answer with OCR-like spelling errors', () => {
  it('grades it the same as the clean answer', async () => {
    const clean = await grade(answers.full)
    const noisy = await grade(answers.ocrNoise, mockLlmProvider, { confidence: 82 })

    expectMarkInvariants(noisy)
    expect(noisy.totalAwarded).toBe(clean.totalAwarded)
  })

  it('lowers confidence in step with the OCR confidence', async () => {
    const clean = await grade(answers.full)
    const noisy = await grade(answers.ocrNoise, mockLlmProvider, { confidence: 82 })
    expect(noisy.confidence).toBeLessThan(clean.confidence)
  })
})

describe('malformed or incomplete model output', () => {
  it('recovers JSON wrapped in prose and code fences', async () => {
    const provider = stubProvider(`Sure! Here is the grading:\n\`\`\`json\n${JSON.stringify(gradingReply(1))}\n\`\`\`\nHope that helps.`)
    const result = await grade(answers.full, provider)

    expectMarkInvariants(result)
    expect(result.totalAwarded).toBeGreaterThan(0)
  })

  it('keeps valid rows, zeroes the malformed ones, and says so', async () => {
    const provider = stubProvider({
      criteria: [
        { criterionId: 'q1-c1', awarded: 2, status: 'correct', feedback: 'Fine.', correction: '', quote: '' },
        { criterionId: 'q1-c2', awarded: 'not a number', status: 'correct' },
        { nonsense: true },
      ],
      strengths: 'not an array',
      summary: 42,
    })

    const result = await grade(answers.full, provider)

    expectMarkInvariants(result)
    expect(find(result, 'q1-c1').awarded).toBe(2)
    expect(find(result, 'q1-c2').awarded).toBe(0)
    // Points the model never returned must be reported, not silently zeroed.
    expect(result.reviewReasons.join(' ')).toMatch(/malformed/i)
    expect(result.reviewReasons.join(' ')).toMatch(/did not grade/i)
    expect(result.needsReview).toBe(true)
    expect(result.strengths).toEqual([])
    expect(typeof result.summary).toBe('string')
  })

  it('gives up with a clear error when nothing can be parsed at all', async () => {
    const provider = stubProvider('<html>502 Bad Gateway</html>')
    await expect(grade(answers.full, provider)).rejects.toThrow(/not valid JSON/i)
  })
})

describe('a model or API failure', () => {
  it('retries, then fails with a message instead of a wrong grade', async () => {
    const { provider, callCount } = failingProvider('connect ECONNREFUSED 127.0.0.1:443')

    await expect(grade(answers.full, provider)).rejects.toThrow(/Grading failed after 2 attempt/i)
    expect(callCount()).toBe(2)
  })

  it('does not retry a failure that cannot succeed on a retry', async () => {
    const { provider, callCount } = failingProvider('GEMINI_API_KEY is not configured.', false)

    await expect(grade(answers.full, provider)).rejects.toThrow(/GEMINI_API_KEY/i)
    expect(callCount()).toBe(1)
  })

  it('times out a model that never responds', async () => {
    const provider = {
      name: 'mock' as const,
      grade: () => new Promise<unknown>(() => {}),
    }
    await expect(grade(answers.full, provider)).rejects.toThrow(/did not respond within/i)
  })
})

describe('a score that would exceed the maximum', () => {
  it('caps each rubric point and records the correction', async () => {
    // 99 marks per point against maxima of 2, 1, 2, 2, 3.
    const result = await grade(answers.full, stubProvider(gradingReply(99)))

    expectMarkInvariants(result)
    expect(result.totalAwarded).toBe(rubric.maxMarks)
    expect(result.percentage).toBe(100)
    expect(result.adjustments.length).toBe(5)
    expect(result.adjustments[0]).toMatch(/capped at the rubric maximum/i)
    expect(result.needsReview).toBe(true)
  })

  it('raises a negative mark to zero', async () => {
    const result = await grade(answers.full, stubProvider(gradingReply(-4)))

    expectMarkInvariants(result)
    expect(result.totalAwarded).toBe(0)
    expect(result.adjustments.join(' ')).toMatch(/raised to 0/i)
  })
})

describe('evidence', () => {
  it('flags a quote that does not appear in the answer', async () => {
    const provider = stubProvider(gradingReply(1, { quote: 'a sentence the student never wrote at all' }))
    const result = await grade(answers.full, provider)

    expect(criteriaOf(result).every(criterion => criterion.quoteVerified === false)).toBe(true)
    expect(result.adjustments.join(' ')).toMatch(/not found in the answer/i)
    expect(result.needsReview).toBe(true)
  })

  it('accepts a quote that survives OCR damage', async () => {
    const provider = stubProvider(gradingReply(1, { quote: 'connected in serles in a closed path' }))
    const result = await gradeAnswer({
      studentOcr: ocrFrom(answers.ocrNoise),
      modelAnswerText,
      questionPaperText,
      rubric,
      provider,
    })

    expect(criteriaOf(result).every(criterion => criterion.quoteVerified)).toBe(true)
  })
})
