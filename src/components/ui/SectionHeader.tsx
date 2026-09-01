import type { ReactNode } from 'react'
interface SectionHeaderProps { title: string; description?: string; action?: ReactNode }
export function SectionHeader({ title, description, action }: SectionHeaderProps) { return <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{description && <p className="mt-1 text-sm text-stone-500">{description}</p>}</div>{action}</div> }
