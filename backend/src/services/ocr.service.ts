import { db } from '../db/database.js'
import { extractText } from '../providers/ocr/index.js'
import type { OcrResult, UploadedFile } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { absolutePath } from './upload.service.js'

/**
 * OCR output is cached per upload: the model answer and question paper do not
 * change between regrades, and re-running a cloud OCR call for them would be
 * both slow and billable.
 */

type CachedRow = { provider: string; text: string; averageConfidence: number; payloadJson: string }

function readCache(uploadId: string): OcrResult | undefined {
  const row = db.prepare('SELECT provider, text, average_confidence as averageConfidence, payload_json as payloadJson FROM ocr_results WHERE upload_id = ?')
    .get(uploadId) as CachedRow | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.payloadJson) as OcrResult
  } catch {
    // A corrupt cache row is not worth failing over; recompute instead.
    db.prepare('DELETE FROM ocr_results WHERE upload_id = ?').run(uploadId)
    return undefined
  }
}

function writeCache(result: OcrResult) {
  db.prepare(`INSERT INTO ocr_results (upload_id, provider, text, average_confidence, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(upload_id) DO UPDATE SET provider = excluded.provider, text = excluded.text,
      average_confidence = excluded.average_confidence, payload_json = excluded.payload_json, created_at = excluded.created_at`)
    .run(result.uploadId, result.provider, result.text, result.averageConfidence, JSON.stringify(result), new Date().toISOString())
}

export async function runOcr(file: UploadedFile, options: { refresh?: boolean } = {}): Promise<OcrResult> {
  if (!options.refresh) {
    const cached = readCache(file.id)
    if (cached) return cached
  }
  try {
    const result = await extractText({ uploadId: file.id, filePath: absolutePath(file), mimeType: file.mimeType })
    writeCache(result)
    return result
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, `Text extraction failed for ${file.originalName}: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

export function getCachedOcr(uploadId: string) {
  return readCache(uploadId)
}
