import type { RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../utils/api-error.js'
import { validate } from '../utils/validate.js'
import { createAnnotation, deleteAnnotation, listAnnotations, updateAnnotation } from '../services/annotation.service.js'
import { requireSession } from '../services/session.service.js'

const typeSchema = z.enum(['correct', 'missing', 'incorrect', 'spelling', 'feedback'])
const unit = z.number().min(0).max(1)

const createSchema = z.object({
  page: z.number().int().min(0).default(0),
  x: unit,
  y: unit,
  width: z.number().min(0.005).max(1),
  height: z.number().min(0.005).max(1),
  type: typeSchema.default('feedback'),
  quote: z.string().max(2000).optional(),
  comment: z.string().max(2000).optional(),
  correction: z.string().max(2000).optional(),
  criterionId: z.string().max(64).nullable().optional(),
})

/** Every field is optional so the client can send only what the teacher changed. */
const patchSchema = createSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'Send at least one field to update.' },
)

const idSchema = z.string().uuid()

export const getAnnotations: RequestHandler = (request, response) => {
  const sessionId = validate(idSchema, request.params.id, 'session id')
  requireSession(sessionId)
  return response.json({ annotations: listAnnotations(sessionId) })
}

export const postAnnotation: RequestHandler = (request, response) => {
  const sessionId = validate(idSchema, request.params.id, 'session id')
  requireSession(sessionId)
  const input = validate(createSchema, request.body ?? {}, 'annotation')
  return response.status(201).json(createAnnotation(sessionId, input))
}

/** Moving or rewording an annotation must never trigger a regrade. */
export const patchAnnotation: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.annotationId, 'annotation id')
  const patch = validate(patchSchema, request.body ?? {}, 'annotation')
  return response.json(updateAnnotation(id, patch))
}

export const removeAnnotation: RequestHandler = (request, response) => {
  const id = validate(idSchema, request.params.annotationId, 'annotation id')
  if (!deleteAnnotation(id)) throw new ApiError(404, 'Annotation was not found.')
  return response.status(204).send()
}
