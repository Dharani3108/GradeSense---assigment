import { AlertCircle, Download, LoaderCircle, MousePointerClick, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnnotationInspector } from '../components/annotations/AnnotationInspector'
import { AnswerCanvas, type Rect } from '../components/annotations/AnswerCanvas'
import { ANNOTATION_STYLES } from '../components/annotations/annotation-styles'
import { RubricBreakdown } from '../components/grading/RubricBreakdown'
import { ScoreCard } from '../components/grading/ScoreCard'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAnnotations } from '../hooks/use-annotations'
import { messageOf, useAsync } from '../hooks/use-async'
import { answerFileUrl } from '../lib/api-client'
import type { RenderedPage } from '../lib/pdf'
import { reportService } from '../services/report.service'
import { sessionService } from '../services/session.service'

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isAddMode, setIsAddMode] = useState(false)
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [pageError, setPageError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const state = useAsync(signal => sessionService.get(sessionId!, signal), [sessionId])
  const { annotations, add, patch, remove, reset, error: annotationError, isSaving, clearError } = useAnnotations(sessionId, [])

  // Seed the editable list once the session loads.
  useEffect(() => {
    if (state.data) reset(state.data.annotations)
  }, [state.data, reset])

  const studentAnswer = state.data?.uploads.studentAnswer ?? null
  const isPdf = studentAnswer?.mimeType === 'application/pdf'

  useEffect(() => {
    if (!sessionId || !studentAnswer) return
    if (!isPdf) { setPages([]); return }

    const controller = new AbortController()
    setPageError(null)
    // pdf.js is large and only this screen needs it, so it is loaded on demand.
    import('../lib/pdf')
      .then(({ renderPdf }) => renderPdf(answerFileUrl(sessionId), controller.signal))
      .then(rendered => { if (!controller.signal.aborted) setPages(rendered) })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setPageError(messageOf(caught, 'The answer sheet could not be displayed.'))
      })
    return () => controller.abort()
  }, [sessionId, studentAnswer, isPdf])

  const selected = useMemo(() => annotations.find(entry => entry.id === selectedId) ?? null, [annotations, selectedId])

  const handleMove = useCallback((id: string, rect: Rect) => { void patch(id, rect) }, [patch])

  const handleCreate = useCallback(async (page: number, rect: Rect) => {
    const created = await add({ ...rect, page, type: 'feedback', comment: '', correction: '' })
    setIsAddMode(false)
    if (created) setSelectedId(created.id)
  }, [add])

  const handleDelete = useCallback(async () => {
    if (!selected) return
    await remove(selected.id)
    setSelectedId(null)
  }, [remove, selected])

  const download = async () => {
    if (!report) return
    setIsDownloading(true)
    setDownloadError(null)
    try {
      await reportService.download(report.id, report.studentName)
    } catch (caught) {
      setDownloadError(messageOf(caught, 'The annotated PDF could not be created.'))
    } finally {
      setIsDownloading(false)
    }
  }

  if (state.isLoading) {
    return (
      <div className="grid min-h-64 place-items-center text-sm text-stone-500">
        <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading the graded paper…</span>
      </div>
    )
  }

  if (state.error || !state.data) {
    return (
      <Card className="p-6">
        <EmptyState
          title="This grading session could not be opened"
          description={state.error ?? 'The session no longer exists.'}
          action={() => navigate('/')}
          actionLabel="Start a new grading"
        />
      </Card>
    )
  }

  const { session, report, ocr } = state.data

  if (!report) {
    return (
      <Card className="p-6">
        <EmptyState
          title="This paper has not been graded yet"
          description={session.error ?? 'Run the grading step to see marks, evidence and annotations.'}
          action={() => navigate(`/processing/${session.id}`)}
          actionLabel="Grade this paper"
        />
      </Card>
    )
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#bd6247]">Grading review</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{report.studentName}</h1>
          <p className="mt-2 text-sm text-stone-500">
            {report.assignment} · {report.totalAwarded}/{report.maxMarks} marks
            {report.needsReview && <> · <span className="font-medium text-amber-700">needs review</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/processing/${session.id}`)}>
            <RefreshCw className="size-3.5" />Regrade
          </Button>
          <Button size="sm" onClick={() => void download()} disabled={isDownloading}>
            {isDownloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {isDownloading ? 'Building PDF…' : 'Download annotated PDF'}
          </Button>
        </div>
      </header>

      {(downloadError || annotationError || pageError) && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{downloadError ?? annotationError ?? pageError}</p>
          <button
            type="button"
            onClick={() => { setDownloadError(null); clearError(); setPageError(null) }}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Annotated answer sheet</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Drag a box to move it, or select it and use the arrow keys. Edits are saved without regrading.
                </p>
              </div>
              <Button
                size="sm"
                variant={isAddMode ? 'primary' : 'secondary'}
                aria-pressed={isAddMode}
                onClick={() => { setIsAddMode(value => !value); setSelectedId(null) }}
              >
                {isAddMode ? <MousePointerClick className="size-3.5" /> : <Plus className="size-3.5" />}
                {isAddMode ? 'Drag on the page' : 'Add annotation'}
              </Button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(ANNOTATION_STYLES).map(([type, style]) => (
                <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: style.border }} />
                  {style.label}
                </span>
              ))}
            </div>

            {studentAnswer ? (
              <AnswerCanvas
                pages={pages}
                fallbackText={ocr?.text ?? ''}
                annotations={annotations}
                selectedId={selectedId}
                isAddMode={isAddMode}
                onSelect={setSelectedId}
                onMove={handleMove}
                onCreate={(page, rect) => void handleCreate(page, rect)}
              />
            ) : (
              <EmptyState title="The answer sheet is unavailable" description="The uploaded file could not be found on the server." />
            )}
          </Card>

          {ocr && ocr.warnings.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-900">Text extraction warnings</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-800">
                {ocr.warnings.map(warning => <li key={warning}>· {warning}</li>)}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <ScoreCard report={report} />

          {selected ? (
            <AnnotationInspector
              annotation={selected}
              index={annotations.indexOf(selected) + 1}
              isSaving={isSaving}
              onChange={changes => void patch(selected.id, changes)}
              onDelete={() => void handleDelete()}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Card className="p-5">
              <h2 className="font-semibold">Annotations</h2>
              <p className="mt-1 text-xs text-stone-500">{annotations.length} on this paper. Select one to edit it.</p>
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {annotations.map((annotation, index) => {
                  const style = ANNOTATION_STYLES[annotation.type] ?? ANNOTATION_STYLES.feedback
                  return (
                    <li key={annotation.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(annotation.id)}
                        className="flex w-full items-start gap-2 rounded-xl border p-2.5 text-left transition hover:bg-stone-50"
                      >
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: style.badge }}>
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <Badge tone="neutral">{style.label}</Badge>
                            <span className="text-[10px] text-stone-400">page {annotation.page + 1}</span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-stone-600">{annotation.comment || 'No comment yet'}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <RubricBreakdown
            grading={report.grading}
            annotations={annotations}
            selectedId={selectedId}
            onSelectAnnotation={setSelectedId}
          />
        </div>
      </div>
    </div>
  )
}
