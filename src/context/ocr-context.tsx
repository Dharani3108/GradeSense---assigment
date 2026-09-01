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

interface OcrContextValue {
  studentAnswerUploadId: string | null
  setStudentAnswerUploadId: (id: string | null) => void
  ocrResult: OcrResult | null
  setOcrResult: (result: OcrResult | null) => void
}

const OcrContext = createContext<OcrContextValue | undefined>(undefined)

export function OcrProvider({ children }: { children: ReactNode }) {
  const [studentAnswerUploadId, setStudentAnswerUploadId] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  return <OcrContext.Provider value={{ studentAnswerUploadId, setStudentAnswerUploadId, ocrResult, setOcrResult }}>{children}</OcrContext.Provider>
}

export function useOcr() {
  const context = useContext(OcrContext)
  if (!context) throw new Error('useOcr must be used within an OcrProvider.')
  return context
}
