export type UploadKind = 'questionPaper' | 'modelAnswer' | 'studentAnswer'

export interface UploadedFile {
  id: string
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
  status: 'uploaded' | 'processing' | 'complete' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface Annotation {
  id: string
  sessionId: string
  page: number
  label: string
  excerpt: string
  createdAt: string
}

export interface OCRResult {
  uploadId: string
  extractedText: string
  averageConfidence: number
  words: OCRWord[]
}

export interface OCRWord {
  text: string
  confidence: number
  boundingBox: Array<{ x: number; y: number }>
}

export interface GradingResult {
  score: number
  percentage: number
  rubricBreakdown: RubricBreakdown[]
  strengths: string[]
  improvements: string[]
  evidence: GradingEvidence[]
  summary: string
}

export interface RubricBreakdown {
  criterion: string
  score: number
  feedback: string
}

export interface GradingEvidence {
  quote: string
  reason: string
  criterion: string
}

export interface GradingReport {
  id: string
  studentName: string
  assignment: string
  score: number
  percentage: number
  confidence: number
  ocrText: string
  grading: GradingResult
  createdAt: string
}
