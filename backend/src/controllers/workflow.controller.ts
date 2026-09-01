import type { RequestHandler } from 'express'
import { z } from 'zod'
import { db } from '../db/database.js'
import { resolve } from 'node:path'
import { runOcr } from '../services/ocr.service.js'
import type { Annotation, OCRResult } from '../types/grading.js'
import { gradeAnswer } from '../services/grading.service.js'
import { deleteReport, getReport, listReports, saveReport } from '../services/history.service.js'
import { ApiError } from '../utils/api-error.js'

const gradeSchema = z.object({ ocrText: z.string().trim().min(1), rubricText: z.string().trim().min(1), totalMarks: z.number().positive(), studentName: z.string().trim().min(1).optional(), assignment: z.string().trim().min(1).optional(), confidence: z.number().min(0).max(100).optional() })
const saveHistorySchema = z.object({ studentName: z.string().trim().min(1).optional(), assignment: z.string().trim().min(1).optional(), confidence: z.number().min(0).max(100).optional(), ocrText: z.string(), grading: z.object({ score: z.number(), percentage: z.number(), rubricBreakdown: z.array(z.object({ criterion: z.string(), score: z.number(), feedback: z.string() })), strengths: z.array(z.string()), improvements: z.array(z.string()), evidence: z.array(z.object({ quote: z.string(), reason: z.string(), criterion: z.string() })), summary: z.string() }) })
const uploadSchema = z.object({ uploadId: z.string().uuid() })
const annotationSchema = z.object({ sessionId: z.string().uuid(), annotationId: z.string().uuid().optional() })

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid request payload.')
  return parsed.data
}

export const createOcr: RequestHandler = async (request, response) => {
  const { uploadId } = validate(uploadSchema, request.body)
  const uploadedFile = db.prepare('SELECT id, mime_type as mimeType, path FROM uploaded_files WHERE id = ?').get(uploadId) as { id: string; mimeType: string; path: string } | undefined
  if (!uploadedFile) throw new ApiError(404, 'Uploaded file was not found.')
  const result: OCRResult = await runOcr(uploadedFile.id, resolve(process.cwd(), uploadedFile.path), uploadedFile.mimeType)
  return response.json(result)
}

export const createGrade: RequestHandler = async (request, response) => {
  const input = validate(gradeSchema, request.body)
  const result = await gradeAnswer(input)
  saveReport({ studentName: input.studentName, assignment: input.assignment, confidence: input.confidence, ocrText: input.ocrText, grading: result })
  return response.json(result)
}

export const createAnnotationPlaceholder: RequestHandler = (request, response) => {
  const { sessionId, annotationId } = validate(annotationSchema, request.body)
  return response.status(202).json({ message: 'Annotation generation is not implemented yet.', sessionId, annotationId: annotationId ?? null, annotations: [] as Annotation[] })
}

export const saveHistory: RequestHandler = (request, response) => {
  const input = validate(saveHistorySchema, request.body)
  return response.status(201).json(saveReport(input))
}

export const getHistory: RequestHandler = (_request, response) => response.json({ reports: listReports() })
export const getHistoryReport: RequestHandler = (request, response) => { const id = z.string().uuid().safeParse(request.params.id); if (!id.success) throw new ApiError(400, 'Report id must be a UUID.'); const report = getReport(id.data); if (!report) throw new ApiError(404, 'Grading report was not found.'); return response.json(report) }
export const removeHistoryReport: RequestHandler = (request, response) => { const id = z.string().uuid().safeParse(request.params.id); if (!id.success) throw new ApiError(400, 'Report id must be a UUID.'); if (!deleteReport(id.data)) throw new ApiError(404, 'Grading report was not found.'); return response.status(204).send() }

export const getReportPlaceholder: RequestHandler = (request, response) => {
  const id = z.string().uuid().safeParse(request.params.id)
  if (!id.success) throw new ApiError(400, 'Report id must be a UUID.')
  return response.status(501).json({ message: 'PDF reports are not implemented yet.', reportId: id.data })
}
