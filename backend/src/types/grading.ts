export type UploadKind = 'questionPaper' | 'modelAnswer' | 'studentAnswer'

export interface UploadedFile {
  id: string
  sessionId: string | null
  originalName: string
  storedName: string
  mimeType: string
  sizeBytes: number
  kind: UploadKind
  path: string
  createdAt: string
}

export type SessionStatus = 'created' | 'uploaded' | 'processing' | 'graded' | 'failed'

export interface GradingSession {
  id: string
  status: SessionStatus
  studentName: string
  assignment: string
  questionPaperId: string | null
  modelAnswerId: string | null
  studentAnswerId: string | null
  reportId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ OCR --- */

/** All geometry is normalised to 0..1 of the page box with a top-left origin. */
export interface OcrWord {
  text: string
  confidence: number
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface OcrPage {
  page: number
  width: number
  height: number
  text: string
}

export type OcrProviderName = 'vision' | 'pdf-text' | 'gemini' | 'mock'

export interface OcrResult {
  uploadId: string
  provider: OcrProviderName
  text: string
  averageConfidence: number
  pages: OcrPage[]
  words: OcrWord[]
  /** Non-fatal problems a teacher should see, e.g. a scan with no text layer. */
  warnings: string[]
}

/* --------------------------------------------------------------- Rubric --- */

export interface RubricCriterion {
  id: string
  questionId: string
  text: string
  maxMarks: number
}

export interface RubricQuestion {
  id: string
  number: number
  subject: string
  maxMarks: number
  criteria: RubricCriterion[]
}

export interface Rubric {
  questions: RubricQuestion[]
  maxMarks: number
  /** True when the rubric was inferred heuristically rather than parsed cleanly. */
  inferred: boolean
}

/* -------------------------------------------------------------- Grading --- */

export type PointStatus = 'correct' | 'partial' | 'missing' | 'incorrect'

export interface CriterionResult {
  criterionId: string
  questionId: string
  criterion: string
  awarded: number
  maxMarks: number
  status: PointStatus
  /** Specific, teacher-facing feedback for this rubric point. */
  feedback: string
  /** What a full-credit answer would have said. */
  correction: string
  /** Exact quote from the student answer that justifies the decision. */
  quote: string
  /** Whether the quote was actually found in the OCR text. */
  quoteVerified: boolean
}

export interface QuestionResult {
  questionId: string
  number: number
  subject: string
  awarded: number
  maxMarks: number
  criteria: CriterionResult[]
}

export type LlmProviderName = 'gemini' | 'grok' | 'mock'

export interface GradingResult {
  totalAwarded: number
  maxMarks: number
  percentage: number
  questions: QuestionResult[]
  strengths: string[]
  improvements: string[]
  summary: string
  /** Blended 0..100 confidence from OCR quality and evidence verification. */
  confidence: number
  needsReview: boolean
  reviewReasons: string[]
  provider: LlmProviderName
  /** Audit trail of every correction the guard rails applied to the raw output. */
  adjustments: string[]
}

/* ---------------------------------------------------------- Annotations --- */

export type AnnotationType = 'correct' | 'missing' | 'incorrect' | 'spelling' | 'feedback'
export type AnnotationSource = 'ai' | 'teacher'

export interface Annotation {
  id: string
  sessionId: string
  reportId: string | null
  criterionId: string | null
  page: number
  /** Normalised 0..1 rectangle, top-left origin. */
  x: number
  y: number
  width: number
  height: number
  type: AnnotationType
  quote: string
  comment: string
  correction: string
  source: AnnotationSource
  createdAt: string
  updatedAt: string
}

/* -------------------------------------------------------------- Reports --- */

export interface GradingReport {
  id: string
  sessionId: string
  studentName: string
  assignment: string
  totalAwarded: number
  maxMarks: number
  percentage: number
  confidence: number
  needsReview: boolean
  ocrText: string
  grading: GradingResult
  rubric: Rubric
  createdAt: string
}

export interface GradingReportSummary {
  id: string
  sessionId: string
  studentName: string
  assignment: string
  totalAwarded: number
  maxMarks: number
  percentage: number
  confidence: number
  needsReview: boolean
  createdAt: string
}
