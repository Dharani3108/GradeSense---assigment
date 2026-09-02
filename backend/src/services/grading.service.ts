import { z } from 'zod'
import { env } from '../config/env.js'
import { LlmError, resolveLlmProvider, type LlmProvider } from '../providers/llm/index.js'
import type { CriterionResult, GradingResult, OcrResult, PointStatus, QuestionResult, Rubric } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { clamp, quoteAppearsIn, roundMarks } from '../utils/text.js'

/**
 * Everything the model returns passes through this module before it can become
 * a report. The model is treated as an untrusted source: its marks are clamped
 * to the rubric, its evidence is checked against the OCR text, and anything it
 * fails to answer becomes a flagged gap rather than a silent zero.
 */

const rawCriterionSchema = z.object({
  criterionId: z.string().min(1),
  awarded: z.number().finite(),
  status: z.enum(['correct', 'partial', 'missing', 'incorrect']).optional(),
  feedback: z.string().optional(),
  correction: z.string().optional(),
  quote: z.string().optional(),
})

/**
 * There is deliberately no schema for the envelope. Each top-level field is
 * read defensively instead, so one bad field (a `strengths` that came back as a
 * string) cannot throw away a response whose rubric decisions were fine.
 */

export interface GradeInput {
  studentOcr: OcrResult
  modelAnswerText: string
  questionPaperText: string
  rubric: Rubric
  /** Injectable so tests can simulate failures without touching the network. */
  provider?: LlmProvider
}

function stringList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map(entry => entry.trim()).slice(0, limit)
}

/**
 * Models wrap JSON in prose or code fences often enough that a plain
 * `JSON.parse` is not good enough. Returns undefined when nothing is salvageable.
 */
export function coerceJson(raw: unknown): Record<string, unknown> | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw !== 'string') return undefined
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim()
  const candidates = [withoutFence]
  const first = withoutFence.indexOf('{')
  const last = withoutFence.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(withoutFence.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

/**
 * Races the model against the clock. Signalling abort is not enough on its own:
 * a client that ignores the signal would otherwise hang the request forever, so
 * the timer rejects directly.
 */
function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const expired = new LlmError(`The grading model did not respond within ${timeoutMs}ms.`, true)
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(expired)
    }, timeoutMs)
    work(controller.signal).then(
      value => { clearTimeout(timer); resolve(value) },
      (error: unknown) => {
        clearTimeout(timer)
        reject(controller.signal.aborted ? expired : error)
      },
    )
  })
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Retries transient model failures, then gives up with a message a teacher can act on. */
async function callModel(provider: LlmProvider, input: GradeInput) {
  const request = {
    studentText: input.studentOcr.text,
    modelAnswerText: input.modelAnswerText,
    questionPaperText: input.questionPaperText,
    rubric: input.rubric,
  }
  let lastMessage = 'The grading model could not be reached.'
  for (let attempt = 1; attempt <= env.llmMaxAttempts; attempt += 1) {
    try {
      const raw = await withTimeout(signal => provider.grade(request, signal), env.llmTimeoutMs)
      const parsed = coerceJson(raw)
      if (parsed) return { parsed, attempts: attempt }
      lastMessage = 'The grading model returned a response that was not valid JSON.'
    } catch (error) {
      const retryable = error instanceof LlmError ? error.retryable : true
      lastMessage = error instanceof Error ? error.message : lastMessage
      if (!retryable) break
    }
    if (attempt < env.llmMaxAttempts) await delay(250 * attempt)
  }
  throw new ApiError(502, `Grading failed after ${env.llmMaxAttempts} attempt(s). ${lastMessage}`)
}

/** Keeps the displayed status consistent with the marks actually awarded. */
function reconcileStatus(awarded: number, maxMarks: number, claimed: PointStatus | undefined): PointStatus {
  if (awarded >= maxMarks) return 'correct'
  if (awarded <= 0) return claimed === 'incorrect' ? 'incorrect' : 'missing'
  return 'partial'
}

function blankResult(rubric: Rubric, providerName: GradingResult['provider'], reason: string): GradingResult {
  const questions: QuestionResult[] = rubric.questions.map(question => ({
    questionId: question.id,
    number: question.number,
    subject: question.subject,
    awarded: 0,
    maxMarks: question.maxMarks,
    criteria: question.criteria.map<CriterionResult>(criterion => ({
      criterionId: criterion.id,
      questionId: question.id,
      criterion: criterion.text,
      awarded: 0,
      maxMarks: criterion.maxMarks,
      status: 'missing',
      feedback: 'No answer text was available for this rubric point.',
      correction: criterion.text,
      quote: '',
      quoteVerified: false,
    })),
  }))
  return {
    totalAwarded: 0,
    maxMarks: rubric.maxMarks,
    percentage: 0,
    questions,
    strengths: [],
    improvements: ['Submit a legible answer so the paper can be graded.'],
    summary: reason,
    confidence: 0,
    needsReview: true,
    reviewReasons: [reason],
    provider: providerName,
    adjustments: [],
  }
}

