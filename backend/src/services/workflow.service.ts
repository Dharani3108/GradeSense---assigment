import type { LlmProvider } from '../providers/llm/index.js'
import type { Annotation, GradingReport, OcrResult, Rubric } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { generateAnnotations, replaceAnnotations } from './annotation.service.js'
import { gradeAnswer } from './grading.service.js'
import { saveReport } from './history.service.js'
import { runOcr } from './ocr.service.js'
import { parseRubric } from './rubric.service.js'
import { missingDocuments, requireSession, setSessionStatus } from './session.service.js'
import { getUpload } from './upload.service.js'

export interface GradeSessionResult {
  report: GradingReport
  annotations: Annotation[]
  ocr: OcrResult
  rubric: Rubric
}

const LABELS = { questionPaper: 'question paper', modelAnswer: 'model answer', studentAnswer: 'student answer' } as const

/**
 * The single path from three uploaded documents to a stored, annotated report.
 * Any failure marks the session failed with a message the UI can show, so a
 * half-finished run never masquerades as a grade.
 */
export async function gradeSession(sessionId: string, options: { provider?: LlmProvider; refreshOcr?: boolean } = {}): Promise<GradeSessionResult> {
  const session = requireSession(sessionId)
  const missing = missingDocuments(session)
  if (missing.length) {
    throw new ApiError(400, `Upload the ${missing.map(kind => LABELS[kind]).join(', ')} before grading.`)
  }

  const questionPaper = getUpload(session.questionPaperId!)
  const modelAnswer = getUpload(session.modelAnswerId!)
  const studentAnswer = getUpload(session.studentAnswerId!)
  if (!questionPaper || !modelAnswer || !studentAnswer) {
    throw new ApiError(404, 'One of the uploaded documents is no longer available.')
  }

  setSessionStatus(sessionId, 'processing', { error: null })
  try {
    const [questionOcr, modelOcr, studentOcr] = await Promise.all([
      runOcr(questionPaper, { refresh: options.refreshOcr }),
      runOcr(modelAnswer, { refresh: options.refreshOcr }),
      runOcr(studentAnswer, { refresh: options.refreshOcr }),
    ])

    const rubric = parseRubric(modelOcr.text)
    const grading = await gradeAnswer({
      studentOcr,
      modelAnswerText: modelOcr.text,
      questionPaperText: questionOcr.text,
      rubric,
      provider: options.provider,
    })

    const report = saveReport({
      sessionId,
      studentName: session.studentName,
      assignment: session.assignment,
      ocrText: studentOcr.text,
      grading,
      rubric,
    })

    const annotations = replaceAnnotations(sessionId, generateAnnotations({
      sessionId,
      reportId: report.id,
      grading,
      ocr: studentOcr,
      referenceText: `${modelOcr.text}\n${questionOcr.text}`,
    }))

    setSessionStatus(sessionId, 'graded', { reportId: report.id, error: null })
    return { report, annotations, ocr: studentOcr, rubric }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Grading failed for an unknown reason.'
    setSessionStatus(sessionId, 'failed', { error: message })
    throw error
  }
}
