import { v4 as uuid } from 'uuid'
import { db } from '../db/database.js'
import type { Annotation, AnnotationType, CriterionResult, GradingResult, OcrResult, OcrWord } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { clamp, editDistance, locateQuote, normalizeToken, similarity, unionRect } from '../utils/text.js'

/**
 * Annotations are persisted rows, not a view of the grading result. That is what
 * lets a teacher move, retype or delete one without regrading the paper, and it
 * is what the PDF export renders.
 */

type AnnotationRow = {
  id: string
  sessionId: string
  reportId: string | null
  criterionId: string | null
  page: number
  x: number
  y: number
  width: number
  height: number
  type: string
  quote: string
  comment: string
  correction: string
  source: string
  createdAt: string
  updatedAt: string
}

const SELECT = `SELECT id, session_id as sessionId, report_id as reportId, criterion_id as criterionId, page,
  x, y, width, height, type, quote, comment, correction, source, created_at as createdAt, updated_at as updatedAt
  FROM annotations`

function toAnnotation(row: AnnotationRow): Annotation {
  return { ...row, type: row.type as AnnotationType, source: row.source === 'teacher' ? 'teacher' : 'ai' }
}

/* --------------------------------------------------------------- placing --- */

const MARGIN_X = 0.70
const MARGIN_WIDTH = 0.27
const MARGIN_HEIGHT = 0.035

function statusToType(status: CriterionResult['status']): AnnotationType {
  if (status === 'correct') return 'correct'
  if (status === 'incorrect') return 'incorrect'
  if (status === 'missing') return 'missing'
  return 'feedback'
}

/**
 * A rubric point the student never attempted has nothing to underline, so it is
 * pinned in the right margin beneath the last thing that question did produce.
 */
function marginSlot(page: number, used: Map<number, number>) {
  const next = used.get(page) ?? 0.08
  used.set(page, Math.min(0.92, next + MARGIN_HEIGHT + 0.012))
  return { page, x: MARGIN_X, y: next, width: MARGIN_WIDTH, height: MARGIN_HEIGHT }
}

/* -------------------------------------------------------------- spelling --- */

/**
 * Ordinary English that will not appear in a marking rubric. Without it, a
 * perfectly spelled everyday word looks like a typo of a rubric term.
 */
const COMMON_WORDS = new Set([
  'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already', 'also', 'although',
  'always', 'among', 'another', 'answer', 'anyone', 'anything', 'around', 'because', 'become', 'becomes', 'been',
  'before', 'begin', 'behind', 'being', 'believe', 'below', 'best', 'better', 'between', 'beyond', 'both', 'bring',
  'buyer', 'buyers', 'called', 'cannot', 'carry', 'certain', 'change', 'changes', 'class', 'classroom', 'clear',
  'clearly', 'come', 'coming', 'common', 'complete', 'concept', 'could', 'course', 'create', 'creates', 'develop',
  'different', 'difficult', 'does', 'doing', 'done', 'down', 'draw', 'drawn', 'during', 'each', 'early', 'easier',
  'easily', 'easy', 'either', 'enough', 'even', 'every', 'example', 'except', 'exam', 'explain', 'fact', 'find',
  'first', 'follow', 'found', 'from', 'further', 'general', 'generally', 'give', 'given', 'goes', 'going', 'good',
  'graph', 'great', 'have', 'having', 'help', 'here', 'high', 'home', 'however', 'idea', 'ideas', 'important',
  'instead', 'internet', 'into', 'itself', 'keep', 'kind', 'know', 'large', 'learn', 'learning', 'least', 'library',
  'like', 'line', 'lines', 'little', 'long', 'look', 'made', 'main', 'make', 'makes', 'making', 'many', 'market',
  'mean', 'means', 'measure', 'measures', 'might', 'more', 'most', 'much', 'must', 'need', 'never', 'next', 'often',
  'once', 'only', 'opinion', 'order', 'other', 'over', 'part', 'people', 'perhaps', 'place', 'placed', 'places',
  'point', 'problem', 'produce', 'question', 'quite', 'rather', 'really', 'reason', 'same', 'school', 'science',
  'second', 'seconds', 'seem', 'seller', 'sellers', 'several', 'should', 'show', 'shows', 'simple', 'since', 'small',
  'some', 'something', 'sometimes', 'speed', 'still', 'student', 'students', 'such', 'take', 'teacher', 'technology',
  'than', 'that', 'their', 'them', 'then', 'there', 'therefore', 'these', 'they', 'thing', 'things', 'think', 'this',
  'those', 'though', 'three', 'through', 'time', 'today', 'together', 'topic', 'topics', 'towards', 'understand',
  'under', 'until', 'used', 'useful', 'using', 'very', 'video', 'videos', 'want', 'watch', 'website', 'websites',
  'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'without', 'work', 'would', 'write', 'your',
])

