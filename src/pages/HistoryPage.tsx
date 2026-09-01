import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Download, FileText, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { messageOf, useAsync } from '../hooks/use-async'
import { reportService } from '../services/report.service'
import type { GradingReportSummary } from '../types/grading'

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(value))
}

export function HistoryPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GradingReportSummary | null>(null)
  const [reports, setReports] = useState<GradingReportSummary[]>([])
  const [busy, setBusy] = useState<'delete' | 'download' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const state = useAsync(signal => reportService.list(signal), [])

  useEffect(() => {
    if (state.data) setReports(state.data.reports)
  }, [state.data])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return reports
    return reports.filter(report => `${report.studentName} ${report.assignment}`.toLowerCase().includes(needle))
  }, [reports, query])

  const removeSelected = async () => {
    if (!selected) return
    setBusy('delete')
    setError(null)
    try {
      await reportService.remove(selected.id)
      setReports(current => current.filter(report => report.id !== selected.id))
      setSelected(null)
    } catch (caught) {
      setError(messageOf(caught, 'The report could not be deleted.'))
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    if (!selected) return
    setBusy('download')
    setError(null)
    try {
      await reportService.download(selected.id, selected.studentName)
    } catch (caught) {
      setError(messageOf(caught, 'The annotated PDF could not be created.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Grading history</h1>
          <p className="mt-2 text-sm text-stone-500">Every paper graded on this machine, with its annotations.</p>
        </div>
        <Button onClick={() => navigate('/')}><Plus className="size-4" />New grading</Button>
      </header>

      <div className="relative mt-7 max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <label className="sr-only" htmlFor="history-search">Search grading history</label>
        <input
          id="history-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by student or exam name"
          className="h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm shadow-sm placeholder:text-stone-400 focus:border-[#D97757]"
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          {state.isLoading ? (
            <div className="grid min-h-64 place-items-center text-sm text-stone-500">
              <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading reports…</span>
            </div>
          ) : state.error ? (
            <EmptyState title="History could not be loaded" description={state.error} action={state.reload} actionLabel="Try again" />
          ) : filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <caption className="sr-only">Graded papers</caption>
                <thead className="border-b bg-stone-50/60 text-xs font-medium uppercase tracking-[0.08em] text-stone-400">
                  <tr>
                    <th scope="col" className="px-5 py-4">Student</th>
                    <th scope="col" className="px-5 py-4">Exam</th>
                    <th scope="col" className="px-5 py-4">Score</th>
                    <th scope="col" className="px-5 py-4">Status</th>
                    <th scope="col" className="px-5 py-4">Graded</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(report => (
                    <tr
                      key={report.id}
                      tabIndex={0}
                      onClick={() => setSelected(report)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(report) }
                      }}
                      className={`cursor-pointer border-b transition last:border-0 hover:bg-[#fdf8f5] focus:bg-[#fdf8f5] ${selected?.id === report.id ? 'bg-[#fdf3ee]' : ''}`}
                    >
                      <td className="px-5 py-4 text-sm font-medium text-stone-800">{report.studentName}</td>
                      <td className="max-w-56 truncate px-5 py-4 text-sm text-stone-600">{report.assignment}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-medium">{report.totalAwarded} / {report.maxMarks}</td>
                      <td className="px-5 py-4">
                        {report.needsReview
                          ? <Badge tone="warning">Needs review</Badge>
                          : <Badge tone="success">Reviewed</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-stone-500">{formatDate(report.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={query ? 'No papers match that search' : 'No papers graded yet'}
              description={query ? 'Try a different student or exam name.' : 'Grade an answer sheet and it will appear here.'}
              action={query ? undefined : () => navigate('/')}
              actionLabel="Start a new grading"
            />
          )}
        </Card>

        <AnimatePresence>
          {selected && (
            <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <Card className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#bd6247]">Report</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight">{selected.studentName}</h2>
                    <p className="mt-1 text-sm leading-5 text-stone-500">{selected.assignment}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close report preview"
                    className="grid size-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-stone-50 p-4 text-center">
                  <div>
                    <p className="text-lg font-semibold">{selected.totalAwarded}/{selected.maxMarks}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">Score</p>
                  </div>
                  <div className="border-x">
                    <p className="text-lg font-semibold">{selected.percentage}%</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">Overall</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{selected.confidence}%</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">Confidence</p>
                  </div>
                </div>

                {selected.needsReview && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    This report was flagged for human review. Open it to see why.
                  </p>
                )}

                <div className="mt-6 grid gap-2">
                  <Button onClick={() => navigate(`/results/${selected.sessionId}`)}>
                    <FileText className="size-4" />Open and edit annotations
                  </Button>
                  <Button variant="secondary" onClick={() => void download()} disabled={busy === 'download'}>
                    {busy === 'download' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {busy === 'download' ? 'Building PDF…' : 'Download annotated PDF'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => void removeSelected()}
                    disabled={busy === 'delete'}
                  >
                    <Trash2 className="size-4" />{busy === 'delete' ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </Card>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
