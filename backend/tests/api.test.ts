import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import type { Annotation, GradingReport, UploadedFile } from '../src/types/grading.js'

const sample = (name: string) => resolve(process.cwd(), 'docs/samples', name)
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

interface SessionState {
  session: { id: string; status: string; studentName: string; reportId: string | null }
  uploads: Record<string, UploadedFile | null>
  missing: string[]
  report: GradingReport | null
  annotations: Annotation[]
  ocr: { text: string; words: unknown[] } | null
}

async function uploadDocuments(sessionId: string) {
  for (const [field, file] of [
    ['questionPaper', 'question-paper.pdf'],
    ['modelAnswer', 'model-answer.pdf'],
    ['studentAnswer', 'student-answer.pdf'],
  ] as const) {
    await request(app)
      .post(`/api/sessions/${sessionId}/uploads`)
      .attach(field, sample(file))
      .expect(201)
  }
}

describe('the grading workflow end to end', () => {
  let sessionId: string
  let report: GradingReport
  let annotations: Annotation[]

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/sessions')
      .send({ studentName: 'Aarav Mehta', assignment: 'GradeSense mock examination' })
      .expect(201)
    sessionId = created.body.id as string

    await uploadDocuments(sessionId)

    const graded = await request(app).post(`/api/sessions/${sessionId}/grade`).expect(201)
    report = graded.body.report as GradingReport
    annotations = graded.body.annotations as Annotation[]
  })

  it('creates a session that knows which documents are still missing', async () => {
    const fresh = await request(app).post('/api/sessions').send({ studentName: 'Someone' }).expect(201)
    const state = await request(app).get(`/api/sessions/${fresh.body.id}`).expect(200)
    expect((state.body as SessionState).missing).toEqual(['questionPaper', 'modelAnswer', 'studentAnswer'])
  })

  it('refuses to grade before all three documents are uploaded', async () => {
    const fresh = await request(app).post('/api/sessions').send({}).expect(201)
    const response = await request(app).post(`/api/sessions/${fresh.body.id}/grade`).expect(400)
    expect(response.body.message).toMatch(/question paper, model answer, student answer/i)
  })

  it('produces a report whose total equals the sum of its rubric points', () => {
    expect(report.maxMarks).toBe(15)
    expect(report.totalAwarded).toBeLessThanOrEqual(report.maxMarks)

    const summed = report.grading.questions.reduce((total, question) => total + question.awarded, 0)
    expect(report.totalAwarded).toBeCloseTo(summed, 5)
    expect(report.studentName).toBe('Aarav Mehta')
  })

  it('flags the offline grader for human review and says why', () => {
    expect(report.needsReview).toBe(true)
    expect(report.grading.reviewReasons.length).toBeGreaterThan(0)
    expect(report.grading.provider).toBe('mock')
  })

  it('finds the reversed reasoning planted in the sample answer', () => {
    const criteria = report.grading.questions.flatMap(question => question.criteria)
    const wrong = criteria.filter(criterion => criterion.status === 'incorrect')

    expect(wrong.length).toBeGreaterThanOrEqual(3)
    // The voltmeter is wired in series in the sample answer.
    expect(criteria.find(criterion => criterion.criterionId === 'q1-c2')!.status).toBe('incorrect')
    for (const criterion of wrong) expect(criterion.correction.length).toBeGreaterThan(0)
  })

  it('anchors annotations onto the answer sheet', () => {
    expect(annotations.length).toBeGreaterThan(0)
    expect(annotations.some(annotation => annotation.type === 'incorrect')).toBe(true)
    for (const annotation of annotations) {
      expect(annotation.width).toBeGreaterThan(0)
      expect(annotation.x + annotation.width).toBeLessThanOrEqual(1.001)
    }
  })

  it('returns the whole session state in one request', async () => {
    const response = await request(app).get(`/api/sessions/${sessionId}`).expect(200)
    const state = response.body as SessionState

    expect(state.session.status).toBe('graded')
    expect(state.session.reportId).toBe(report.id)
    expect(state.missing).toEqual([])
    expect(state.uploads.studentAnswer).not.toBeNull()
    expect(state.ocr?.words.length).toBeGreaterThan(0)
    expect(state.annotations.length).toBe(annotations.length)
  })

  it('serves the original answer file for the viewer', async () => {
    const response = await request(app).get(`/api/sessions/${sessionId}/answer-file`).expect(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('edits an annotation over HTTP without regrading', async () => {
    const before = await request(app).get(`/api/reports/${report.id}`).expect(200)
    const target = annotations[0]

    const moved = await request(app)
      .patch(`/api/annotations/${target.id}`)
      .send({ x: 0.11, y: 0.22, comment: 'Moved by the teacher.' })
      .expect(200)

    expect(moved.body.x).toBeCloseTo(0.11)
    expect(moved.body.comment).toBe('Moved by the teacher.')

    const after = await request(app).get(`/api/reports/${report.id}`).expect(200)
    expect(after.body.report.totalAwarded).toBe(before.body.report.totalAwarded)
    expect(JSON.stringify(after.body.report.grading)).toBe(JSON.stringify(before.body.report.grading))
  })

  it('rejects an annotation with coordinates outside the page', async () => {
    await request(app)
      .post(`/api/sessions/${sessionId}/annotations`)
      .send({ page: 0, x: 4, y: 0.2, width: 0.2, height: 0.04, type: 'feedback' })
      .expect(400)
  })

  it('rejects an unknown annotation type', async () => {
    await request(app)
      .post(`/api/sessions/${sessionId}/annotations`)
      .send({ page: 0, x: 0.1, y: 0.2, width: 0.2, height: 0.04, type: 'sparkle' })
      .expect(400)
  })

  it('exports an annotated PDF and leaves the original untouched', async () => {
    const state = await request(app).get(`/api/sessions/${sessionId}`).expect(200)
    const upload = (state.body as SessionState).uploads.studentAnswer!
    const originalPath = resolve(process.cwd(), upload.path)
    const before = sha(await readFile(originalPath))

    const response = await request(app).get(`/api/reports/${report.id}/export`).expect(200)

    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="GradeSense_Annotated_/)
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
    // The annotated copy carries the original pages plus a summary.
    expect(response.body.length).toBeGreaterThan(4000)

    // The assignment's rule: never destroy or change the original paper.
    expect(sha(await readFile(originalPath))).toBe(before)
  })

  it('exports the teacher edits, not the generated set', async () => {
    const created = await request(app)
      .post(`/api/sessions/${sessionId}/annotations`)
      .send({ page: 0, x: 0.2, y: 0.3, width: 0.3, height: 0.03, type: 'feedback', comment: 'Marker added by hand.', correction: 'Rewrite this line.' })
      .expect(201)

    const withExtra = await request(app).get(`/api/reports/${report.id}/export`).expect(200)

    await request(app).delete(`/api/annotations/${created.body.id}`).expect(204)
    const withoutExtra = await request(app).get(`/api/reports/${report.id}/export`).expect(200)

    expect(withExtra.body.length).not.toBe(withoutExtra.body.length)
  })

  it('lists the report in history', async () => {
    const response = await request(app).get('/api/reports').expect(200)
    const summary = (response.body.reports as GradingReport[]).find(entry => entry.id === report.id)!

    expect(summary.studentName).toBe('Aarav Mehta')
    expect(summary.maxMarks).toBe(15)
    expect(summary.needsReview).toBe(true)
  })

  it('reports which providers are in use', async () => {
    const response = await request(app).get('/api/config').expect(200)
    expect(response.body.llmProvider).toBe('mock')
    expect(response.body.imageOcrAvailable).toBe(false)
  })
})

describe('input validation and errors', () => {
  it('rejects a malformed session id', async () => {
    const response = await request(app).get('/api/sessions/not-a-uuid').expect(400)
    expect(response.body.message).toMatch(/invalid session id/i)
  })

  it('reports a session that does not exist', async () => {
    await request(app).get('/api/sessions/11111111-1111-4111-8111-111111111111').expect(404)
  })

  it('rejects a file type it cannot read', async () => {
    const created = await request(app).post('/api/sessions').send({}).expect(201)
    const response = await request(app)
      .post(`/api/sessions/${created.body.id}/uploads`)
      .attach('studentAnswer', Buffer.from('MZ binary'), { filename: 'virus.exe', contentType: 'application/octet-stream' })
      .expect(400)

    expect(response.body.message).toMatch(/only pdf, png, jpg, and txt/i)
  })

  it('rejects an upload sent under an unknown field name', async () => {
    const created = await request(app).post('/api/sessions').send({}).expect(201)
    await request(app)
      .post(`/api/sessions/${created.body.id}/uploads`)
      .attach('homework', sample('student-answer.pdf'), { contentType: 'application/pdf' })
      .expect(400)
  })

  it('answers an unknown route with JSON', async () => {
    const response = await request(app).get('/api/nope').expect(404)
    expect(response.body.message).toMatch(/no route matches/i)
  })
})

describe('a blank answer submitted through the API', () => {
  it('grades to zero and is flagged, rather than failing', async () => {
    const created = await request(app).post('/api/sessions').send({ studentName: 'Blank Paper' }).expect(201)
    const sessionId = created.body.id as string

    for (const [field, file] of [['questionPaper', 'question-paper.pdf'], ['modelAnswer', 'model-answer.pdf']] as const) {
      await request(app).post(`/api/sessions/${sessionId}/uploads`).attach(field, sample(file)).expect(201)
    }
    await request(app)
      .post(`/api/sessions/${sessionId}/uploads`)
      .attach('studentAnswer', Buffer.from('   \n  \n'), { filename: 'blank.txt', contentType: 'text/plain' })
      .expect(201)

    const graded = await request(app).post(`/api/sessions/${sessionId}/grade`).expect(201)
    const blank = graded.body.report as GradingReport

    expect(blank.totalAwarded).toBe(0)
    expect(blank.needsReview).toBe(true)
    expect(blank.grading.summary).toMatch(/blank|too short/i)
    expect(blank.grading.questions.flatMap(question => question.criteria).every(criterion => criterion.status === 'missing')).toBe(true)
  })
})

describe('deleting a report', () => {
  it('removes the report and its annotations', async () => {
    const created = await request(app).post('/api/sessions').send({ studentName: 'Temporary' }).expect(201)
    const sessionId = created.body.id as string
    await uploadDocuments(sessionId)
    const graded = await request(app).post(`/api/sessions/${sessionId}/grade`).expect(201)
    const id = (graded.body.report as GradingReport).id

    await request(app).delete(`/api/reports/${id}`).expect(204)
    await request(app).get(`/api/reports/${id}`).expect(404)

    const state = await request(app).get(`/api/sessions/${sessionId}`).expect(200)
    expect((state.body as SessionState).annotations).toEqual([])
  })
})
