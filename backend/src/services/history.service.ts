import { v4 as uuid } from 'uuid'
import { db } from '../db/database.js'
import type { GradingReport, GradingResult } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

type ReportRow = { id: string; studentName: string; assignment: string; score: number; percentage: number; confidence: number; ocrText: string; gradingJson: string; createdAt: string }

function toReport(row: ReportRow): GradingReport {
  try {
    return { id: row.id, studentName: row.studentName, assignment: row.assignment, score: row.score, percentage: row.percentage, confidence: row.confidence, ocrText: row.ocrText, grading: JSON.parse(row.gradingJson) as GradingResult, createdAt: row.createdAt }
  } catch { throw new ApiError(500, 'A stored grading report is invalid.') }
}

export function saveReport(input: { studentName?: string; assignment?: string; confidence?: number; ocrText: string; grading: GradingResult }): GradingReport {
  const report: GradingReport = { id: uuid(), studentName: input.studentName?.trim() || 'Student answer', assignment: input.assignment?.trim() || 'Grading review', score: input.grading.score, percentage: input.grading.percentage, confidence: input.confidence ?? 0, ocrText: input.ocrText, grading: input.grading, createdAt: new Date().toISOString() }
  db.prepare('INSERT INTO grading_reports (id, student_name, assignment, score, percentage, confidence, ocr_text, grading_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(report.id, report.studentName, report.assignment, report.score, report.percentage, report.confidence, report.ocrText, JSON.stringify(report.grading), report.createdAt)
  return report
}

export function listReports(): GradingReport[] { return (db.prepare('SELECT id, student_name as studentName, assignment, score, percentage, confidence, ocr_text as ocrText, grading_json as gradingJson, created_at as createdAt FROM grading_reports ORDER BY created_at DESC').all() as ReportRow[]).map(toReport) }
export function getReport(id: string): GradingReport | undefined { const row = db.prepare('SELECT id, student_name as studentName, assignment, score, percentage, confidence, ocr_text as ocrText, grading_json as gradingJson, created_at as createdAt FROM grading_reports WHERE id = ?').get(id) as ReportRow | undefined; return row ? toReport(row) : undefined }
export function deleteReport(id: string) { return db.prepare('DELETE FROM grading_reports WHERE id = ?').run(id).changes > 0 }
