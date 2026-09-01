import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ApiError } from '../utils/api-error.js'

export const notFoundMiddleware: RequestHandler = (request, response) =>
  response.status(404).json({ message: `No route matches ${request.method} ${request.path}.` })

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) return response.status(error.statusCode).json({ message: error.message })
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than the 10 MB limit.' : error.message
    return response.status(400).json({ message })
  }
  // Never leak an internal stack to the client, but keep it in the server log.
  console.error('[gradesense]', error)
  return response.status(500).json({ message: 'An unexpected server error occurred.' })
}
