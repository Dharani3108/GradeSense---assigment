import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, FileCheck2, Info, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Stepper } from '../components/ui/Stepper'
import { UploadCard } from '../components/upload/UploadCard'
import { useServiceConfig } from '../hooks/use-service-config'
import { messageOf } from '../hooks/use-async'
import { sessionService } from '../services/session.service'
import type { UploadKind } from '../types/grading'

const detailsSchema = z.object({
  studentName: z.string().trim().min(2, 'Enter the student name (at least 2 characters).').max(120),
  assignment: z.string().trim().min(2, 'Name the exam or assignment.').max(160),
})

type Details = z.infer<typeof detailsSchema>

const DOCUMENTS: Array<{ kind: UploadKind; label: string; hint: string }> = [
  { kind: 'questionPaper', label: 'Question paper', hint: 'The exam questions, so feedback can refer to what was asked.' },
  { kind: 'modelAnswer', label: 'Model answer and rubric', hint: 'The marking rubric is read from this file to set the marks available.' },
  { kind: 'studentAnswer', label: 'Student answer', hint: 'The answer sheet to grade and annotate.' },
]

const STEPS = ['Details', ...DOCUMENTS.map(document => document.label)]

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function UploadWizardPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [uploaded, setUploaded] = useState<Record<UploadKind, { name: string; size: string } | undefined>>({
    questionPaper: undefined, modelAnswer: undefined, studentAnswer: undefined,
  })
  const [pending, setPending] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { data: config } = useServiceConfig()

  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { studentName: '', assignment: '' },
    mode: 'onBlur',
  })

  const completed = DOCUMENTS.map((document, index) => (uploaded[document.kind] ? index + 2 : 0)).filter(Boolean)
  const allUploaded = DOCUMENTS.every(document => uploaded[document.kind])
  const current = DOCUMENTS[step - 2]

  const startSession = async (details: Details) => {
    setError(null)
    try {
      const session = await sessionService.create(details)
      setSessionId(session.id)
      setStep(2)
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  const uploadFile = async (file: File) => {
    if (!sessionId || !current || isUploading) return
    setPending(file)
    setError(null)
    setProgress(0)
    setIsUploading(true)
    try {
      const result = await sessionService.uploadDocument(sessionId, current.kind, file, setProgress)
      const stored = result.uploads[0]
      setUploaded(state => ({ ...state, [current.kind]: { name: stored.originalName, size: formatSize(stored.sizeBytes) } }))
      if (step < STEPS.length) window.setTimeout(() => setStep(value => value + 1), 500)
    } catch (caught) {
      setError(messageOf(caught, 'The file could not be uploaded.'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[960px] py-4 sm:py-10">
      <header className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#f2d8ce] bg-[#fdf4ef] px-3 py-1.5 text-xs font-medium text-[#bd6247]">
          <Sparkles className="size-3.5" />Explainable grading workspace
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-zinc-900 sm:text-5xl">
          Grade an answer sheet, and show the student exactly where the marks went.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-stone-500 sm:text-base">
          Upload the question paper, the marking rubric and the student answer. GradeSense marks each rubric point,
          quotes the evidence, and puts an editable correction on the page.
        </p>
      </header>

      {config?.llmProvider === 'mock' && (
        <Card className="mx-auto mt-8 flex max-w-2xl gap-3 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-[#bd6247]" />
          <p className="text-xs leading-5 text-stone-600">
            Running with the offline reference grader. It matches rubric vocabulary and catches reversed reasoning,
            and every report it produces is flagged for review. Set <code className="rounded bg-stone-100 px-1">GEMINI_API_KEY</code> in
            the backend to grade with Gemini instead.
          </p>
        </Card>
      )}

      <div className="mt-8 rounded-[20px] border bg-white p-5 shadow-[0_12px_40px_rgb(67,48,39,0.05)] sm:p-8">
        <Stepper steps={STEPS} activeStep={step} completedSteps={sessionId ? [1, ...completed] : completed} />

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.section
              key="details"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.25 }}
              className="mt-10"
            >
              <div className="mb-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#bd6247]">Step 1 of {STEPS.length}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Who is this paper for?</h2>
              </div>

              <form onSubmit={form.handleSubmit(startSession)} className="mx-auto max-w-md space-y-4" noValidate>
                <div>
                  <label htmlFor="studentName" className="block text-sm font-medium text-stone-700">Student name</label>
                  <input
                    id="studentName"
                    autoComplete="off"
                    aria-invalid={Boolean(form.formState.errors.studentName)}
                    aria-describedby={form.formState.errors.studentName ? 'studentName-error' : undefined}
                    className="mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm shadow-sm focus:border-[#D97757]"
                    {...form.register('studentName')}
                  />
                  {form.formState.errors.studentName && (
                    <p id="studentName-error" role="alert" className="mt-1.5 text-xs text-red-600">
                      {form.formState.errors.studentName.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="assignment" className="block text-sm font-medium text-stone-700">Exam or assignment</label>
                  <input
                    id="assignment"
                    autoComplete="off"
                    aria-invalid={Boolean(form.formState.errors.assignment)}
                    aria-describedby={form.formState.errors.assignment ? 'assignment-error' : undefined}
                    className="mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm shadow-sm focus:border-[#D97757]"
                    {...form.register('assignment')}
                  />
                  {form.formState.errors.assignment && (
                    <p id="assignment-error" role="alert" className="mt-1.5 text-xs text-red-600">
                      {form.formState.errors.assignment.message}
                    </p>
                  )}
                </div>

                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

                <Button type="submit" className="h-12 w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Starting…' : 'Continue'}
                </Button>
              </form>
            </motion.section>
          ) : !allUploaded && current ? (
            <motion.section
              key={current.kind}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.25 }}
              className="mt-10"
            >
              <div className="mb-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#bd6247]">Step {step} of {STEPS.length}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Add the {current.label.toLowerCase()}</h2>
              </div>
              <UploadCard
                label={current.label}
                hint={current.hint}
                file={uploaded[current.kind]}
                isUploading={isUploading}
                progress={progress}
                error={error ?? undefined}
                imageOcrAvailable={config?.imageOcrAvailable ?? false}
                onFileSelected={file => void uploadFile(file)}
                onRetry={() => pending && void uploadFile(pending)}
              />
            </motion.section>
          ) : (
            <motion.section
              key="ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-10 text-center"
            >
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-green-50 text-[#16A34A]">
                <CheckCircle2 className="size-6" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">All three documents are in</h2>
              <p className="mt-2 text-sm text-stone-500">
                GradeSense will read the rubric, mark each point against it, and place the annotations.
              </p>
              <Button
                className="mt-7 h-14 w-full max-w-xl text-base shadow-lg shadow-[#D97757]/20"
                onClick={() => sessionId && navigate(`/processing/${sessionId}`)}
              >
                <FileCheck2 className="size-5" />Grade and annotate
              </Button>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
