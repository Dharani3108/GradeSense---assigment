import { ChevronDown, Quote } from 'lucide-react'
import { useState } from 'react'
import type { Annotation, CriterionResult, GradingResult } from '../../types/grading'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { STATUS_LABEL, styleForStatus } from '../annotations/annotation-styles'

interface RubricBreakdownProps {
  grading: GradingResult
  annotations: Annotation[]
  selectedId: string | null
  onSelectAnnotation: (id: string) => void
}

/**
 * Marks per rubric point, with the evidence behind each decision. Selecting a
 * point highlights the matching box on the answer sheet.
 */
function CriterionRow({ criterion, annotation, isSelected, onSelect }: {
  criterion: CriterionResult
  annotation: Annotation | undefined
  isSelected: boolean
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const style = styleForStatus(criterion.status)
  const ratio = criterion.maxMarks > 0 ? (criterion.awarded / criterion.maxMarks) * 100 : 0

  return (
    <div
      className="rounded-xl border p-3 transition"
      style={{ borderColor: isSelected ? style.border : '#E8E5E2', backgroundColor: isSelected ? style.tint : '#ffffff' }}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!annotation}
        className="w-full text-left disabled:cursor-default"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-5 text-stone-700">{criterion.criterion}</p>
          <span className="shrink-0 text-xs font-semibold" style={{ color: style.text }}>
            {criterion.awarded}/{criterion.maxMarks}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone={criterion.status === 'correct' ? 'success' : criterion.status === 'incorrect' ? 'error' : 'warning'}>
            {STATUS_LABEL[criterion.status]}
          </Badge>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, backgroundColor: style.border }} />
          </div>
        </div>
      </button>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="mt-3 flex w-full items-center justify-between text-left text-[11px] font-medium text-[#bd6247] hover:text-[#D97757]"
      >
        <span>Why this mark</span>
        <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-5 text-stone-600">{criterion.feedback}</p>

          {criterion.quote ? (
            <div className="rounded-lg bg-white/80 p-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                <Quote className="size-2.5" />Evidence
                {!criterion.quoteVerified && <Badge tone="warning">Not found in the answer</Badge>}
              </p>
              <p className="mt-1 text-[11px] italic leading-5 text-stone-600">&ldquo;{criterion.quote}&rdquo;</p>
            </div>
          ) : (
            <p className="text-[11px] italic text-stone-400">No evidence: the student did not address this point.</p>
          )}

          {criterion.correction && (
            <div className="rounded-lg border border-dashed p-2" style={{ borderColor: style.border }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: style.text }}>Correction</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-600">{criterion.correction}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RubricBreakdown({ grading, annotations, selectedId, onSelectAnnotation }: RubricBreakdownProps) {
  const byCriterion = new Map(annotations.filter(entry => entry.criterionId).map(entry => [entry.criterionId!, entry]))

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Rubric breakdown</h2>
      <p className="mt-1 text-xs text-stone-500">Every mark, the evidence for it, and what would have earned full credit.</p>

      <div className="mt-4 space-y-5">
        {grading.questions.map(question => (
          <div key={question.questionId}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">Question {question.number} · {question.subject}</h3>
              <span className="text-sm font-semibold text-[#D97757]">{question.awarded}/{question.maxMarks}</span>
            </div>
            <div className="mt-2 space-y-2">
              {question.criteria.map(criterion => {
                const annotation = byCriterion.get(criterion.criterionId)
                return (
                  <CriterionRow
                    key={criterion.criterionId}
                    criterion={criterion}
                    annotation={annotation}
                    isSelected={Boolean(annotation && annotation.id === selectedId)}
                    onSelect={() => annotation && onSelectAnnotation(annotation.id)}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
