/** Mirrors backend/src/types/grading.ts. Kept as the single client-side contract. */

export type UploadKind = 'questionPaper' | 'modelAnswer' | 'studentAnswer'
export type SessionStatus = 'created' | 'uploaded' | 'processing' | 'graded' | 'failed'
export type PointStatus = 'correct' | 'partial' | 'missing' | 'incorrect'
export type AnnotationType = 'correct' | 'missing' | 'incorrect' | 'spelling' | 'feedback'
export type AnnotationSource = 'ai' | 'teacher'

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

export interface OcrResult {
  uploadId: string
  provider: 'vision' | 'pdf-text' | 'gemini' | 'mock'
  text: string
  averageConfidence: number
  pages: OcrPage[]
  words: OcrWord[]
  warnings: string[]
}

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
  inferred: boolean
}

export interface CriterionResult {
  criterionId: string
  questionId: string
  criterion: string
  awarded: number
  maxMarks: number
  status: PointStatus
  feedback: string
  correction: string
  quote: string
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

export interface GradingResult {
  totalAwarded: number
  maxMarks: number
  percentage: number
  questions: QuestionResult[]
  strengths: string[]
  improvements: string[]
  summary: string
  confidence: number
  needsReview: boolean
  reviewReasons: string[]
  provider: 'gemini' | 'mock'
  adjustments: string[]
}

export interface Annotation {
  id: string
  sessionId: string
  reportId: string | null
  criterionId: string | null
  page: number
  /** Normalised 0..1 rectangle with a top-left origin. */
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

export type GradingReportSummary = Omit<GradingReport, 'ocrText' | 'grading' | 'rubric'>

export interface SessionState {
  session: GradingSession
  uploads: Record<UploadKind, UploadedFile | null>
  missing: UploadKind[]
  report: GradingReport | null
  annotations: Annotation[]
  ocr: OcrResult | null
}

export interface ServiceConfig {
  llmProvider: 'gemini' | 'mock'
  ocrProvider: 'vision' | 'pdf-text' | 'gemini' | 'mock'
  imageOcrAvailable: boolean
  /** Which engine will read a scan, or null when none is configured. */
  handwritingProvider: 'vision' | 'gemini' | null
  maxUploadBytes: number
  reviewConfidenceThreshold: number
}
