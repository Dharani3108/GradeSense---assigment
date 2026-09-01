import multer from 'multer'
import { mkdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { v4 as uuid } from 'uuid'
import { env } from '../config/env.js'
import type { UploadKind } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

const DESTINATIONS: Record<UploadKind, string> = {
  questionPaper: 'question-papers',
  modelAnswer: 'rubrics',
  studentAnswer: 'student-answers',
}

/** Plain text is accepted so the tool is usable without a cloud OCR account. */
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain'])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt'])

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, file, callback) => {
      const target = DESTINATIONS[file.fieldname as UploadKind]
      if (!target) return callback(new ApiError(400, `Unknown upload field "${file.fieldname}".`), '')
      const directory = resolve(env.uploadRoot, target)
      mkdirSync(directory, { recursive: true })
      callback(null, directory)
    },
    // Random stored names keep one upload from overwriting another.
    filename: (_request, file, callback) => callback(null, `${uuid()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: env.maxUploadBytes, files: 3 },
  fileFilter: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase()
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
      return callback(new ApiError(400, 'Only PDF, PNG, JPG, and TXT files are accepted.'))
    }
    callback(null, true)
  },
})

export const uploadFields = upload.fields([
  { name: 'questionPaper', maxCount: 1 },
  { name: 'modelAnswer', maxCount: 1 },
  { name: 'studentAnswer', maxCount: 1 },
])
