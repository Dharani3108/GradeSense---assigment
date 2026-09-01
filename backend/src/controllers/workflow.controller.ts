import type { RequestHandler } from 'express'
import { z } from 'zod'
import { db } from '../db/database.js'
import { resolve } from 'node:path'
import { runOcr } from '../services/ocr.service.js'
import type { Annotation, GradingResult, OCRResult } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

const sessionSchema = z.object({ sessionId: z.string().uuid() })
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

export const createGradePlaceholder: RequestHandler = (request, response) => {
  const { sessionId } = validate(sessionSchema, request.body)
  const result: GradingResult = { sessionId, status: 'not_started', score: null, maximumScore: null, annotations: [] }
  return response.status(202).json({ message: 'Grading is not implemented yet.', result })
}

export const createAnnotationPlaceholder: RequestHandler = (request, response) => {
  const { sessionId, annotationId } = validate(annotationSchema, request.body)
  return response.status(202).json({ message: 'Annotation generation is not implemented yet.', sessionId, annotationId: annotationId ?? null, annotations: [] as Annotation[] })
}

export const getHistoryPlaceholder: RequestHandler = (_request, response) => {
  const sessions = db.prepare('SELECT id, status, created_at as createdAt, updated_at as updatedAt FROM grading_sessions ORDER BY created_at DESC').all()
  return response.json({ sessions })
}

export const getReportPlaceholder: RequestHandler = (request, response) => {
  const id = z.string().uuid().safeParse(request.params.id)
  if (!id.success) throw new ApiError(400, 'Report id must be a UUID.')
  return response.status(501).json({ message: 'PDF reports are not implemented yet.', reportId: id.data })
}
