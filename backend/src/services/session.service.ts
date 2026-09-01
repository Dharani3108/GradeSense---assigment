import { v4 as uuid } from 'uuid'
import { db } from '../db/database.js'
import type { GradingSession, SessionStatus, UploadKind } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

/**
 * A session is the thread that ties three uploads, one OCR pass, one report and
 * its annotations together. Without it the export had to guess which file a
 * report belonged to.
 */

type SessionRow = {
  id: string
  status: string
  studentName: string
  assignment: string
  questionPaperId: string | null
  modelAnswerId: string | null
  studentAnswerId: string | null
  reportId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

const SELECT = `SELECT id, status, student_name as studentName, assignment, question_paper_id as questionPaperId,
  model_answer_id as modelAnswerId, student_answer_id as studentAnswerId, report_id as reportId, error,
  created_at as createdAt, updated_at as updatedAt FROM grading_sessions`

const toSession = (row: SessionRow): GradingSession => ({ ...row, status: row.status as SessionStatus })

const UPLOAD_COLUMN: Record<UploadKind, string> = {
  questionPaper: 'question_paper_id',
  modelAnswer: 'model_answer_id',
  studentAnswer: 'student_answer_id',
}

export function createSession(input: { studentName?: string; assignment?: string } = {}): GradingSession {
  const now = new Date().toISOString()
  const session: GradingSession = {
    id: uuid(),
    status: 'created',
    studentName: input.studentName?.trim() || 'Unnamed student',
    assignment: input.assignment?.trim() || 'Untitled assignment',
    questionPaperId: null,
    modelAnswerId: null,
    studentAnswerId: null,
    reportId: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(`INSERT INTO grading_sessions (id, status, student_name, assignment, created_at, updated_at)
    VALUES (@id, @status, @studentName, @assignment, @createdAt, @updatedAt)`).run(session)
  return session
}

export function getSession(id: string): GradingSession | undefined {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as SessionRow | undefined
  return row ? toSession(row) : undefined
}

export function requireSession(id: string): GradingSession {
  const session = getSession(id)
  if (!session) throw new ApiError(404, 'Grading session was not found.')
  return session
}

export function attachUpload(sessionId: string, kind: UploadKind, uploadId: string) {
  db.prepare(`UPDATE grading_sessions SET ${UPLOAD_COLUMN[kind]} = ?, status = 'uploaded', updated_at = ? WHERE id = ?`)
    .run(uploadId, new Date().toISOString(), sessionId)
  db.prepare('UPDATE uploaded_files SET session_id = ? WHERE id = ?').run(sessionId, uploadId)
}

export function updateSessionDetails(sessionId: string, input: { studentName?: string; assignment?: string }) {
  const session = requireSession(sessionId)
  db.prepare('UPDATE grading_sessions SET student_name = ?, assignment = ?, updated_at = ? WHERE id = ?').run(
    input.studentName?.trim() || session.studentName,
    input.assignment?.trim() || session.assignment,
    new Date().toISOString(),
    sessionId,
  )
  return requireSession(sessionId)
}

export function setSessionStatus(sessionId: string, status: SessionStatus, options: { error?: string | null; reportId?: string | null } = {}) {
  const now = new Date().toISOString()
  if (options.reportId !== undefined) {
    db.prepare('UPDATE grading_sessions SET status = ?, error = ?, report_id = ?, updated_at = ? WHERE id = ?')
      .run(status, options.error ?? null, options.reportId, now, sessionId)
  } else {
    db.prepare('UPDATE grading_sessions SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(status, options.error ?? null, now, sessionId)
  }
}

/** The three documents a session needs before it can be graded. */
export function missingDocuments(session: GradingSession): UploadKind[] {
  const missing: UploadKind[] = []
  if (!session.questionPaperId) missing.push('questionPaper')
  if (!session.modelAnswerId) missing.push('modelAnswer')
  if (!session.studentAnswerId) missing.push('studentAnswer')
  return missing
}
