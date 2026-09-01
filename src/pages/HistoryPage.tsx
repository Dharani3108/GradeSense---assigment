import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HistoryTable } from '../components/history/HistoryTable'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionHeader } from '../components/ui/SectionHeader'
import { mockHistory } from '../data/mockGrading'
export function HistoryPage() { const [query, setQuery] = useState(''); const navigate = useNavigate(); const results = useMemo(() => mockHistory.filter(item => `${item.student} ${item.assignment}`.toLowerCase().includes(query.toLowerCase())), [query]); return <div><SectionHeader title="Grading history" description="Find a previous review or continue an in-progress one." /><div className="relative mt-7 max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><label className="sr-only" htmlFor="history-search">Search grading history</label><input id="history-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by student or assignment" className="h-11 w-full rounded-xl border bg-white pl-10 pr-4 text-sm placeholder:text-stone-400 focus:border-[#D97757]" /></div><Card className="mt-5 overflow-hidden">{results.length ? <HistoryTable items={results} onSelect={() => navigate('/results')} /> : <EmptyState title="No matching reviews" description="Try a different student or assignment name, or start a new grading review." action={() => navigate('/')} />}</Card></div> }
