import { FileSearch } from 'lucide-react'
import { Button } from './Button'
interface EmptyStateProps { title: string; description: string; action?: () => void }
export function EmptyState({ title, description, action }: EmptyStateProps) { return <div className="grid min-h-64 place-items-center px-6 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-stone-100"><FileSearch className="size-5 text-stone-500" /></div><h3 className="font-semibold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">{description}</p>{action && <Button className="mt-5" onClick={action}>Grade an answer</Button>}</div></div> }
