import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api-client'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  isLoading: boolean
}

export function messageOf(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}

/**
 * Runs a request on mount and whenever a dependency changes, aborting the
 * in-flight call on unmount so a slow response cannot set state after teardown.
 */
export function useAsync<T>(run: (signal: AbortSignal) => Promise<T>, dependencies: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, isLoading: true })
  const [attempt, setAttempt] = useState(0)
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    const controller = new AbortController()
    setState(previous => ({ ...previous, isLoading: true, error: null }))

    runRef.current(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setState({ data, error: null, isLoading: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ data: null, error: messageOf(error), isLoading: false })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt])

  return { ...state, reload: useCallback(() => setAttempt(count => count + 1), []) }
}

/** Async state for an action the user triggers, such as a delete or an export. */
export function useAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (...args: Args) => {
    setIsRunning(true)
    setError(null)
    try {
      await action(...args)
      return true
    } catch (caught) {
      setError(messageOf(caught))
      return false
    } finally {
      setIsRunning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { run, isRunning, error, clearError: useCallback(() => setError(null), []) }
}
