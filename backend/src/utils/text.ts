import type { OcrWord } from '../types/grading.js'

/** Lower-cases and strips everything that is not a letter or digit. */
export function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function tokenize(value: string) {
  return value.split(/\s+/).map(normalizeToken).filter(Boolean)
}

/** Levenshtein distance, capped implementation is unnecessary at word lengths. */
export function editDistance(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    previous = current
  }
  return previous[b.length]
}

/** 0..1 similarity. 1 is identical. */
export function similarity(a: string, b: string) {
  const longest = Math.max(a.length, b.length)
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest
}

/**
 * Tolerant token match. OCR routinely mangles a character or two, so an exact
 * comparison would drop evidence that a teacher would consider a clear match.
 */
export function tokensMatch(a: string, b: string, threshold = 0.75) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 3) return false
  return similarity(a, b) >= threshold
}

/** True when `quote` occurs in `haystack`, allowing OCR-level noise. */
export function quoteAppearsIn(quote: string, haystack: string, threshold = 0.75) {
  const needle = tokenize(quote)
  if (!needle.length) return false
  const hay = tokenize(haystack)
  if (needle.length > hay.length) return false
  for (let start = 0; start <= hay.length - needle.length; start += 1) {
    let matched = 0
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (tokensMatch(needle[offset], hay[start + offset], threshold)) matched += 1
    }
    if (matched / needle.length >= threshold) return true
  }
  return false
}

export interface LocatedRect {
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface WindowMatch {
  start: number
  end: number
  score: number
}

function bestWindow(needle: string[], words: OcrWord[], threshold: number): WindowMatch | null {
  if (!needle.length || !words.length) return null
  const span = Math.min(needle.length, words.length)
  let best: WindowMatch | null = null
  for (let start = 0; start + span <= words.length; start += 1) {
    let matched = 0
    for (let offset = 0; offset < span; offset += 1) {
      if (tokensMatch(needle[offset], normalizeToken(words[start + offset].text), threshold)) matched += 1
    }
    const score = matched / span
    if (!best || score > best.score) best = { start, end: start + span, score }
    if (score === 1) break
  }
  return best && best.score >= threshold ? best : null
}

/**
 * Groups the matched words into one rectangle per visual line so a quote that
 * wraps produces two underlines rather than one box swallowing the paragraph.
 */
function groupIntoLines(words: OcrWord[]): LocatedRect[] {
  const rects: LocatedRect[] = []
  let current: OcrWord[] = []
  const flush = () => {
    if (!current.length) return
    const page = current[0].page
    const x = Math.min(...current.map(word => word.x))
    const y = Math.min(...current.map(word => word.y))
    const right = Math.max(...current.map(word => word.x + word.width))
    const bottom = Math.max(...current.map(word => word.y + word.height))
    rects.push({ page, x, y, width: right - x, height: bottom - y })
    current = []
  }
  for (const word of words) {
    const previous = current[current.length - 1]
    const sameLine = previous && previous.page === word.page && Math.abs(previous.y - word.y) <= Math.max(previous.height, word.height) * 0.6
    if (previous && !sameLine) flush()
    current.push(word)
  }
  flush()
  return rects
}

/**
 * Finds where a graded quote sits on the page. Returns one rectangle per line,
 * or an empty array when the quote cannot be located (which the caller treats
 * as unverified evidence).
 */
export function locateQuote(quote: string, words: OcrWord[], threshold = 0.7): LocatedRect[] {
  const needle = tokenize(quote)
  if (!needle.length || !words.length) return []
  const match = bestWindow(needle, words, threshold)
  if (!match) return []
  return groupIntoLines(words.slice(match.start, match.end))
}

/** Merges rectangles into a single padded box, used for the export overlay. */
export function unionRect(rects: LocatedRect[]): LocatedRect | null {
  if (!rects.length) return null
  const page = rects[0].page
  const onPage = rects.filter(rect => rect.page === page)
  const x = Math.min(...onPage.map(rect => rect.x))
  const y = Math.min(...onPage.map(rect => rect.y))
  const right = Math.max(...onPage.map(rect => rect.x + rect.width))
  const bottom = Math.max(...onPage.map(rect => rect.y + rect.height))
  return { page, x, y, width: right - x, height: bottom - y }
}

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Rounds to at most two decimals so half marks survive but float noise does not. */
export function roundMarks(value: number) {
  return Math.round(value * 100) / 100
}
