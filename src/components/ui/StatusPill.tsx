import { CircleDot } from 'lucide-react'
import { Badge } from './Badge'
import type { GradingStatus } from '../../types/grading'
export function StatusPill({ status }: { status: GradingStatus }) { const tone = status === 'Complete' ? 'success' : status === 'Needs review' ? 'warning' : 'neutral'; return <Badge tone={tone}><CircleDot className="mr-1 size-3" />{status}</Badge> }
