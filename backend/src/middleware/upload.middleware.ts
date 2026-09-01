import multer from 'multer'
import { mkdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { v4 as uuid } from 'uuid'
import { ApiError } from '../utils/api-error.js'
import type { UploadKind } from '../types/grading.js'

const destinations: Record<UploadKind, string> = {
  questionPaper: 'uploads/question-papers', modelAnswer: 'uploads/rubrics', studentAnswer: 'uploads/student-answers',
}
const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg'])

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, file, callback) => {
      const kind = file.fieldname as UploadKind
      const target = destinations[kind]
      if (!target) return callback(new ApiError(400, 'Unknown upload field.'), '')
      const directory = resolve(process.cwd(), target)
      mkdirSync(directory, { recursive: true })
      callback(null, directory)
    },
    filename: (_request, file, callback) => callback(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new ApiError(400, 'Only PDF, PNG, JPG, and JPEG files are accepted.'))
    callback(null, true)
  },
})
