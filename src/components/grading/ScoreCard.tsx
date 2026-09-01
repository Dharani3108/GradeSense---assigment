import { AlertTriangle, ShieldCheck } from 'lucide-react'
import type { GradingReport } from '../../types/grading'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'

/** Total, maximum, confidence, and an honest statement of what needs checking. */
export function ScoreCard({ report }: { report: GradingReport }) {
  const { grading } = report
  const ring = `conic-gradient(#16A34A ${report.percentage * 3.6}deg, #edf3ed 0deg)`

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Score summary</h2>
          <p className="mt-1 text-xs text-stone-500">
            Graded by {grading.provider === 'gemini' ? 'Gemini' : 'the offline reference grader'}
          </p>
        </div>
        <Badge tone={report.confidence >= 70 ? 'success' : 'warning'}>{report.confidence}% confidence</Badge>
      </div>

      <div className="mt-5 flex items-center gap-5">
        <div className="grid size-24 shrink-0 place-items-center rounded-full" style={{ background: ring }}>
          <div className="grid size-[78px] place-items-center rounded-full bg-white">
            <span className="text-xl font-semibold">{report.percentage}%</span>
          </div>
        </div>
        <div>
          <p className="text-3xl font-semibold tracking-tight">
            {report.totalAwarded}
            <span className="text-base font-medium text-stone-400"> / {report.maxMarks}</span>
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {grading.questions.length} question{grading.questions.length === 1 ? '' : 's'} ·{' '}
            {grading.questions.flatMap(question => question.criteria).length} rubric points
          </p>
        </div>
      </div>

      {report.needsReview ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="size-3.5" />Needs human review
          </p>
          <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-800">
            {grading.reviewReasons.map(reason => <li key={reason}>· {reason}</li>)}
          </ul>
        </div>
      ) : (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-800">
          <ShieldCheck className="size-3.5" />Every mark is backed by verified evidence.
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-stone-600">{grading.summary}</p>

      {grading.adjustments.length > 0 && (
        <details className="mt-4 rounded-xl bg-stone-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-stone-700">
            {grading.adjustments.length} automatic correction{grading.adjustments.length === 1 ? '' : 's'} applied
          </summary>
          <ul className="mt-2 space-y-1 text-[11px] leading-4 text-stone-500">
            {grading.adjustments.map(adjustment => <li key={adjustment}>· {adjustment}</li>)}
          </ul>
        </details>
      )}

      {(grading.strengths.length > 0 || grading.improvements.length > 0) && (
        <div className="mt-4 space-y-2 text-xs leading-5">
          {grading.strengths.length > 0 && (
            <p><span className="font-semibold text-stone-700">Strengths: </span>{grading.strengths.join(' · ')}</p>
          )}
          {grading.improvements.length > 0 && (
            <p><span className="font-semibold text-stone-700">Improve: </span>{grading.improvements.join(' · ')}</p>
          )}
        </div>
      )}
    </Card>
  )
}
