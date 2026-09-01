import { Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Annotation, AnnotationType } from '../../types/grading'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ANNOTATION_STYLES, ANNOTATION_TYPES } from './annotation-styles'

interface AnnotationInspectorProps {
  annotation: Annotation
  index: number
  isSaving: boolean
  onChange: (changes: Partial<Pick<Annotation, 'comment' | 'correction' | 'type'>>) => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Edits one annotation in place. Nothing here regrades the paper: the comment,
 * the correction, the type and the position are all stored on the annotation
 * itself, so a teacher can correct the AI without re-running it.
 */
export function AnnotationInspector({ annotation, index, isSaving, onChange, onDelete, onClose }: AnnotationInspectorProps) {
  const [comment, setComment] = useState(annotation.comment)
  const [correction, setCorrection] = useState(annotation.correction)

  // Reset the draft when the teacher selects a different annotation.
  useEffect(() => {
    setComment(annotation.comment)
    setCorrection(annotation.correction)
  }, [annotation.id, annotation.comment, annotation.correction])

  const unsaved = comment !== annotation.comment || correction !== annotation.correction
  const style = ANNOTATION_STYLES[annotation.type] ?? ANNOTATION_STYLES.feedback

  return (
    <section className="rounded-[20px] border bg-white p-5 shadow-[0_8px_30px_rgb(67,48,39,0.05)]" aria-label={`Edit annotation ${index}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: style.badge }}>
            {index}
          </span>
          <h2 className="text-base font-semibold">Edit annotation</h2>
          {annotation.source === 'teacher' && <Badge tone="neutral">Added by you</Badge>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close annotation editor"
          className="grid size-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="size-4" />
        </button>
      </div>

      {annotation.quote && (
        <div className="mt-4 rounded-xl bg-stone-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Marked text</p>
          <p className="mt-1 text-xs italic leading-5 text-stone-600">&ldquo;{annotation.quote}&rdquo;</p>
        </div>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Type</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ANNOTATION_TYPES.map(type => {
            const option = ANNOTATION_STYLES[type]
            const active = annotation.type === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ type: type as AnnotationType })}
                aria-pressed={active}
                className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                style={{
                  borderColor: active ? option.border : '#E8E5E2',
                  backgroundColor: active ? option.tint : '#ffffff',
                  color: active ? option.text : '#78716c',
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="annotation-comment" className="text-sm font-semibold">Comment</label>
          {unsaved && <Badge tone="warning">Unsaved</Badge>}
        </div>
        <textarea
          id="annotation-comment"
          value={comment}
          onChange={event => setComment(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border bg-[#FCFBFA] p-3 text-xs leading-5 text-stone-700 focus:border-[#D97757]"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="annotation-correction" className="text-sm font-semibold">Correction shown to the student</label>
        <textarea
          id="annotation-correction"
          value={correction}
          onChange={event => setCorrection(event.target.value)}
          rows={3}
          placeholder="What a full-credit answer would have said."
          className="mt-2 w-full rounded-xl border bg-[#FCFBFA] p-3 text-xs leading-5 text-stone-700 placeholder:text-stone-400 focus:border-[#D97757]"
        />
      </div>

      <p className="mt-4 text-[11px] leading-4 text-stone-400">
        Drag the box on the answer sheet to move it, or use the arrow keys when it has focus. Editing an annotation never regrades the paper.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" disabled={!unsaved || isSaving} onClick={() => onChange({ comment, correction })}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
          <Trash2 className="size-3.5" />Delete
        </Button>
      </div>
    </section>
  )
}
