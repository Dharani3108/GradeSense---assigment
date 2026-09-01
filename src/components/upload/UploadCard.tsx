import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, type ChangeEvent } from 'react'
import type { UploadFile } from '../../types/grading'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

interface UploadCardProps {
  label: string
  hint: string
  file?: UploadFile
  pages: string
  isUploading?: boolean
  progress?: number
  error?: string
  onFileSelected: (file: File) => void
  onRetry: () => void
}

export function UploadCard({ label, hint, file, pages, isUploading = false, progress = 0, error, onFileSelected, onRetry }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const chooseFile = () => inputRef.current?.click()
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onFileSelected(selected)
    event.target.value = ''
  }

  return <Card className="overflow-hidden p-3 sm:p-4"><AnimatePresence mode="wait">{file ? <motion.div key="success" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }} className="flex items-center gap-4 rounded-2xl bg-green-50 p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#16A34A] shadow-sm"><CheckCircle2 className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-stone-800">{file.name}</p><p className="mt-1 text-xs text-stone-500">{pages} · {file.size} · Uploaded successfully</p></div><Button variant="secondary" size="sm" onClick={chooseFile}>Replace</Button><input ref={inputRef} onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" type="file" /></motion.div> : error ? <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="flex min-h-[330px] flex-col items-center justify-center rounded-2xl border border-[#f2d8ce] bg-[#fdf8f5] p-8 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-white text-[#D97757] shadow-sm"><AlertCircle className="size-6" /></span><p className="mt-5 text-base font-semibold text-stone-900">Upload couldn’t be completed</p><p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">{error}</p><Button className="mt-6" onClick={onRetry}><Upload className="size-4" />Retry upload</Button></motion.div> : <motion.div key="dropzone" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}><div role="button" tabIndex={0} onClick={chooseFile} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseFile() } }} className="flex min-h-[330px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D3CF] bg-[#FCFBFA] p-8 text-center transition hover:border-[#D97757] hover:bg-[#fdf8f5]"><input ref={inputRef} onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" type="file" /><span className="grid size-14 place-items-center rounded-2xl bg-white text-[#D97757] shadow-sm"><FileText className="size-6" /></span><p className="mt-5 text-base font-semibold text-stone-900">{label}</p><p className="mt-2 max-w-xs text-sm leading-6 text-stone-500">{hint}</p>{isUploading ? <div className="mt-6 w-full max-w-xs"><div className="flex items-center justify-center gap-2 text-sm font-medium text-[#bd6247]"><LoaderCircle className="size-4 animate-spin" />Uploading {progress}%</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f2d8ce]"><motion.div className="h-full rounded-full bg-[#D97757]" animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} /></div></div> : <span className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-sm font-medium text-white"><Upload className="size-4" />Upload file</span>}<p className="mt-4 text-xs text-stone-400">PDF, PNG, or JPG · Maximum 10 MB</p></div></motion.div>}</AnimatePresence></Card>
}
