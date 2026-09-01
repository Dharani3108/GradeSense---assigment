import { readFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Annotation, AnnotationType, GradingReport } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'
import { listAnnotations } from './annotation.service.js'
import { requireReport } from './history.service.js'
import { requireSession } from './session.service.js'
import { absolutePath, getSessionUpload } from './upload.service.js'

/**
 * Produces an annotated COPY of the student's paper. The upload on disk is only
 * ever read; every mark is drawn onto a new document. The copy is widened by a
 * fixed margin so callouts sit beside the answer instead of on top of it.
 */

const MARGIN = 190
const INK = rgb(0.16, 0.14, 0.13)
const MUTED = rgb(0.42, 0.39, 0.36)
const PAPER = rgb(1, 0.996, 0.99)

const TYPE_STYLE: Record<AnnotationType, { color: ReturnType<typeof rgb>; label: string; underlineOnly: boolean }> = {
  correct: { color: rgb(0.06, 0.6, 0.27), label: 'Correct', underlineOnly: true },
  incorrect: { color: rgb(0.84, 0.15, 0.15), label: 'Incorrect', underlineOnly: false },
  missing: { color: rgb(0.85, 0.47, 0.13), label: 'Missing', underlineOnly: false },
  spelling: { color: rgb(0.16, 0.42, 0.78), label: 'Spelling', underlineOnly: false },
  feedback: { color: rgb(0.55, 0.31, 0.72), label: 'Feedback', underlineOnly: false },
}

function wrap(text: string, width: number, font: PDFFont, size: number) {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) > width && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

/** pdf-lib rejects glyphs a standard font cannot encode, e.g. the rupee sign. */
function sanitize(value: string) {
  return value.replace(/₹/g, 'Rs.').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, '')
}

function drawLines(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, color = INK, maxLines = 99) {
  let cursor = y
  for (const line of wrap(sanitize(text), width, font, size).slice(0, maxLines)) {
    page.drawText(line, { x, y: cursor, size, font, color })
    cursor -= size + 3
  }
  return cursor
}

interface Canvas {
  page: PDFPage
  /** Width of the embedded original, i.e. where the margin column starts. */
  contentWidth: number
  contentHeight: number
}

async function buildCanvases(document: PDFDocument, source: Buffer, mimeType: string): Promise<Canvas[]> {
  if (mimeType === 'application/pdf') {
    const original = await PDFDocument.load(source)
    const embedded = await document.embedPages(original.getPages())
    return embedded.map((embed, index) => {
      const { width, height } = original.getPage(index).getSize()
      const page = document.addPage([width + MARGIN, height])
      page.drawRectangle({ x: 0, y: 0, width: width + MARGIN, height, color: PAPER })
      page.drawPage(embed, { x: 0, y: 0, width, height })
      return { page, contentWidth: width, contentHeight: height }
    })
  }
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    const image = mimeType === 'image/png' ? await document.embedPng(source) : await document.embedJpg(source)
    const contentWidth = 595
    const contentHeight = 842
    const page = document.addPage([contentWidth + MARGIN, contentHeight])
    page.drawRectangle({ x: 0, y: 0, width: contentWidth + MARGIN, height: contentHeight, color: PAPER })
    const scale = Math.min(contentWidth / image.width, contentHeight / image.height)
    page.drawImage(image, {
      x: (contentWidth - image.width * scale) / 2,
      y: (contentHeight - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale,
    })
    return [{ page, contentWidth, contentHeight }]
  }
  if (mimeType === 'text/plain') {
    // Re-typeset plain text onto pages so annotation coordinates still land.
    const font = await document.embedFont(StandardFonts.Courier)
    const contentWidth = 595
    const contentHeight = 842
    const raw = sanitize(source.toString('utf8'))
    const rows = 52
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    const canvases: Canvas[] = []
    for (let start = 0; start < Math.max(1, lines.length); start += rows) {
      const page = document.addPage([contentWidth + MARGIN, contentHeight])
      page.drawRectangle({ x: 0, y: 0, width: contentWidth + MARGIN, height: contentHeight, color: PAPER })
      lines.slice(start, start + rows).forEach((line, row) => {
        page.drawText(line.slice(0, 92), { x: 0, y: contentHeight - ((row + 0.2) / rows) * contentHeight - 9, size: 9, font, color: INK })
      })
      canvases.push({ page, contentWidth, contentHeight })
    }
    return canvases
  }
  throw new ApiError(400, `A ${mimeType} answer sheet cannot be exported as an annotated PDF.`)
}

