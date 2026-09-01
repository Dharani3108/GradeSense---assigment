import type { RequestHandler } from 'express'
import { persistUpload } from '../services/upload.service.js'
import type { UploadKind } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

const acceptedFields: UploadKind[] = ['questionPaper', 'modelAnswer', 'studentAnswer']

export const uploadDocuments: RequestHandler = (request, response) => {
  const files = request.files as Record<string, Express.Multer.File[]> | undefined
  if (!files || Object.keys(files).length === 0) throw new ApiError(400, 'Upload at least one document.')

  const uploads = acceptedFields.flatMap(kind => (files[kind] ?? []).map(file => persistUpload(file, kind)))
  return response.status(201).json({ message: 'Files uploaded successfully.', uploads })
}
