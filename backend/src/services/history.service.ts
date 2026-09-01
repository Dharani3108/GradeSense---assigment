import { v4 as uuid } from 'uuid'
import { db } from '../db/database.js'
import type { GradingReport, GradingReportSummary, GradingResult, Rubric } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

type ReportRow = {
  id: string
  sessionId: string
  studentName: string
  assignment: string
  totalAwarded: number
  maxMarks: number
  percentage: number
  confidence: number
  needsReview: number
  ocrText: string
  gradingJson: string
  rubricJson: string
  createdAt: string
}

const COLUMNS = `id, session_id as sessionId, student_name as studentName, assignment, total_awarded as totalAwarded,
  max_marks as maxMarks, percentage, confidence, needs_review as needsReview, created_at as createdAt`

function toReport(row: ReportRow): GradingReport {
  try {
    return {
      id: row.id,
      sessionId: row.sessionId,
      studentName: row.studentName,
      assignment: row.assignment,
      totalAwarded: row.totalAwarded,
      maxMarks: row.maxMarks,
      percentage: row.percentage,
      confidence: row.confidence,
      needsReview: Boolean(row.needsReview),
      ocrText: row.ocrText,
      grading: JSON.parse(row.gradingJson) as GradingResult,
      rubric: JSON.parse(row.rubricJson) as Rubric,
      createdAt: row.createdAt,
    }
  } catch {
    throw new ApiError(500, 'A stored grading report is corrupt and could not be read.')
  }
}

export interface SaveReportInput {
  sessionId: string
  studentName: string
  assignment: string
  ocrText: string
  grading: GradingResult
  rubric: Rubric
}

export function saveReport(input: SaveReportInput): GradingReport {
  const report: GradingReport = {
    id: uuid(),
    sessionId: input.sessionId,
    studentName: input.studentName.trim() || 'Unnamed student',
    assignment: input.assignment.trim() || 'Untitled assignment',
    totalAwarded: input.grading.totalAwarded,
    maxMarks: input.grading.maxMarks,
    percentage: input.grading.percentage,
    confidence: input.grading.confidence,
    needsReview: input.grading.needsReview,
    ocrText: input.ocrText,
    grading: input.grading,
    rubric: input.rubric,
    createdAt: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO grading_reports
    (id, session_id, student_name, assignment, total_awarded, max_marks, percentage, confidence, needs_review, ocr_text, grading_json, rubric_json, created_at)
    VALUES (@id, @sessionId, @studentName, @assignment, @totalAwarded, @maxMarks, @percentage, @confidence, @needsReview, @ocrText, @gradingJson, @rubricJson, @createdAt)`)
    .run({
      ...report,
      needsReview: report.needsReview ? 1 : 0,
      gradingJson: JSON.stringify(report.grading),
      rubricJson: JSON.stringify(report.rubric),
    })
  return report
}

export function listReports(): GradingReportSummary[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM grading_reports ORDER BY created_at DESC`).all() as ReportRow[]
  return rows.map(row => ({ ...row, needsReview: Boolean(row.needsReview) }))
}

export function getReport(id: string): GradingReport | undefined {
  const row = db.prepare(`SELECT ${COLUMNS}, ocr_text as ocrText, grading_json as gradingJson, rubric_json as rubricJson
    FROM grading_reports WHERE id = ?`).get(id) as ReportRow | undefined
  return row ? toReport(row) : undefined
}

export function requireReport(id: string): GradingReport {
  const report = getReport(id)
  if (!report) throw new ApiError(404, 'Grading report was not found.')
  return report
}

export function getReportForSession(sessionId: string): GradingReport | undefined {
  const row = db.prepare(`SELECT ${COLUMNS}, ocr_text as ocrText, grading_json as gradingJson, rubric_json as rubricJson
    FROM grading_reports WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`).get(sessionId) as ReportRow | undefined
  return row ? toReport(row) : undefined
}

export function deleteReport(id: string) {
  const report = getReport(id)
  if (!report) return false
  const remove = db.transaction((reportId: string, sessionId: string) => {
    db.prepare('DELETE FROM annotations WHERE session_id = ?').run(sessionId)
    db.prepare('DELETE FROM grading_reports WHERE id = ?').run(reportId)
    db.prepare('UPDATE grading_sessions SET report_id = NULL WHERE id = ?').run(sessionId)
  })
  remove(id, report.sessionId)
  return true
}