function drawAnnotation(canvas: Canvas, annotation: Annotation, index: number, font: PDFFont, bold: PDFFont, calloutTop: number) {
  const style = TYPE_STYLE[annotation.type] ?? TYPE_STYLE.feedback
  const { page, contentWidth, contentHeight } = canvas

  // Normalised, top-left origin -> PDF points, bottom-left origin.
  const x = annotation.x * contentWidth
  const width = Math.max(6, annotation.width * contentWidth)
  const height = Math.max(8, annotation.height * contentHeight)
  const y = contentHeight - annotation.y * contentHeight - height

  if (style.underlineOnly) {
    page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + width, y: y - 1.5 }, thickness: 1.6, color: style.color })
  } else {
    page.drawRectangle({ x: x - 2, y: y - 2, width: width + 4, height: height + 4, borderColor: style.color, borderWidth: 1.2 })
  }

  const badgeX = Math.max(9, x - 9)
  const badgeY = y + height + 2
  page.drawCircle({ x: badgeX, y: badgeY, size: 7, color: style.color })
  page.drawText(String(index + 1), { x: badgeX - (index + 1 >= 10 ? 4.5 : 2.2), y: badgeY - 2.8, size: 7, font: bold, color: rgb(1, 1, 1) })

  // Callout in the dedicated margin column, joined to the box by a leader line.
  const calloutX = contentWidth + 10
  const calloutWidth = MARGIN - 20
  page.drawLine({ start: { x: x + width + 2, y: badgeY }, end: { x: calloutX - 4, y: calloutTop - 6 }, thickness: 0.5, color: rgb(0.78, 0.75, 0.72) })
  page.drawCircle({ x: calloutX + 6, y: calloutTop - 6, size: 6, color: style.color })
  page.drawText(String(index + 1), { x: calloutX + 6 - (index + 1 >= 10 ? 4 : 2), y: calloutTop - 8.5, size: 6.5, font: bold, color: rgb(1, 1, 1) })
  page.drawText(style.label, { x: calloutX + 16, y: calloutTop - 9, size: 7.5, font: bold, color: style.color })

  let cursor = calloutTop - 21
  cursor = drawLines(page, annotation.comment, calloutX, cursor, calloutWidth, font, 6.5, INK, 5)
  if (annotation.correction) {
    cursor -= 3
    page.drawText('Correction', { x: calloutX, y: cursor, size: 6, font: bold, color: MUTED })
    cursor = drawLines(page, annotation.correction, calloutX, cursor - 9, calloutWidth, font, 6.5, MUTED, 5)
  }
  return cursor - 8
}