export async function gradeAnswer(input: GradeInput): Promise<GradingResult> {
  let provider = input.provider ?? resolveLlmProvider()
  const { rubric, studentOcr } = input
  const studentText = studentOcr.text ?? ''
  const meaningful = studentText.replace(/\s+/g, ' ').trim()

  if (meaningful.length < env.blankAnswerMinChars) {
    const reason = studentOcr.warnings.length
      ? `No answer text could be read. ${studentOcr.warnings[0]}`
      : 'The answer sheet is blank or too short to grade, so every rubric point scored zero.'
    return blankResult(rubric, provider.name, reason)
  }

  let parsed: Record<string, unknown>
  try {
    const result = await callModel(provider, input)
    parsed = result.parsed
  } catch (error) {
    if (!input.provider && provider.name === 'gemini') {
      console.warn(`[Grading] Gemini provider failed (${error instanceof Error ? error.message : error}), falling back to offline reference grader.`)
      const { mockLlmProvider } = await import('../providers/llm/mock.js')
      provider = mockLlmProvider
      const result = await mockLlmProvider.grade({
        studentText,
        modelAnswerText: input.modelAnswerText,
        questionPaperText: input.questionPaperText,
        rubric,
      }, new AbortController().signal)
      const coerced = coerceJson(result)
      if (coerced) {
        parsed = coerced
      } else {
        throw error
      }
    } else {
      throw error
    }
  }

  const rawCriteria = Array.isArray(parsed.criteria) ? parsed.criteria : []
  const byId = new Map<string, z.infer<typeof rawCriterionSchema>>()
  let discarded = 0
  for (const entry of rawCriteria) {
    const result = rawCriterionSchema.safeParse(entry)
    if (result.success) byId.set(result.data.criterionId, result.data)
    else discarded += 1
  }

  const adjustments: string[] = []
  const reviewReasons: string[] = []
  let unanswered = 0
  let quotesClaimed = 0
  let quotesVerified = 0

  const questions: QuestionResult[] = rubric.questions.map(question => {
    const criteria = question.criteria.map<CriterionResult>(criterion => {
      const label = `Q${question.number} point ${criterion.id.split('-c')[1] ?? '?'}`
      const entry = byId.get(criterion.id)

      if (!entry) {
        unanswered += 1
        return {
          criterionId: criterion.id,
          questionId: question.id,
          criterion: criterion.text,
          awarded: 0,
          maxMarks: criterion.maxMarks,
          status: 'missing',
          feedback: 'The grading model did not return a decision for this rubric point, so no marks were awarded.',
          correction: criterion.text,
          quote: '',
          quoteVerified: false,
        }
      }

      const requested = entry.awarded
      const awarded = roundMarks(clamp(requested, 0, criterion.maxMarks))
      if (requested > criterion.maxMarks) adjustments.push(`${label}: model awarded ${requested}, capped at the rubric maximum of ${criterion.maxMarks}.`)
      if (requested < 0) adjustments.push(`${label}: model awarded ${requested}, raised to 0.`)

      const quote = (entry.quote ?? '').trim()
      const verified = quote.length > 0 && quoteAppearsIn(quote, studentText)
      if (quote) {
        quotesClaimed += 1
        if (verified) quotesVerified += 1
      }
      if (quote && !verified && awarded > 0) {
        adjustments.push(`${label}: the quoted evidence was not found in the answer, so the point is flagged for review.`)
      }

      return {
        criterionId: criterion.id,
        questionId: question.id,
        criterion: criterion.text,
        awarded,
        maxMarks: criterion.maxMarks,
        status: reconcileStatus(awarded, criterion.maxMarks, entry.status),
        feedback: (entry.feedback ?? '').trim() || 'No specific feedback was produced for this rubric point.',
        correction: (entry.correction ?? '').trim(),
        quote,
        quoteVerified: verified,
      }
    })

    // The question total is the sum of its points by construction, never a free number.
    const awarded = roundMarks(clamp(criteria.reduce((total, criterion) => total + criterion.awarded, 0), 0, question.maxMarks))
    return { questionId: question.id, number: question.number, subject: question.subject, awarded, maxMarks: question.maxMarks, criteria }
  })

  const totalAwarded = roundMarks(clamp(questions.reduce((total, question) => total + question.awarded, 0), 0, rubric.maxMarks))
  const percentage = rubric.maxMarks > 0 ? Math.round((totalAwarded / rubric.maxMarks) * 100) : 0

  if (!rawCriteria.length) reviewReasons.push('The grading model returned no rubric decisions at all.')
  if (discarded) reviewReasons.push(`${discarded} rubric decision(s) came back malformed and were discarded.`)
  if (unanswered) reviewReasons.push(`The model did not grade ${unanswered} of ${rubric.questions.flatMap(question => question.criteria).length} rubric points.`)
  if (adjustments.length) reviewReasons.push('Marks or evidence had to be corrected by the guard rails.')
  if (rubric.inferred) reviewReasons.push('The rubric could not be parsed cleanly, so the marks available may be wrong.')
  for (const warning of studentOcr.warnings) reviewReasons.push(warning)

  const evidenceRate = quotesClaimed ? quotesVerified / quotesClaimed : 0
  // The offline grader matches vocabulary; it cannot judge argument quality, so
  // its marks are always presented as provisional.
  const modelTrust = provider.name === 'gemini' ? 95 : 55
  const confidence = Math.round(clamp(0.4 * studentOcr.averageConfidence + 0.35 * evidenceRate * 100 + 0.25 * modelTrust, 0, 100))
  if (provider.name === 'mock') {
    reviewReasons.push('Graded by the offline reference grader rather than a language model, so every mark needs a teacher to confirm it.')
  }
  if (confidence < env.reviewConfidenceThreshold) reviewReasons.push(`Confidence is ${confidence}%, below the ${env.reviewConfidenceThreshold}% review threshold.`)

  const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.trim()
    : `Scored ${totalAwarded} of ${rubric.maxMarks} across ${rubric.questions.length} question(s).`

  return {
    totalAwarded,
    maxMarks: rubric.maxMarks,
    percentage,
    questions,
    strengths: stringList(parsed.strengths),
    improvements: stringList(parsed.improvements),
    summary,
    confidence,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    provider: provider.name,
    adjustments,
  }
}
