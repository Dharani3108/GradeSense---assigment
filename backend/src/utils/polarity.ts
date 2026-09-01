import { normalizeToken, tokensMatch } from './text.js'

/**
 * Detects a student asserting the opposite of the reference material.
 *
 * A keyword-coverage grader gives full marks to "the voltmeter is connected in
 * series with the bulb" because every expected word is present. Three checks
 * are what let the offline grader see that the reasoning is wrong:
 *
 *   1. Association  - the model links "voltmeter" to "parallel"; the student
 *                     links the same anchor to "series".
 *   2. Swapped pair - the model links "below" to "shortage"; the student links
 *                     "below" to "surplus", i.e. the definitions are reversed.
 *   3. Direction    - the model says one quantity rises as another falls; the
 *                     student says they both rise.
 */

const ANTONYMS: Array<[string, string]> = [
  ['series', 'parallel'],
  ['horizontal', 'vertical'],
  ['shortage', 'surplus'],
  ['left', 'right'],
  ['upward', 'downward'],
  ['above', 'below'],
  ['increase', 'decrease'],
  ['higher', 'lower'],
  ['rises', 'falls'],
  ['positive', 'negative'],
  ['closed', 'open'],
]

/** Every word that carries polarity is excluded from being an anchor itself. */
const POLARITY_WORDS = new Set(ANTONYMS.flat())

const ANCHOR_STOP_WORDS = new Set([
  'about', 'after', 'against', 'because', 'before', 'being', 'between', 'called', 'connected', 'could', 'during',
  'first', 'given', 'however', 'means', 'other', 'point', 'question', 'quite', 'should', 'shown', 'since', 'still',
  'their', 'there', 'these', 'thing', 'those', 'through', 'under', 'until', 'using', 'where', 'which', 'while',
  'would', 'answer', 'therefore', 'something', 'equivalent',
])

const UP = /\b(increas\w*|rise[sn]?|rising|rose|more|higher|greater|larger|grow\w*|up)\b/gi
const DOWN = /\b(decreas\w*|reduc\w*|fall\w*|fell|less|lower|smaller|drop\w*|down)\b/gi
const CONDITIONAL = /\b(if|when|as|whenever)\b/i
/** The same vocabulary, for testing one already-normalised token. */
const DIRECTION_WORD = /^(increas\w*|rise[sn]?|rising|rose|higher|greater|larger|grow\w*|decreas\w*|reduc\w*|fall\w*|fell|lower|smaller|drop\w*)$/

const A = 1
const B = 2

/**
 * Splits on any non-alphanumeric run, not just whitespace, so that the model
 * answer's "shifts to the left/upward" yields "left" and "upward" rather than
 * one unmatchable token.
 */
function words(unit: string) {
  return unit.split(/[^\p{L}\p{N}]+/u).map(normalizeToken).filter(Boolean)
}

function has(unit: string[], term: string) {
  return unit.some(word => tokensMatch(word, term, 0.85))
}

function anchors(unit: string[]) {
  return unit.filter(word =>
    word.length >= 5
    && !POLARITY_WORDS.has(word)
    && !ANCHOR_STOP_WORDS.has(word)
    && !DIRECTION_WORD.test(word))
}

/**
 * A PDF text layer arrives as visual lines, so one sentence is usually spread
 * over two or three of them. Rejoining continuation lines before splitting on
 * punctuation is what makes sentence-level reasoning trustworthy.
 */
