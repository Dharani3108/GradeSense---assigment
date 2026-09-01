import { createContext, useContext, useState, type ReactNode } from 'react'

export interface OcrWord {
  text: string
  confidence: number
  boundingBox: Array<{ x: number; y: number }>
}

export interface OcrResult {
  uploadId: string
  extractedText: string
  averageConfidence: number
  words: OcrWord[]
}

export interface GradingResult {
  score: number
  percentage: number
  rubricBreakdown: Array<{ criterion: string; score: number; feedback: string }>
  strengths: string[]
  improvements: string[]
  evidence: Array<{ quote: string; reason: string; criterion: string }>
  summary: string
}

interface OcrContextValue {
  studentAnswerUploadId: string | null
  setStudentAnswerUploadId: (id: string | null) => void
  rubricUploadId: string | null
  setRubricUploadId: (id: string | null) => void
  ocrResult: OcrResult | null
  setOcrResult: (result: OcrResult | null) => void
  gradingResult: GradingResult | null
  setGradingResult: (result: GradingResult | null) => void
}

const OcrContext = createContext<OcrContextValue | undefined>(undefined)

export function OcrProvider({ children }: { children: ReactNode }) {
  const [studentAnswerUploadId, setStudentAnswerUploadId] = useState<string | null>(null)
  const [rubricUploadId, setRubricUploadId] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null)
  return <OcrContext.Provider value={{ studentAnswerUploadId, setStudentAnswerUploadId, rubricUploadId, setRubricUploadId, ocrResult, setOcrResult, gradingResult, setGradingResult }}>{children}</OcrContext.Provider>
}

export function useOcr() {
  const context = useContext(OcrContext)
  if (!context) throw new Error('useOcr must be used within an OcrProvider.')
  return context
}
