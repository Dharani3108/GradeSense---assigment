import { API_BASE_URL } from './api-config'

/**
 * The one place the app talks to the network. Every call goes through here so
 * that credentials, error shape and the base URL stay consistent.
 */

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function messageFrom(response: Response) {
  try {
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
      return payload.message
    }
  } catch {
    // A non-JSON error body is expected from proxies and gateways.
  }
  return `The request failed with status ${response.status}.`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function send(path: string, { method = 'GET', body, signal }: RequestOptions = {}) {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('Could not reach the GradeSense service. Is the backend running on port 4000?', 0)
  }
  if (!response.ok) throw new ApiError(await messageFrom(response), response.status)
  return response
}

export const apiClient = {
  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return (await send(path, { signal })).json() as Promise<T>
  },
  async post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return (await send(path, { method: 'POST', body, signal })).json() as Promise<T>
  },
  async patch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return (await send(path, { method: 'PATCH', body, signal })).json() as Promise<T>
  },
  async remove(path: string, signal?: AbortSignal): Promise<void> {
    await send(path, { method: 'DELETE', signal })
  },
  async blob(path: string, signal?: AbortSignal): Promise<Blob> {
    return (await send(path, { signal })).blob()
  },
  /** Multipart upload with progress, which fetch cannot report. */
  upload<T>(path: string, formData: FormData, onProgress?: (percent: number) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', `${API_BASE_URL}${path}`)
      request.withCredentials = true
      request.upload.onprogress = event => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
      request.onerror = () => reject(new ApiError('Could not reach the GradeSense upload service.', 0))
      request.onload = () => {
        let payload: { message?: string } = {}
        try {
          payload = JSON.parse(request.responseText || '{}') as { message?: string }
        } catch {
          return reject(new ApiError('The upload service returned a response that could not be read.', request.status))
        }
        if (request.status < 200 || request.status >= 300) {
          return reject(new ApiError(payload.message ?? 'The file could not be uploaded.', request.status))
        }
        resolve(payload as T)
      }
      request.send(formData)
    })
  },
}

/** The download URL for an annotated report, used by an anchor element. */
export function reportExportUrl(reportId: string) {
  return `${API_BASE_URL}/api/reports/${reportId}/export`
}

export function answerFileUrl(sessionId: string) {
  return `${API_BASE_URL}/api/sessions/${sessionId}/answer-file`
}
