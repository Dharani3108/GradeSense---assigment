import { sessionService } from '../services/session.service'
import { useAsync } from './use-async'

/** Which grading model and OCR engine the backend actually has available. */
export function useServiceConfig() {
  return useAsync(signal => sessionService.config(signal), [])
}
