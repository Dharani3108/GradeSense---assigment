import type { RequestHandler } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { resolveLlmProvider } from '../providers/llm/index.js'
import { resolveOcrProvider } from '../providers/ocr/index.js'
import type { UploadKind } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { validate } from '../utils/validate.js'
import { listAnnotations } from '../services/annotation.service.js'
import { getReportForSession } from '../services/history.service.js'
import { getCachedOcr } from '../services/ocr.service.js'
import { createSession, missingDocuments, requireSession, updateSessionDetails } from '../services/session.service.js'
import { getUpload, persistUpload } from '../services/upload.service.js'
import { attachUpload } from '../services/session.service.js'
import { gradeSession } from '../services/workflow.service.js'

const detailsSchema = z.object({
  studentName: z.string().trim().min(1).max(120).optional(),
  assignment: z.string().trim().min(1).max(160).optional(),
})

const idSchema = z.string().uuid()
const UPLOAD_KINDS: UploadKind[] = ['questionPaper', 'modelAnswer', 'studentAnswer']

export const postSession: RequestHandler = (request, response) => {
  const details = validate(detailsSchema, request.body ?? {}, 'session')
  return response.status(201).json(createSession(details))
}

export const patchSession: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.id, 'session id')
  const details = validate(detailsSchema, request.body ?? {}, 'session')
  return response.json(updateSessionDetails(id, details))
}

/** Everything the results screen needs for a session, in one round trip. */
export const getSessionState: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.id, 'session id')
  const session = requireSession(id)
  const uploads = UPLOAD_KINDS.reduce<Record<string, unknown>>((accumulator, kind) => {
    const uploadId = kind === 'questionPaper' ? session.questionPaperId : kind === 'modelAnswer' ? session.modelAnswerId : session.studentAnswerId
    accumulator[kind] = uploadId ? getUpload(uploadId) ?? null : null
    return accumulator
  }, {})
  const report = getReportForSession(id)
  return response.json({
    session,
    uploads,
    missing: missingDocuments(session),
    report: report ?? null,
    annotations: listAnnotations(id),
    ocr: session.studentAnswerId ? getCachedOcr(session.studentAnswerId) ?? null : null,
  })
}

export const postUpload: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.id, 'session id')
  requireSession(id)
  const files = request.files as Record<string, Express.Multer.File[]> | undefined
  if (!files || !Object.keys(files).length) throw new ApiError(400, 'No file was received. Attach one document per request.')

  const uploads = UPLOAD_KINDS.flatMap(kind => (files[kind] ?? []).map(file => {
    const uploaded = persistUpload(file, kind, id)
    attachUpload(id, kind, uploaded.id)
    return uploaded
  }))
  if (!uploads.length) throw new ApiError(400, `Use one of these field names: ${UPLOAD_KINDS.join(', ')}.`)

  const session = requireSession(id)
  return response.status(201).json({ uploads, session, missing: missingDocuments(session) })
}

export const postGrade: RequestHandler = async (request, response) => {
  const id = validate(idSchema, request.params.id, 'session id')
  const result = await gradeSession(id)
  return response.status(201).json({
    report: result.report,
    annotations: result.annotations,
    ocr: result.ocr,
    rubric: result.rubric,
  })
}

/** Lets the UI tell the teacher whether a real model or the offline grader ran. */
export const getConfig: RequestHandler = (_request, response) => response.json({
  llmProvider: resolveLlmProvider().name,
  ocrProvider: resolveOcrProvider('application/pdf').name,
  imageOcrAvailable: Boolean(env.googleCredentials),
  maxUploadBytes: env.maxUploadBytes,
  reviewConfidenceThreshold: env.reviewConfidenceThreshold,
})
