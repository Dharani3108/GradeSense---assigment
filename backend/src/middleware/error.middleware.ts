import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { ApiError } from '../utils/api-error.js'

export const errorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) return response.status(error.statusCode).json({ message: error.message })
  if (error instanceof multer.MulterError) return response.status(400).json({ message: error.message })
  console.error(error)
  return response.status(500).json({ message: 'An unexpected server error occurred.' })
}
