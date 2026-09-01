import { apiClient } from '../lib/api-client'
import type { Annotation, AnnotationType } from '../types/grading'

export interface AnnotationDraft {
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

/**
 * Annotation edits are independent of grading: none of these calls regrade the
 * paper, which is what keeps a teacher's corrections cheap and reversible.
 */
export const annotationService = {
  list: (sessionId: string, signal?: AbortSignal) =>
    apiClient.get<{ annotations: Annotation[] }>(`/api/sessions/${sessionId}/annotations`, signal),

  create: (sessionId: string, draft: AnnotationDraft) =>
    apiClient.post<Annotation>(`/api/sessions/${sessionId}/annotations`, draft),

  update: (annotationId: string, patch: Partial<AnnotationDraft>) =>
    apiClient.patch<Annotation>(`/api/annotations/${annotationId}`, patch),

  remove: (annotationId: string) => apiClient.remove(`/api/annotations/${annotationId}`),
}
