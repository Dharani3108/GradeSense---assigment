import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, Clock3, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { messageOf } from '../hooks/use-async'
import { sessionService } from '../services/session.service'

/**
 * Grading is a single backend call, so the stages here describe what the server
 * is doing rather than pretending to measure it. The final stage only completes
 * when the report actually comes back.
 */
const STAGES = [
  'Reading the three documents',
  'Extracting the marking rubric',
  'Marking each rubric point',
  'Placing annotations on the answer',
]

const STAGE_PROGRESS = [18, 42, 68, 88]

export function ProcessingPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()

    setError(null)
    setIsDone(false)
    setStage(0)

    // Advance through the early stages on a timer; the last one waits for the
    // real response so the UI can never claim success before the server does.
    timers.current.forEach(window.clearTimeout)
    timers.current = STAGE_PROGRESS.slice(0, -1).map((_, index) =>
      window.setTimeout(() => setStage(current => Math.max(current, index + 1)), 700 * (index + 1)),
    )

    sessionService.grade(sessionId, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return
        setStage(STAGES.length)
        setIsDone(true)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(messageOf(caught, 'Grading could not be completed.'))
      })

    return () => {
      controller.abort()
      timers.current.forEach(window.clearTimeout)
    }
  }, [sessionId, attempt])

  useEffect(() => {
    if (!isDone || !sessionId) return
    const timer = window.setTimeout(() => navigate(`/results/${sessionId}`, { replace: true }), 700)
    return () => window.clearTimeout(timer)
  }, [isDone, navigate, sessionId])

  const progress = isDone ? 100 : error ? STAGE_PROGRESS[Math.max(0, stage - 1)] ?? 0 : STAGE_PROGRESS[Math.min(stage, STAGE_PROGRESS.length - 1)]

  return (
    <div className="mx-auto max-w-[900px] py-4 sm:py-10">
      <header className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#f2d8ce] bg-[#fdf4ef] px-3 py-1.5 text-xs font-medium text-[#bd6247]">
          <Sparkles className="size-3.5" />Grading in progress
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-zinc-900 sm:text-5xl">Marking the answer sheet</h1>
        <p className="mt-4 text-sm text-stone-500 sm:text-base">Reading the rubric, awarding each point, and finding the evidence for it.</p>
      </header>

      <Card className="mt-10 p-6 sm:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Progress</p>
            <p className="mt-1 text-sm text-stone-500">
              {error ? 'Stopped before a grade was produced.' : isDone ? 'Finished. Opening the review workspace.' : 'This usually takes a few seconds.'}
            </p>
          </div>
          <motion.span
            key={progress}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-4xl font-semibold tracking-[-0.05em] text-[#D97757] sm:text-5xl"
          >
            {progress}%
          </motion.span>
        </div>
        <ProgressBar value={progress} className="mt-7 !h-3" />
      </Card>

      <Card className="mt-5 p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Pipeline</h2>
        <div className="mt-5 divide-y">
          {STAGES.map((label, index) => {
            const done = index < stage
            const active = index === stage && !error && !isDone
            const failed = Boolean(error) && index === stage
            return (
              <div key={label} className="flex items-center gap-3 py-4 first:pt-1 last:pb-1">
                <span
                  className={`grid size-8 place-items-center rounded-full ${
                    failed ? 'bg-red-50 text-red-600' : done ? 'bg-green-50 text-[#16A34A]' : active ? 'bg-[#fdf0eb] text-[#D97757]' : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  {failed ? <AlertCircle className="size-4" /> : done ? <Check className="size-4" strokeWidth={3} /> : active ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
                </span>
                <span className={`text-sm ${done || active || failed ? 'font-medium text-stone-800' : 'text-stone-400'}`}>{label}</span>
                {active && <span className="ml-auto text-xs font-medium text-[#bd6247]">Working</span>}
              </div>
            )
          })}
        </div>
      </Card>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Card className="mt-5 border-red-200 bg-red-50 p-5 sm:p-6">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
                <div>
                  <h2 className="text-sm font-semibold text-red-900">Grading did not finish</h2>
                  <p role="alert" className="mt-1 text-sm leading-6 text-red-800">{error}</p>
                  <p className="mt-2 text-xs leading-5 text-red-700">
                    No marks were saved. Nothing was written to the student&rsquo;s record.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => setAttempt(count => count + 1)}>Try again</Button>
                    <Button size="sm" variant="secondary" onClick={() => navigate('/')}>Start over</Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!error && (
        <Card className="mt-5 bg-[#fffdfb] p-5 sm:p-6">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-green-50 text-[#16A34A]">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Marks are checked before they are saved</h2>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                No rubric point can score above its maximum, the total is always the sum of the points, and every quoted
                piece of evidence is checked against the answer sheet before it reaches you.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
