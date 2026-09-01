import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../utils/api-error.js'
import { validate } from '../utils/validate.js'
import { listAnnotations } from '../services/annotation.service.js'
import { createAnnotatedReport } from '../services/export.service.js'
import { deleteReport, listReports, requireReport } from '../services/history.service.js'
import { getCachedOcr } from '../services/ocr.service.js'
import { requireSession } from '../services/session.service.js'
import { absolutePath, getSessionUpload, getUpload } from '../services/upload.service.js'

const idSchema = z.string().uuid()

export const getReports: RequestHandler = (_request, response) => response.json({ reports: listReports() })

export const getReportDetail: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.id, 'report id')
  const report = requireReport(id)
  const studentAnswer = getSessionUpload(report.sessionId, 'studentAnswer') ?? null
  return response.json({
    report,
    annotations: listAnnotations(report.sessionId),
    ocr: studentAnswer ? getCachedOcr(studentAnswer.id) ?? null : null,
    studentAnswer,
  })
}

export const removeReport: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.id, 'report id')
  if (!deleteReport(id)) throw new ApiError(404, 'Grading report was not found.')
  return response.status(204).send()
}

export const exportReport: RequestHandler = async (request, response) => {
  const id = validate(idSchema, request.params.id, 'report id')
  const exported = await createAnnotatedReport(id)
  response.setHeader('Content-Type', 'application/pdf')
  response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`)
  response.setHeader('Content-Length', String(exported.bytes.byteLength))
  return response.end(Buffer.from(exported.bytes))
}

/** Streams an original upload so the browser can render the answer sheet. */
export const getUploadFile: RequestHandler = async (request, response) => {
  const id = validate(idSchema, request.params.uploadId, 'upload id')
  const upload = getUpload(id)
  if (!upload) throw new ApiError(404, 'Upload was not found.')
  const path = absolutePath(upload)
  const info = await stat(path).catch(() => null)
  if (!info) throw new ApiError(404, 'The uploaded file is missing from disk.')
  response.setHeader('Content-Type', upload.mimeType)
  response.setHeader('Content-Length', String(info.size))
  response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(upload.originalName)}"`)
  createReadStream(path).pipe(response)
}

/** Convenience for the results screen: the answer sheet for a whole session. */
export const getSessionAnswerFile: RequestHandler = async (request, response, next) => {
  const sessionId = validate(idSchema, request.params.id, 'session id')
  requireSession(sessionId)
  const upload = getSessionUpload(sessionId, 'studentAnswer')
  if (!upload) throw new ApiError(404, 'This session has no student answer upload.')
  request.params.uploadId = upload.id
  return getUploadFile(request, response, next)
}
