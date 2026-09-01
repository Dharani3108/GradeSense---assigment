import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

interface StepperProps {
  steps: string[]
  activeStep: number
  completedSteps: number[]
}

export function Stepper({ steps, activeStep, completedSteps }: StepperProps) {
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Upload progress">
      {steps.map((step, index) => {
        const number = index + 1
        const complete = completedSteps.includes(number)
        const active = number === activeStep && !complete
        return <li key={step} className="relative flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          {index > 0 && <span className={`absolute right-1/2 top-4 -z-10 h-px w-full -translate-y-1/2 sm:right-[calc(50%+1.5rem)] sm:w-[calc(100%-2rem)] ${complete ? 'bg-[#16A34A]' : 'bg-[#E8E5E2]'}`} />}
          <motion.span animate={{ scale: active ? 1.05 : 1 }} transition={{ duration: 0.25 }} className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${complete ? 'border-[#16A34A] bg-[#16A34A] text-white' : active ? 'border-[#D97757] bg-[#D97757] text-white' : 'border-[#E8E5E2] bg-white text-stone-400'}`}>{complete ? <Check className="size-4" strokeWidth={3} /> : number}</motion.span>
          <span className={`text-xs font-medium sm:text-sm ${complete || active ? 'text-stone-900' : 'text-stone-400'}`}>{step}</span>
        </li>
      })}
    </ol>
  )
}
