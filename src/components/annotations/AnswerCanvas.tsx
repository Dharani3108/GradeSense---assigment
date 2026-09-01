import { useCallback, useEffect, useRef, useState } from 'react'
import type { Annotation } from '../../types/grading'
import type { RenderedPage } from '../../lib/pdf'
import { ANNOTATION_STYLES } from './annotation-styles'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  mode: 'move' | 'resize' | 'create'
  id: string | null
  page: number
  start: Rect
  originX: number
  originY: number
  rect: Rect
  moved: boolean
}

interface AnswerCanvasProps {
  pages: RenderedPage[]
  /** Shown when the document cannot be rasterised, e.g. a plain-text answer. */
  fallbackText?: string
  annotations: Annotation[]
  selectedId: string | null
  isAddMode: boolean
  onSelect: (id: string | null) => void
  onMove: (id: string, rect: Rect) => void
  onCreate: (page: number, rect: Rect) => void
}

const MIN_SIZE = 0.012

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Keeps a rectangle inside the page after a drag or resize. */
function normalise(rect: Rect): Rect {
  const width = Math.max(MIN_SIZE, Math.min(rect.width, 1))
  const height = Math.max(MIN_SIZE, Math.min(rect.height, 1))
  return {
    x: clamp01(Math.min(rect.x, 1 - width)),
    y: clamp01(Math.min(rect.y, 1 - height)),
    width,
    height,
  }
}

/**
 * The answer sheet with its annotation layer. Boxes are positioned as
 * percentages of the page, so the same coordinates drive this overlay and the
 * exported PDF, and the layout survives any viewport width.
 */
export function AnswerCanvas({ pages, fallbackText, annotations, selectedId, isAddMode, onSelect, onMove, onCreate }: AnswerCanvasProps) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement | null>())

  const fractionOf = useCallback((page: number, clientX: number, clientY: number) => {
    const element = pageRefs.current.get(page)
    if (!element) return { x: 0, y: 0 }
    const bounds = element.getBoundingClientRect()
    return { x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height }
  }, [])

  // Tracking on window rather than the element keeps a fast drag from escaping.
  useEffect(() => {
    if (!drag) return

    const handleMove = (event: PointerEvent) => {
      const point = fractionOf(drag.page, event.clientX, event.clientY)
      const deltaX = point.x - drag.originX
      const deltaY = point.y - drag.originY
      const moved = drag.moved || Math.abs(deltaX) > 0.002 || Math.abs(deltaY) > 0.002

      if (drag.mode === 'move') {
        setDrag({ ...drag, moved, rect: normalise({ ...drag.start, x: drag.start.x + deltaX, y: drag.start.y + deltaY }) })
      } else if (drag.mode === 'resize') {
        setDrag({ ...drag, moved, rect: normalise({ ...drag.start, width: drag.start.width + deltaX, height: drag.start.height + deltaY }) })
      } else {
        const x = Math.min(drag.originX, point.x)
        const y = Math.min(drag.originY, point.y)
        setDrag({ ...drag, moved, rect: normalise({ x, y, width: Math.abs(deltaX), height: Math.abs(deltaY) }) })
      }
    }

    const handleUp = () => {
      if (drag.mode === 'create') {
        if (drag.moved && drag.rect.width > 0.02 && drag.rect.height > 0.01) onCreate(drag.page, drag.rect)
      } else if (drag.id) {
        if (drag.moved) onMove(drag.id, drag.rect)
        else onSelect(drag.id)
      }
      setDrag(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [drag, fractionOf, onCreate, onMove, onSelect])

  const startDrag = (event: React.PointerEvent, mode: DragState['mode'], page: number, id: string | null, start: Rect) => {
    event.preventDefault()
    event.stopPropagation()
    const origin = fractionOf(page, event.clientX, event.clientY)
    setDrag({ mode, id, page, start, originX: origin.x, originY: origin.y, rect: start, moved: false })
  }

  /** Keyboard nudging, so annotations are movable without a pointer. */
  const nudge = (event: React.KeyboardEvent, annotation: Annotation) => {
    const step = event.shiftKey ? 0.02 : 0.005
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const offset = offsets[event.key]
    if (!offset) return
    event.preventDefault()
    onMove(annotation.id, normalise({ ...annotation, x: annotation.x + offset[0], y: annotation.y + offset[1] }))
  }

  const pageList = pages.length ? pages : [{ page: 0, src: '', width: 595, height: 842 }]

  return (
    <div className="space-y-6">
      {pageList.map(page => {
        const onThisPage = annotations.filter(annotation => annotation.page === page.page)
        return (
          <div key={page.page}>
            <p className="mb-2 text-xs font-medium text-stone-400">Page {page.page + 1} of {pageList.length}</p>
            <div
              ref={element => { pageRefs.current.set(page.page, element) }}
              onPointerDown={event => {
                if (!isAddMode) { onSelect(null); return }
                startDrag(event, 'create', page.page, null, { x: 0, y: 0, width: 0, height: 0 })
              }}
              className={`relative w-full select-none overflow-hidden rounded-lg border bg-white shadow-sm ${isAddMode ? 'cursor-crosshair' : ''}`}
              style={{ aspectRatio: `${page.width} / ${page.height}` }}
            >
              {page.src
                ? <img src={page.src} alt={`Student answer, page ${page.page + 1}`} className="pointer-events-none block w-full" draggable={false} />
                : <pre className="pointer-events-none m-0 h-full w-full overflow-hidden whitespace-pre-wrap p-6 font-mono text-[9px] leading-[1.92%] text-stone-700">{fallbackText ?? ''}</pre>}

              {onThisPage.map(annotation => {
                const live = drag?.id === annotation.id ? drag.rect : annotation
                const style = ANNOTATION_STYLES[annotation.type] ?? ANNOTATION_STYLES.feedback
                const index = annotations.indexOf(annotation) + 1
                const isSelected = selectedId === annotation.id
                return (
                  <div
                    key={annotation.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Annotation ${index}, ${style.label}: ${annotation.comment}`}
                    aria-pressed={isSelected}
                    onPointerDown={event => startDrag(event, 'move', annotation.page, annotation.id, annotation)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(annotation.id) }
                      else nudge(event, annotation)
                    }}
                    className="absolute cursor-move rounded-[3px] transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{
                      left: `${live.x * 100}%`,
                      top: `${live.y * 100}%`,
                      width: `${live.width * 100}%`,
                      height: `${live.height * 100}%`,
                      border: `2px solid ${style.border}`,
                      backgroundColor: isSelected ? `${style.border}22` : `${style.border}11`,
                      boxShadow: isSelected ? `0 0 0 3px ${style.border}33` : 'none',
                    }}
                  >
                    <span
                      className="absolute -left-2.5 -top-2.5 grid size-5 place-items-center rounded-full text-[10px] font-bold text-white shadow"
                      style={{ backgroundColor: style.badge }}
                    >
                      {index}
                    </span>
                    {isSelected && (
                      <span
                        role="presentation"
                        onPointerDown={event => startDrag(event, 'resize', annotation.page, annotation.id, annotation)}
                        className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-white shadow"
                        style={{ backgroundColor: style.border }}
                      />
                    )}
                  </div>
                )
              })}

              {drag?.mode === 'create' && drag.page === page.page && drag.moved && (
                <div
                  className="pointer-events-none absolute rounded-[3px] border-2 border-dashed border-[#7C3AED] bg-[#7C3AED]/10"
                  style={{
                    left: `${drag.rect.x * 100}%`,
                    top: `${drag.rect.y * 100}%`,
                    width: `${drag.rect.width * 100}%`,
                    height: `${drag.rect.height * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
