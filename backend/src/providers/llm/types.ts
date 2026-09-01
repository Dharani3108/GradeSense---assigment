import type { LlmProviderName, Rubric } from '../../types/grading.js'

export interface GradeRequest {
  studentText: string
  modelAnswerText: string
  questionPaperText: string
  rubric: Rubric
}

export interface LlmProvider {
  readonly name: LlmProviderName
  /**
   * Returns the model's raw, unvalidated reply. Validation, repair and mark
   * clamping all happen in the grading service so that a badly behaved model
   * can never write an invalid report.
   */
  grade(request: GradeRequest, signal: AbortSignal): Promise<unknown>
}

export class LlmError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message)
    this.name = 'LlmError'
  }
}
