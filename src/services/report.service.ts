import { apiClient, reportExportUrl } from '../lib/api-client'
import type { Annotation, GradingReport, GradingReportSummary, OcrResult, UploadedFile } from '../types/grading'

export interface ReportDetail {
  report: GradingReport
  annotations: Annotation[]
  ocr: OcrResult | null
  studentAnswer: UploadedFile | null
}

export const reportService = {
  list: (signal?: AbortSignal) => apiClient.get<{ reports: GradingReportSummary[] }>('/api/reports', signal),

  get: (reportId: string, signal?: AbortSignal) => apiClient.get<ReportDetail>(`/api/reports/${reportId}`, signal),

  remove: (reportId: string) => apiClient.remove(`/api/reports/${reportId}`),

  /** Fetches the annotated copy and hands the browser a download. */
  async download(reportId: string, studentName: string) {
    const blob = await apiClient.blob(`/api/reports/${reportId}/export`)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `GradeSense_Annotated_${studentName.replace(/[^a-z0-9]+/gi, '_') || 'student'}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  },

  exportUrl: reportExportUrl,
}
