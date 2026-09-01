import { useCallback, useState } from 'react'
import { annotationService, type AnnotationDraft } from '../services/annotation.service'
import type { Annotation } from '../types/grading'
import { messageOf } from './use-async'

/**
 * Owns the annotation list for a session. Edits are applied optimistically so
 * dragging stays smooth, then reconciled with the server response, and rolled
 * back if the request fails.
 */
export function useAnnotations(sessionId: string | undefined, initial: Annotation[]) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const reset = useCallback((next: Annotation[]) => setAnnotations(next), [])

  const patch = useCallback(async (id: string, changes: Partial<AnnotationDraft>) => {
    const snapshot = annotations
    setAnnotations(current => current.map(entry => (entry.id === id ? { ...entry, ...changes } : entry)))
    setIsSaving(true)
    try {
      const saved = await annotationService.update(id, changes)
      setAnnotations(current => current.map(entry => (entry.id === id ? saved : entry)))
      setError(null)
    } catch (caught) {
      setAnnotations(snapshot)
      setError(messageOf(caught, 'The annotation could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }, [annotations])

  const add = useCallback(async (draft: AnnotationDraft) => {
    if (!sessionId) return undefined
    setIsSaving(true)
    try {
      const created = await annotationService.create(sessionId, draft)
      setAnnotations(current => [...current, created])
      setError(null)
      return created
    } catch (caught) {
      setError(messageOf(caught, 'The annotation could not be added.'))
      return undefined
    } finally {
      setIsSaving(false)
    }
  }, [sessionId])

  const remove = useCallback(async (id: string) => {
    const snapshot = annotations
    setAnnotations(current => current.filter(entry => entry.id !== id))
    try {
      await annotationService.remove(id)
      setError(null)
    } catch (caught) {
      setAnnotations(snapshot)
      setError(messageOf(caught, 'The annotation could not be deleted.'))
    }
  }, [annotations])

  return { annotations, add, patch, remove, reset, error, isSaving, clearError: useCallback(() => setError(null), []) }
}
