import type { Rubric, RubricCriterion, RubricQuestion } from '../types/grading.js'
import { roundMarks } from '../utils/text.js'

/**
 * Turns the marking-rubric document into a structured rubric so that marks can
 * be validated against a real per-criterion maximum instead of a hard-coded
 * total. Parsing is best effort: when the document does not follow the expected
 * shape the rubric is inferred and flagged, and the report says so.
 */

const QUESTION_HEADING = /^\s*Q(?:uestion)?\s*(\d+)\s*[-–—:]\s*(.+?)\s*$/i
const RUBRIC_HEADING = /^\s*marking\s+rubric\s*$/i
const TOTAL_LINE = /^\s*total\b\D*(\d+(?:\.\d+)?)?\s*$/i
const COLUMN_HEADING = /^\s*criterion\b.*marks?\s*$/i
const GUIDANCE_HEADING = /^\s*important\s+grading\s+guidance\s*$/i
/** A rubric row is "some criterion text ..... 1", i.e. trailing marks. */
const CRITERION_ROW = /^(.*\S)\s+(\d+(?:\.\d+)?)\s*$/
const MARKS_IN_HEADING = /(\d+(?:\.\d+)?)\s*marks?/i

interface QuestionBlock {
  number: number
  subject: string
  lines: string[]
}

function splitQuestions(lines: string[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  for (const line of lines) {
    const heading = QUESTION_HEADING.exec(line)
    if (heading) {
      blocks.push({ number: Number(heading[1]), subject: heading[2].trim(), lines: [] })
      continue
    }
    blocks[blocks.length - 1]?.lines.push(line)
  }
  return blocks
}

/**
 * Reads the rows under "Marking rubric". Rows that wrap across several visual
 * lines are joined until a line ends with the mark value.
 */
function parseCriteria(block: QuestionBlock, questionId: string): { criteria: RubricCriterion[]; declaredTotal?: number } {
  const start = block.lines.findIndex(line => RUBRIC_HEADING.test(line))
  if (start === -1) return { criteria: [] }

  const criteria: RubricCriterion[] = []
  let declaredTotal: number | undefined
  let pending = ''

  for (const line of block.lines.slice(start + 1)) {
    if (GUIDANCE_HEADING.test(line)) break
    if (COLUMN_HEADING.test(line) || !line.trim()) continue

    const total = TOTAL_LINE.exec(line)
    if (total) {
      if (total[1]) declaredTotal = Number(total[1])
      break
    }

    const candidate = pending ? `${pending} ${line.trim()}` : line.trim()
    const row = CRITERION_ROW.exec(candidate)
    if (!row) {
      pending = candidate
      continue
    }
    const text = row[1].trim()
    const maxMarks = Number(row[2])
    // Guard against a stray page number being read as a rubric row.
    if (text.length < 12 || !Number.isFinite(maxMarks) || maxMarks <= 0) {
      pending = candidate
      continue
    }
    criteria.push({ id: `${questionId}-c${criteria.length + 1}`, questionId, text, maxMarks })
    pending = ''
  }

  return { criteria, declaredTotal }
}

/** Falls back to one whole-question criterion when no rubric table is present. */
function inferCriteria(block: QuestionBlock, questionId: string): RubricCriterion[] {
  const declared = block.lines.map(line => MARKS_IN_HEADING.exec(line)).find(Boolean)
  const maxMarks = declared ? Number(declared[1]) : 5
  return [{
    id: `${questionId}-c1`,
    questionId,
    text: `Overall quality of the answer to question ${block.number} (${block.subject})`,
    maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 5,
  }]
}

export function parseRubric(modelAnswerText: string): Rubric {
  const lines = modelAnswerText.replace(/\r\n/g, '\n').split('\n').map(line => line.trim())
  const blocks = splitQuestions(lines)
  let inferred = false

  const questions: RubricQuestion[] = blocks.map(block => {
    const questionId = `q${block.number}`
    const parsed = parseCriteria(block, questionId)
    let criteria = parsed.criteria
    if (!criteria.length) {
      inferred = true
      criteria = inferCriteria(block, questionId)
    }
    const summed = roundMarks(criteria.reduce((total, criterion) => total + criterion.maxMarks, 0))
    // The rubric's own total wins only if the rows do not add up to it.
    if (parsed.declaredTotal !== undefined && parsed.declaredTotal !== summed) inferred = true
    return { id: questionId, number: block.number, subject: block.subject, maxMarks: summed, criteria }
  })

  if (!questions.length) {
    // Nothing recognisable at all: grade the paper as a single 10-mark answer.
    inferred = true
    const fallbackId = 'q1'
    return {
      inferred,
      maxMarks: 10,
      questions: [{
        id: fallbackId,
        number: 1,
        subject: 'Answer',
        maxMarks: 10,
        criteria: [
          { id: `${fallbackId}-c1`, questionId: fallbackId, text: 'Accuracy and correctness of the content', maxMarks: 4 },
          { id: `${fallbackId}-c2`, questionId: fallbackId, text: 'Use of relevant evidence, examples or working', maxMarks: 3 },
          { id: `${fallbackId}-c3`, questionId: fallbackId, text: 'Structure, clarity and communication', maxMarks: 3 },
        ],
      }],
    }
  }

  return { questions, maxMarks: roundMarks(questions.reduce((total, question) => total + question.maxMarks, 0)), inferred }
}

/**
 * Returns only the explanatory prose of the model answer, dropping each
 * question's marking table and the grading guidance that follows it.
 *
 * Both matter. The rubric rows repeat the criterion text verbatim, so a
 * criterion always "matches" its own row and learns nothing from the model
 * answer. The guidance describes mistakes ("if the student places the voltmeter
 * in series ... that is a substantive error"), which reads as the model answer
 * asserting the wrong relationship.
 */
export function extractProse(modelAnswerText: string): string {
  const lines = modelAnswerText.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []
  let skipping = false
  for (const line of lines) {
    if (QUESTION_HEADING.test(line)) skipping = false
    else if (RUBRIC_HEADING.test(line)) skipping = true
    if (!skipping) kept.push(line)
  }
  return kept.join('\n')
}

export function findCriterion(rubric: Rubric, criterionId: string) {
  for (const question of rubric.questions) {
    const criterion = question.criteria.find(entry => entry.id === criterionId)
    if (criterion) return { question, criterion }
  }
  return undefined
}
