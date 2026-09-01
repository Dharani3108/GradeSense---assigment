import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Vite resolves the worker to a real URL; without this pdf.js refuses to start.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Rendering width in device pixels. The page is displayed at 100% of its column. */
const RENDER_WIDTH = 1400

export interface RenderedPage {
  page: number
  /** A data URL, so React can display it as a plain image. */
  src: string
  width: number
  height: number
}

/**
 * Rasterises every page of a PDF once, up front. Displaying pages as images
 * keeps the annotation overlay to simple percentage positioning: the overlay
 * and the page always share one box, at any viewport size.
 */
export async function renderPdf(url: string, signal?: AbortSignal): Promise<RenderedPage[]> {
  const response = await fetch(url, { credentials: 'include', signal })
  if (!response.ok) throw new Error('The answer sheet could not be loaded.')
  const data = await response.arrayBuffer()

  const document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const pages: RenderedPage[] = []

  try {
    for (let index = 1; index <= document.numPages; index += 1) {
      if (signal?.aborted) break
      const page = await document.getPage(index)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width })

      const canvas = window.document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser could not draw the answer sheet.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: context, viewport }).promise
      pages.push({ page: index - 1, src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height })
      page.cleanup()
    }
  } finally {
    void document.destroy()
  }

  return pages
}
