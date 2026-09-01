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
  status: 'not_started'
  text: string
  confidence: number | null
}

export interface GradingResult {
  sessionId: string
  status: 'not_started'
  score: number | null
  maximumScore: number | null
  annotations: Annotation[]
}
