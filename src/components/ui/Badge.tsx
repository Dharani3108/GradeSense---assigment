import type { ReactNode } from 'react'
interface BadgeProps { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'error' }
export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const tones = { neutral: 'bg-stone-100 text-stone-600', success: 'bg-green-50 text-green-700', warning: 'bg-amber-50 text-amber-700', error: 'bg-red-50 text-red-700' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