const SUFFIXES = ['ing', 'ies', 'es', 'ed', 's', 'e']

/** Crude stem, only good enough to tell a plural or tense apart from a typo. */
function stem(word: string) {
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return stem(word.slice(0, -suffix.length))
  }
  return word
}

/**
 * Flags words that are close to, but not equal to, a word used in the reference
 * material. Deliberately conservative: it needs one unambiguous candidate that
 * is not merely a different inflection of the same word, or it says nothing.
 * A wrong "did you mean" on a correctly spelled word costs more trust than a
 * missed typo.
 */
function findSpellingIssues(words: OcrWord[], referenceText: string, limit = 8) {
  const dictionary = new Set<string>(COMMON_WORDS)
  for (const token of referenceText.split(/[^\p{L}\p{N}]+/u)) {
    const normalized = normalizeToken(token)
    if (normalized.length > 2) dictionary.add(normalized)
  }
  const stems = new Set([...dictionary].map(stem))
  const vocabulary = [...dictionary].filter(word => word.length >= 6)

  const issues: Array<{ word: OcrWord; suggestion: string }> = []
  const seen = new Set<string>()

  for (const word of words) {
    if (issues.length >= limit) break
    const normalized = normalizeToken(word.text)
    if (normalized.length < 6 || dictionary.has(normalized) || seen.has(normalized)) continue
    // A known word in another form is not a misspelling.
    if (stems.has(stem(normalized))) continue

    const candidates = vocabulary.filter(entry =>
      Math.abs(entry.length - normalized.length) <= 2
      && editDistance(entry, normalized) <= 2
      && similarity(entry, normalized) >= 0.8
      && stem(entry) !== stem(normalized))
    if (candidates.length !== 1) continue

    seen.add(normalized)
    issues.push({ word, suggestion: candidates[0] })
  }
  return issues
}

/* ------------------------------------------------------------ generation --- */

export interface GenerateInput {
  sessionId: string
  reportId: string
  grading: GradingResult
  ocr: OcrResult
  referenceText: string
}

/**
 * Builds the AI annotation set for a freshly graded paper. Existing annotations
 * for the session are cleared first so a regrade does not leave stale boxes.
 */
