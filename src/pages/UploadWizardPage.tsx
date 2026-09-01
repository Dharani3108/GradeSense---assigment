import { CheckCircle2, FileCheck2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCard } from '../components/upload/UploadCard'
import { Button } from '../components/ui/Button'
import { Stepper } from '../components/ui/Stepper'
import type { UploadFile } from '../types/grading'

const steps = [
  { label: 'Question Paper', hint: 'PDF or image of the exam question.', pages: '2 pages', file: { name: 'history-industrial-revolution-question.pdf', size: '248 KB' } },
  { label: 'Model Answer', hint: 'Model answer, rubric, or marking guidance.', pages: '3 pages', file: { name: 'industrial-revolution-rubric.pdf', size: '184 KB' } },
  { label: 'Student Answer', hint: 'The handwritten or typed student answer sheet.', pages: '2 pages', file: { name: 'amara-patel-answer-sheet.pdf', size: '1.2 MB' } },
]

export function UploadWizardPage() {
  const [activeStep, setActiveStep] = useState(1)
  const [uploads, setUploads] = useState<Record<number, UploadFile>>({})
  const [isUploading, setIsUploading] = useState(false)
  const navigate = useNavigate()
  const current = steps[activeStep - 1]
  const complete = Object.keys(uploads).map(Number)
  const allComplete = complete.length === steps.length
  const simulateUpload = () => { if (isUploading) return; setIsUploading(true); window.setTimeout(() => { setUploads(state => ({ ...state, [activeStep]: current.file })); setIsUploading(false); if (activeStep < steps.length) window.setTimeout(() => setActiveStep(step => step + 1), 700) }, 550) }

  return <div className="mx-auto max-w-[960px] py-4 sm:py-10"><header className="mx-auto max-w-2xl text-center"><span className="inline-flex items-center gap-2 rounded-full border border-[#f2d8ce] bg-[#fdf4ef] px-3 py-1.5 text-xs font-medium text-[#bd6247]"><Sparkles className="size-3.5" />AI-powered grading workspace</span><h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-zinc-900 sm:text-5xl">Grade handwritten answer sheets with explainable AI.</h1><p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-stone-500 sm:text-base">Upload the question, your marking guidance, and a student response. GradeSense will organise the evidence for your review.</p></header><div className="mt-12 rounded-[20px] border bg-white p-5 shadow-[0_12px_40px_rgb(67,48,39,0.05)] sm:p-8"><Stepper steps={steps.map(step => step.label)} activeStep={activeStep} completedSteps={complete} /><AnimatePresence mode="wait">{!allComplete ? <motion.section key={activeStep} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.25 }} className="mt-10"><div className="mb-5 text-center"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#bd6247]">Step {activeStep} of 3</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Add the {current.label.toLowerCase()}</h2></div><UploadCard label={current.label} hint={current.hint} pages={current.pages} file={uploads[activeStep]} isUploading={isUploading} onUpload={simulateUpload} /></motion.section> : <motion.section key="complete" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-green-50 text-[#16A34A]"><CheckCircle2 className="size-6" /></span><h2 className="mt-4 text-xl font-semibold">Everything is ready to review</h2><p className="mt-2 text-sm text-stone-500">Your three documents are organised and ready for annotation.</p><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.1 }}><Button className="mt-7 h-14 w-full max-w-xl text-base shadow-lg shadow-[#D97757]/20" onClick={() => navigate('/processing')}><FileCheck2 className="size-5" />Grade & Annotate Answer</Button></motion.div></motion.section>}</AnimatePresence></div></div>
}
