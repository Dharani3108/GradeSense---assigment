import { useState } from 'react'
/** Shared state contract for compact navigation controls. */
export function useMobileNavigation() {
  const [isOpen, setIsOpen] = useState(false)
  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }
}
