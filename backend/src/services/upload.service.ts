import { relative } from 'node:path'
import { db } from '../db/database.js'
import type { UploadedFile, UploadKind } from '../types/grading.js'
import { v4 as uuid } from 'uuid'

export function persistUpload(file: Express.Multer.File, kind: UploadKind): UploadedFile {
  const uploaded: UploadedFile = {
    id: uuid(), originalName: file.originalname, storedName: file.filename, mimeType: file.mimetype,
    sizeBytes: file.size, kind, path: relative(process.cwd(), file.path), createdAt: new Date().toISOString(),
  }
  db.prepare('INSERT INTO uploaded_files (id, original_name, stored_name, mime_type, size_bytes, kind, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uploaded.id, uploaded.originalName, uploaded.storedName, uploaded.mimeType, uploaded.sizeBytes, uploaded.kind, uploaded.path, uploaded.createdAt)
  return uploaded
}
