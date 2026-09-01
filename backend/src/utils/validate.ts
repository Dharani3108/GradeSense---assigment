import type { z } from 'zod'
import { ApiError } from './api-error.js'

/**
 * Turns a schema failure into a 400 with the first useful message. Generic over
 * the schema itself so defaults and transforms keep their output types.
 */
export function validate<S extends z.ZodTypeAny>(schema: S, value: unknown, context = 'request'): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data as z.infer<S>
  const issue = parsed.error.issues[0]
  const path = issue?.path.join('.')
  throw new ApiError(400, `Invalid ${context}${path ? ` (${path})` : ''}: ${issue?.message ?? 'unrecognised payload'}`)
}
