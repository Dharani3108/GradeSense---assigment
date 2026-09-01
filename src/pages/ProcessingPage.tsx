import { Check, Clock3, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { useOcr, type OcrResult } from '../context/ocr-context'
import { API_BASE_URL } from '../lib/api-config'

const pipeline = ['Question paper processed.', 'Rubric extracted.', 'Comparing student answer with rubric.', 'Generating annotations.', 'Calculating final score.']
const activities = ['Reading uploaded documents.', 'Extracting rubric structure.', 'Matching student answer against rubric points.', 'Generating evidence-backed annotations.', 'Calculating final marks and confidence score.']
const progressByStage = [13, 31, 52, 74, 88]

function isOcrResult(value: unknown): value is OcrResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<OcrResult>
  return typeof result.uploadId === 'string' && typeof result.extractedText === 'string' && typeof result.averageConfidence === 'number' && Array.isArray(result.words)
}

export function ProcessingPage() {
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const { studentAnswerUploadId, setOcrResult } = useOcr()
  const navigate = useNavigate()
  const complete = stage === pipeline.length
  const progress = complete ? 100 : progressByStage[stage]

  useEffect(() => {
    if (!studentAnswerUploadId) {
      setError('No student answer upload is available. Return to the upload workspace and add a student answer.')
      return
    }

    const controller = new AbortController()
    const processOcr = async () => {
      setStage(1)
      setError(null)
      try {
        const response = await fetch(`${API_BASE_URL}/api/ocr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: studentAnswerUploadId }),
          signal: controller.signal,
        })
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'OCR could not be completed.'
          throw new Error(message)
        }
        if (!isOcrResult(payload)) throw new Error('The OCR service returned an invalid response.')
        setOcrResult(payload)
        setStage(pipeline.length)
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'OCR could not be completed.')
      }
    }
    void processOcr()
    return () => controller.abort()
  }, [setOcrResult, studentAnswerUploadId])

  useEffect(() => {
    if (!complete) return
    const redirect = window.setTimeout(() => navigate('/results'), 1000)
    return () => window.clearTimeout(redirect)
  }, [complete, navigate])

  return <div className="mx-auto max-w-[900px] py-4 sm:py-10"><header className="text-center"><span className="inline-flex items-center gap-2 rounded-full border border-[#f2d8ce] bg-[#fdf4ef] px-3 py-1.5 text-xs font-medium text-[#bd6247]"><Sparkles className="size-3.5" />AI Processing</span><h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-zinc-900 sm:text-5xl">Grading Your Answer</h1><p className="mt-4 text-sm text-stone-500 sm:text-base">Please wait while GradeSense analyzes the uploaded documents.</p></header><Card className="mt-10 overflow-hidden p-6 sm:p-8"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold">Analysis progress</p><p className="mt-1 text-sm text-stone-500">Estimated remaining time: ~12 seconds.</p></div><motion.span key={progress} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="text-4xl font-semibold tracking-[-0.05em] text-[#D97757] sm:text-5xl">{progress}%</motion.span></div><ProgressBar value={progress} className="mt-7 !h-3" /></Card><Card className="mt-5 p-6 sm:p-8"><h2 className="text-lg font-semibold tracking-tight">Processing Pipeline</h2><div className="mt-5 divide-y">{pipeline.map((label, index) => { const done = index < stage || complete; const current = index === stage && !complete; return <div key={label} className="flex items-center gap-3 py-4 first:pt-1 last:pb-1"><span className={`grid size-8 place-items-center rounded-full ${done ? 'bg-green-50 text-[#16A34A]' : current ? 'bg-[#fdf0eb] text-[#D97757]' : 'bg-stone-100 text-stone-400'}`}>{done ? <Check className="size-4" strokeWidth={3} /> : current ? <LoaderCircle className="size-4 animate-spin" /> : <Clock3 className="size-4" />}</span><span className={`text-sm ${done || current ? 'font-medium text-stone-800' : 'text-stone-400'}`}>{label}</span>{current && <span className="ml-auto text-xs font-medium text-[#bd6247]">In progress</span>}</div> })}</div></Card><Card className="mt-5 p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fdf0eb] text-[#D97757]"><Sparkles className="size-4" /></span><div><p className="text-sm font-semibold">Current AI activity</p><AnimatePresence mode="wait"><motion.p key={stage} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.25 }} className="mt-1 text-sm text-stone-500">{error ?? activities[Math.min(stage, activities.length - 1)]}</motion.p></AnimatePresence></div></div></Card><Card className="mt-5 bg-[#fffdfb] p-5 sm:p-6"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-green-50 text-[#16A34A]"><ShieldCheck className="size-4" /></span><div><h2 className="text-sm font-semibold">Explainable AI in Progress</h2><p className="mt-1 text-sm leading-6 text-stone-500">Every awarded mark is linked to evidence from the student’s answer so teachers can verify grading decisions before exporting.</p></div></div></Card><AnimatePresence>{complete && <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} role="status" className="mt-5 flex items-center gap-3 rounded-[20px] border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800"><Check className="size-5" />Grading completed successfully.</motion.div>}</AnimatePresence></div>
}
