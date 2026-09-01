import type { AnnotationType, PointStatus } from '../../types/grading'

export interface AnnotationStyle {
  label: string
  /** Border colour for the box drawn over the answer. */
  border: string
  /** Solid fill for the numbered badge. */
  badge: string
  /** Tinted background for the selected state and list rows. */
  tint: string
  text: string
}

/**
 * One colour vocabulary shared by the page overlay, the review list and the
 * exported PDF, so a red box means the same thing everywhere.
 */
export const ANNOTATION_STYLES: Record<AnnotationType, AnnotationStyle> = {
  correct: { label: 'Correct', border: '#16A34A', badge: '#16A34A', tint: '#f0fdf4', text: '#15803d' },
  incorrect: { label: 'Incorrect', border: '#DC2626', badge: '#DC2626', tint: '#fef2f2', text: '#b91c1c' },
  missing: { label: 'Missing', border: '#D97757', badge: '#D97757', tint: '#fdf4ef', text: '#bd6247' },
  spelling: { label: 'Spelling', border: '#2563EB', badge: '#2563EB', tint: '#eff6ff', text: '#1d4ed8' },
  feedback: { label: 'Feedback', border: '#7C3AED', badge: '#7C3AED', tint: '#f5f3ff', text: '#6d28d9' },
}

export const ANNOTATION_TYPES = Object.keys(ANNOTATION_STYLES) as AnnotationType[]

export const STATUS_LABEL: Record<PointStatus, string> = {
  correct: 'Correct',
  partial: 'Partly correct',
  missing: 'Missing',
  incorrect: 'Incorrect',
}

export function styleForStatus(status: PointStatus): AnnotationStyle {
  if (status === 'correct') return ANNOTATION_STYLES.correct
  if (status === 'incorrect') return ANNOTATION_STYLES.incorrect
  if (status === 'missing') return ANNOTATION_STYLES.missing
  return ANNOTATION_STYLES.feedback
}