export function generateAnnotations({ sessionId, reportId, grading, ocr, referenceText }: GenerateInput): Annotation[] {
  const now = new Date().toISOString()
  const marginUse = new Map<number, number>()
  const drafts: Annotation[] = []

  const push = (
    rect: { page: number; x: number; y: number; width: number; height: number },
    type: AnnotationType,
    criterionId: string | null,
    quote: string,
    comment: string,
    correction: string,
  ) => {
    drafts.push({
      id: uuid(),
      sessionId,
      reportId,
      criterionId,
      page: rect.page,
      x: clamp(rect.x, 0, 0.999),
      y: clamp(rect.y, 0, 0.999),
      width: clamp(rect.width, 0.01, 1 - clamp(rect.x, 0, 0.99)),
      height: clamp(rect.height, 0.012, 1 - clamp(rect.y, 0, 0.99)),
      type,
      quote,
      comment,
      correction,
      source: 'ai',
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const question of grading.questions) {
    for (const criterion of question.criteria) {
      const comment = `${criterion.awarded}/${criterion.maxMarks} — ${criterion.feedback}`
      const rects = criterion.quote && criterion.quoteVerified ? locateQuote(criterion.quote, ocr.words) : []
      const box = unionRect(rects)
      if (box) {
        push(box, statusToType(criterion.status), criterion.criterionId, criterion.quote, comment, criterion.correction)
        continue
      }
      // Nothing to point at: park it in the margin of the page this question reached.
      const page = drafts.find(draft => draft.criterionId?.startsWith(`${question.questionId}-`))?.page ?? 0
      push(marginSlot(page, marginUse), statusToType(criterion.status), criterion.criterionId, criterion.quote, comment, criterion.correction)
    }
  }

  for (const issue of findSpellingIssues(ocr.words, referenceText)) {
    push(
      { page: issue.word.page, x: issue.word.x, y: issue.word.y, width: issue.word.width, height: issue.word.height },
      'spelling',
      null,
      issue.word.text,
      `Check the spelling of "${issue.word.text}".`,
      issue.suggestion,
    )
  }

  return drafts
}

/* ------------------------------------------------------------ persistence --- */

const insert = () => db.prepare(`INSERT INTO annotations
  (id, session_id, report_id, criterion_id, page, x, y, width, height, type, quote, comment, correction, source, created_at, updated_at)
  VALUES (@id, @sessionId, @reportId, @criterionId, @page, @x, @y, @width, @height, @type, @quote, @comment, @correction, @source, @createdAt, @updatedAt)`)

export function replaceAnnotations(sessionId: string, annotations: Annotation[]) {
  const statement = insert()
  const transaction = db.transaction((rows: Annotation[]) => {
    db.prepare('DELETE FROM annotations WHERE session_id = ?').run(sessionId)
    for (const row of rows) statement.run(row)
  })
  transaction(annotations)
  return annotations
}

export function listAnnotations(sessionId: string): Annotation[] {
  return (db.prepare(`${SELECT} WHERE session_id = ? ORDER BY page, y, x`).all(sessionId) as AnnotationRow[]).map(toAnnotation)
}

export function getAnnotation(id: string): Annotation | undefined {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as AnnotationRow | undefined
  return row ? toAnnotation(row) : undefined
}

export interface AnnotationInput {
  page: number
  x: number
  y: number
  width: number
  height: number
  type: AnnotationType
  quote?: string
  comment?: string
  correction?: string
  criterionId?: string | null
}

export function createAnnotation(sessionId: string, input: AnnotationInput): Annotation {
  const now = new Date().toISOString()
  const annotation: Annotation = {
    id: uuid(),
    sessionId,
    reportId: null,
    criterionId: input.criterionId ?? null,
    page: Math.max(0, Math.trunc(input.page)),
    x: clamp(input.x, 0, 0.999),
    y: clamp(input.y, 0, 0.999),
    width: clamp(input.width, 0.005, 1),
    height: clamp(input.height, 0.005, 1),
    type: input.type,
    quote: input.quote ?? '',
    comment: input.comment ?? '',
    correction: input.correction ?? '',
    source: 'teacher',
    createdAt: now,
    updatedAt: now,
  }
  insert().run(annotation)
  return annotation
}

export type AnnotationPatch = Partial<AnnotationInput>

/** Moving, retyping or reclassifying an annotation never touches the grading result. */
export function updateAnnotation(id: string, patch: AnnotationPatch): Annotation {
  const existing = getAnnotation(id)
  if (!existing) throw new ApiError(404, 'Annotation was not found.')
  const next: Annotation = {
    ...existing,
    page: patch.page === undefined ? existing.page : Math.max(0, Math.trunc(patch.page)),
    x: patch.x === undefined ? existing.x : clamp(patch.x, 0, 0.999),
    y: patch.y === undefined ? existing.y : clamp(patch.y, 0, 0.999),
    width: patch.width === undefined ? existing.width : clamp(patch.width, 0.005, 1),
    height: patch.height === undefined ? existing.height : clamp(patch.height, 0.005, 1),
    type: patch.type ?? existing.type,
    quote: patch.quote ?? existing.quote,
    comment: patch.comment ?? existing.comment,
    correction: patch.correction ?? existing.correction,
    criterionId: patch.criterionId === undefined ? existing.criterionId : patch.criterionId,
    updatedAt: new Date().toISOString(),
  }
  db.prepare(`UPDATE annotations SET page = @page, x = @x, y = @y, width = @width, height = @height,
    type = @type, quote = @quote, comment = @comment, correction = @correction, criterion_id = @criterionId,
    updated_at = @updatedAt WHERE id = @id`).run(next)
  return next
}

export function deleteAnnotation(id: string) {
  return db.prepare('DELETE FROM annotations WHERE id = ?').run(id).changes > 0
}