export function reflow(text: string) {
  const joined: string[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n').map(entry => entry.trim())) {
    const previous = joined[joined.length - 1]
    const continues = previous && !/[.!?:;]$/.test(previous) && /^[a-z0-9(",]/.test(line)
    if (continues) joined[joined.length - 1] = `${previous} ${line}`
    else joined.push(line)
  }
  return joined.join('\n')
}

export function splitSentences(text: string) {
  return reflow(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.replace(/[^\p{L}\p{N}]/gu, '').length > 10)
}

/**
 * A sentence that mentions both sides of a pair ("quantity on the horizontal
 * axis and price on the vertical axis") says nothing as a whole, so it is
 * broken into clauses for that pair only.
 */
function unitsFor(sentence: string, pair: [string, string]) {
  const tokens = words(sentence)
  if (has(tokens, pair[0]) && has(tokens, pair[1])) {
    return sentence.split(/,|\band\b|\bwhile\b|\bwhereas\b/i).map(part => part.trim()).filter(Boolean)
  }
  return [sentence]
}

/** Which side of a pair a unit takes, or null when it takes neither or both. */
function sideOf(unit: string, pair: [string, string]) {
  const tokens = words(unit)
  const hasA = has(tokens, pair[0])
  const hasB = has(tokens, pair[1])
  if (hasA === hasB) return null
  return hasA ? A : B
}

export interface PolarityIndex {
  /** pair key -> anchor -> side flags */
  associations: Map<string, Map<string, number>>
  /** Terms from two different pairs that the model answer uses together. */
  coOccurrences: Set<string>
}

export function buildPolarityIndex(referenceText: string): PolarityIndex {
  const sentences = splitSentences(referenceText)
  const associations = new Map<string, Map<string, number>>()

  for (const pair of ANTONYMS) {
    const counts = new Map<string, [number, number]>()
    for (const sentence of sentences) {
      for (const unit of unitsFor(sentence, pair)) {
        const side = sideOf(unit, pair)
        if (!side) continue
        for (const anchor of anchors(words(unit))) {
          const tally = counts.get(anchor) ?? [0, 0]
          tally[side === A ? 0 : 1] += 1
          counts.set(anchor, tally)
        }
      }
    }
    // Counting beats flagging here: the model answer's own grading guidance
    // ("if the student places the voltmeter in series ... that is a substantive
    // error") states the wrong pairing, and that one mention must not cancel
    // out the three correct ones elsewhere in the document.
    const entries = new Map<string, number>()
    for (const [anchor, [forA, forB]] of counts) {
      const winner = forA > forB ? A : B
      const high = Math.max(forA, forB)
      const low = Math.min(forA, forB)
      // Unambiguous once is enough; contested needs a clear majority.
      const decisive = low === 0 ? high >= 1 : high >= 2 && high >= low * 3
      if (decisive) entries.set(anchor, winner)
    }
    if (entries.size) associations.set(pair.join('|'), entries)
  }

  // Two-sentence windows, because the model often defines a term in the
  // sentence after the one that sets up the condition.
  const coOccurrences = new Set<string>()
  for (let index = 0; index < sentences.length; index += 1) {
    const window = sentences.slice(index, index + 2).join(' ')
    const present = ANTONYMS.flatMap(pair => {
      const side = sideOf(window, pair)
      return side ? [side === A ? pair[0] : pair[1]] : []
    })
    for (const left of present) for (const right of present) if (left !== right) coOccurrences.add(`${left}|${right}`)
  }

  return { associations, coOccurrences }
}

export interface Contradiction {
  expected: string
  found: string
  anchor: string
}

function opposite(term: string) {
  const pair = ANTONYMS.find(entry => entry.includes(term))
  return pair ? (pair[0] === term ? pair[1] : pair[0]) : undefined
}

/** Check 1: the student attaches a known anchor to the wrong side of a pair. */
function associationConflict(index: PolarityIndex, sentence: string): Contradiction | null {
  for (const pair of ANTONYMS) {
    const entries = index.associations.get(pair.join('|'))
    if (!entries) continue
    for (const unit of unitsFor(sentence, pair)) {
      const side = sideOf(unit, pair)
      if (!side) continue
      for (const anchor of anchors(words(unit))) {
        for (const [known, flags] of entries) {
          if (!tokensMatch(known, anchor, 0.85)) continue
          if (flags !== side) {
            return { expected: flags === A ? pair[0] : pair[1], found: side === A ? pair[0] : pair[1], anchor }
          }
        }
      }
    }
  }
  return null
}

/** Words that only describe a position, which make a poor subject for feedback. */
const POSITIONAL = new Set(['above', 'below', 'left', 'right', 'horizontal', 'vertical', 'upward', 'downward'])

/** Check 2: the student pairs two terms the model pairs with each other's opposites. */
function swappedPairConflict(index: PolarityIndex, sentence: string): Contradiction | null {
  const present = ANTONYMS.flatMap(pair => {
    const side = sideOf(sentence, pair)
    return side ? [side === A ? pair[0] : pair[1]] : []
  })
  const candidates: Contradiction[] = []
  for (const left of present) {
    for (const right of present) {
      if (left === right) continue
      const rightOpposite = opposite(right)
      if (!rightOpposite) continue
      if (index.coOccurrences.has(`${left}|${right}`)) continue
      if (index.coOccurrences.has(`${left}|${rightOpposite}`)) {
        candidates.push({ expected: rightOpposite, found: right, anchor: left })
      }
    }
  }
  // "says surplus where the model says shortage" reads better than the reverse.
  return candidates.find(entry => !POSITIONAL.has(entry.found)) ?? candidates[0] ?? null
}

export function findContradiction(index: PolarityIndex, studentText: string): Contradiction | null {
  for (const sentence of splitSentences(studentText)) {
    const conflict = associationConflict(index, sentence) ?? swappedPairConflict(index, sentence)
    if (conflict) return conflict
  }
  return null
}

/* -------------------------------------------------------------- direction --- */

/** Ordered sequence of up/down movements asserted by one sentence. */
function directionSignature(sentence: string): number[] {
  const marks: Array<{ index: number; sign: number }> = []
  for (const match of sentence.matchAll(UP)) marks.push({ index: match.index ?? 0, sign: 1 })
  for (const match of sentence.matchAll(DOWN)) marks.push({ index: match.index ?? 0, sign: -1 })
  return marks.sort((a, b) => a.index - b.index).map(mark => mark.sign)
}

export interface DirectionError {
  anchors: string[]
}

/**
 * Check 3: compares the shape of a causal claim rather than its wording - the
 * model's "resistance up, current down" against "resistance up, current up".
 */
export function findDirectionError(referenceText: string, studentText: string): DirectionError | null {
  const referenceClaims = splitSentences(referenceText)
    .filter(sentence => CONDITIONAL.test(sentence))
    .map(sentence => ({ signature: directionSignature(sentence), anchors: anchors(words(sentence)) }))
    .filter(claim => claim.signature.length >= 2)

  for (const sentence of splitSentences(studentText)) {
    if (!CONDITIONAL.test(sentence)) continue
    const signature = directionSignature(sentence)
    if (signature.length < 2) continue
    const studentAnchors = anchors(words(sentence))

    for (const claim of referenceClaims) {
      const shared = studentAnchors.filter(anchor => claim.anchors.some(known => tokensMatch(known, anchor, 0.85)))
      if (shared.length < 2) continue
      const referenceOpposes = claim.signature[0] !== claim.signature[1]
      const studentOpposes = signature[0] !== signature[1]
      if (referenceOpposes !== studentOpposes) return { anchors: [...new Set(shared)].slice(0, 3) }
    }
  }
  return null
}
