import { apiClient } from '../lib/api-client'
import type { Annotation, GradingReport, OcrResult, Rubric, ServiceConfig, SessionState, UploadKind, UploadedFile } from '../types/grading'

export interface GradeResponse {
  report: GradingReport
  annotations: Annotation[]
  ocr: OcrResult
  rubric: Rubric
}

export const sessionService = {
  create: (input: { studentName: string; assignment: string }) =>
    apiClient.post<SessionState['session']>('/api/sessions', input),

  get: (sessionId: string, signal?: AbortSignal) =>
    apiClient.get<SessionState>(`/api/sessions/${sessionId}`, signal),

  update: (sessionId: string, input: { studentName?: string; assignment?: string }) =>
    apiClient.patch<SessionState['session']>(`/api/sessions/${sessionId}`, input),

  uploadDocument: (sessionId: string, kind: UploadKind, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append(kind, file)
    return apiClient.upload<{ uploads: UploadedFile[]; missing: UploadKind[] }>(
      `/api/sessions/${sessionId}/uploads`,
      formData,
      onProgress,
    )
  },

  grade: (sessionId: string, signal?: AbortSignal) =>
    apiClient.post<GradeResponse>(`/api/sessions/${sessionId}/grade`, undefined, signal),

  config: (signal?: AbortSignal) => apiClient.get<ServiceConfig>('/api/config', signal),
}
