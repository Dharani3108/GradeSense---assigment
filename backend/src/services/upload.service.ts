import { relative, resolve } from 'node:path'
import { v4 as uuid } from 'uuid'
import { db } from '../db/database.js'
import type { UploadKind, UploadedFile } from '../types/grading.js'

type FileRow = {
  id: string
  sessionId: string | null
  originalName: string
  storedName: string
  mimeType: string
  sizeBytes: number
  kind: string
  path: string
  createdAt: string
}

const SELECT = `SELECT id, session_id as sessionId, original_name as originalName, stored_name as storedName,
  mime_type as mimeType, size_bytes as sizeBytes, kind, path, created_at as createdAt FROM uploaded_files`

const toFile = (row: FileRow): UploadedFile => ({ ...row, kind: row.kind as UploadKind })

export function persistUpload(file: Express.Multer.File, kind: UploadKind, sessionId: string | null): UploadedFile {
  const uploaded: UploadedFile = {
    id: uuid(),
    sessionId,
    originalName: file.originalname,
    storedName: file.filename,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    kind,
    // Stored relative so the database stays portable between machines.
    path: relative(process.cwd(), file.path).replace(/\\/g, '/'),
    createdAt: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO uploaded_files (id, session_id, original_name, stored_name, mime_type, size_bytes, kind, path, created_at)
    VALUES (@id, @sessionId, @originalName, @storedName, @mimeType, @sizeBytes, @kind, @path, @createdAt)`).run(uploaded)
  return uploaded
}

export function getUpload(id: string): UploadedFile | undefined {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as FileRow | undefined
  return row ? toFile(row) : undefined
}

export function getSessionUpload(sessionId: string, kind: UploadKind): UploadedFile | undefined {
  const row = db.prepare(`${SELECT} WHERE session_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1`).get(sessionId, kind) as FileRow | undefined
  return row ? toFile(row) : undefined
}

export function absolutePath(file: UploadedFile) {
  return resolve(process.cwd(), file.path)
}