function drawSummary(document: PDFDocument, report: GradingReport, font: PDFFont, bold: PDFFont) {
  let page = document.addPage([595, 842])
  let y = 792
  const newPageIfNeeded = (needed: number) => {
    if (y - needed > 48) return
    page = document.addPage([595, 842])
    y = 792
  }

  page.drawText('GradeSense report', { x: 48, y, size: 22, font: bold, color: INK })
  y -= 22
  page.drawText(sanitize(`${report.studentName}  |  ${report.assignment}`), { x: 48, y, size: 10, font, color: MUTED })
  y -= 36

  page.drawText(`${report.totalAwarded} / ${report.maxMarks}`, { x: 48, y: y - 12, size: 30, font: bold, color: rgb(0.85, 0.47, 0.34) })
  page.drawText(`${report.percentage}% overall   |   ${report.confidence}% confidence`, { x: 48, y: y - 30, size: 10, font, color: INK })
  if (report.needsReview) {
    page.drawRectangle({ x: 320, y: y - 34, width: 227, height: 40, color: rgb(1, 0.96, 0.9), borderColor: rgb(0.85, 0.47, 0.13), borderWidth: 0.8 })
    page.drawText('Needs human review', { x: 330, y: y - 12, size: 9, font: bold, color: rgb(0.7, 0.38, 0.08) })
    drawLines(page, report.grading.reviewReasons[0] ?? '', 330, y - 23, 207, font, 6.5, MUTED, 2)
  }
  y -= 60

  page.drawText('Summary', { x: 48, y, size: 13, font: bold, color: INK })
  y = drawLines(page, report.grading.summary, 48, y - 18, 499, font, 9.5) - 14

  for (const question of report.grading.questions) {
    newPageIfNeeded(90)
    page.drawText(sanitize(`Question ${question.number} - ${question.subject}`), { x: 48, y, size: 12, font: bold, color: INK })
    page.drawText(`${question.awarded} / ${question.maxMarks}`, { x: 500, y, size: 12, font: bold, color: rgb(0.85, 0.47, 0.34) })
    y -= 18
    for (const criterion of question.criteria) {
      newPageIfNeeded(56)
      const style = TYPE_STYLE[criterion.status === 'correct' ? 'correct' : criterion.status === 'incorrect' ? 'incorrect' : criterion.status === 'missing' ? 'missing' : 'feedback']
      page.drawCircle({ x: 52, y: y + 3, size: 3, color: style.color })
      y = drawLines(page, criterion.criterion, 62, y, 420, font, 8.5, INK, 3)
      page.drawText(`${criterion.awarded}/${criterion.maxMarks}`, { x: 500, y: y + 11, size: 9, font: bold, color: style.color })
      y = drawLines(page, criterion.feedback, 62, y - 2, 430, font, 7.5, MUTED, 3)
      if (criterion.quote) y = drawLines(page, `Evidence: "${criterion.quote}"`, 62, y - 2, 430, font, 7, rgb(0.35, 0.33, 0.31), 2)
      if (criterion.correction) y = drawLines(page, `Correction: ${criterion.correction}`, 62, y - 2, 430, font, 7, rgb(0.35, 0.33, 0.31), 3)
      y -= 8
    }
    y -= 6
  }

  if (report.grading.adjustments.length) {
    newPageIfNeeded(70)
    page.drawText('Automatic corrections applied', { x: 48, y, size: 11, font: bold, color: INK })
    y -= 16
    for (const adjustment of report.grading.adjustments) {
      newPageIfNeeded(24)
      y = drawLines(page, `- ${adjustment}`, 48, y, 499, font, 7.5, MUTED, 3) - 4
    }
  }
}

export async function createAnnotatedReport(reportId: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const report = requireReport(reportId)
  const session = requireSession(report.sessionId)
  const upload = getSessionUpload(session.id, 'studentAnswer')
  if (!upload) throw new ApiError(404, 'The original student answer for this report is no longer available.')

  const source = await readFile(absolutePath(upload)).catch(() => {
    throw new ApiError(404, 'The original student answer file is missing from disk.')
  })

  const document = await PDFDocument.create()
  document.setTitle(`GradeSense annotated copy - ${report.studentName}`)
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)

  const canvases = await buildCanvases(document, source, upload.mimeType)
  const annotations = listAnnotations(session.id)

  // Callouts stack down the margin, one column per page.
  const calloutCursor = new Map<number, number>()
  annotations.forEach((annotation, index) => {
    const canvas = canvases[annotation.page] ?? canvases[0]
    if (!canvas) return
    const top = calloutCursor.get(annotation.page) ?? canvas.contentHeight - 24
    const next = drawAnnotation(canvas, annotation, index, font, bold, top)
    calloutCursor.set(annotation.page, next < 60 ? canvas.contentHeight - 24 : next)
  })

  drawSummary(document, report, font, bold)

  const safeName = report.studentName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'student'
  return { bytes: await document.save(), filename: `GradeSense_Annotated_${safeName}.pdf` }
}
