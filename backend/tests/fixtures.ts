import type { LlmProvider } from '../src/providers/llm/types.js'
import { LlmError } from '../src/providers/llm/types.js'
import type { OcrResult, OcrWord, Rubric } from '../src/types/grading.js'

/** A two-question rubric with uneven marks, so clamping has something to bite on. */
export const rubric: Rubric = {
  inferred: false,
  maxMarks: 10,
  questions: [
    {
      id: 'q1',
      number: 1,
      subject: 'Science',
      maxMarks: 5,
      criteria: [
        { id: 'q1-c1', questionId: 'q1', text: 'Describes the closed circuit with battery, switch, bulb and resistor connected in series', maxMarks: 2 },
        { id: 'q1-c2', questionId: 'q1', text: 'Places the ammeter in series and the voltmeter in parallel across the bulb', maxMarks: 1 },
        { id: 'q1-c3', questionId: 'q1', text: 'Explains that increasing resistance decreases the current when voltage is constant', maxMarks: 2 },
      ],
    },
    {
      id: 'q2',
      number: 2,
      subject: 'Economics',
      maxMarks: 5,
      criteria: [
        { id: 'q2-c1', questionId: 'q2', text: 'Identifies the market equilibrium where quantity demanded equals quantity supplied', maxMarks: 2 },
        { id: 'q2-c2', questionId: 'q2', text: 'Explains the shortage below equilibrium and the surplus above equilibrium', maxMarks: 3 },
      ],
    },
  ],
}

export const modelAnswerText = [
  'Q1 - Science',
  'A simple circuit is a closed path. The battery, switch, bulb and resistor are connected in series so that current can flow around the loop.',
  'The ammeter is connected in series because it measures the current flowing through the circuit.',
  'A voltmeter is connected in parallel across the bulb because it measures the potential difference across the bulb.',
  'If the voltage of the battery remains constant and the resistance is increased, the current flowing through the circuit decreases.',
  '',
  'Q2 - Economics',
  'The market equilibrium is the price at which the quantity demanded equals the quantity supplied.',
  'If the market price is below the equilibrium price, quantity demanded is greater than quantity supplied. This creates a shortage.',
  'If the market price is above the equilibrium price, quantity supplied is greater than quantity demanded. This creates a surplus.',
].join('\n')

export const questionPaperText = 'Q1 Explain a simple electric circuit. Q2 Explain market equilibrium.'

export const answers = {
  full: [
    'The battery, switch, bulb and resistor are connected in series in a closed path so that current can flow around the loop.',
    'The ammeter is connected in series because it measures the current flowing through the circuit, and the voltmeter is connected in parallel across the bulb because it measures the potential difference across the bulb.',
    'If the voltage of the battery remains constant and the resistance is increased, the current flowing through the circuit decreases.',
    'The market equilibrium is the price at which the quantity demanded equals the quantity supplied.',
    'If the market price is below the equilibrium price there is a shortage, and if the market price is above the equilibrium price there is a surplus.',
  ].join(' '),

  partial: [
    'The battery, switch, bulb and resistor are connected in series in a closed path so that current can flow around the loop.',
    'The ammeter is connected in series because it measures the current flowing through the circuit.',
    'The market equilibrium is the price at which the quantity demanded equals the quantity supplied.',
  ].join(' '),

  /** Every substantive relationship is reversed. */
  incorrect: [
    'The battery, switch, bulb and resistor are connected in series in a closed path so that current can flow around the loop.',
    'The voltmeter is connected in series with the bulb because it measures the potential difference across the bulb.',
    'If the resistance is increased then the current flowing through the circuit will also increase.',
    'The market equilibrium is the price at which the quantity demanded equals the quantity supplied.',
    'If the market price is below the equilibrium price there is a surplus in the market.',
  ].join(' '),

  /** The full answer with the kind of character damage OCR introduces. */
  ocrNoise: [
    'The battery, switch, bulb and resistor are connected in serles in a closed path so that curent can flow around the loop.',
    'The ammeter is connected in series because it measures the curent flowing through the circuit, and the voltmeeter is connected in parallel across the bulb because it measures the potentiel difference across the bulb.',
    'If the voltage of the battery remains constant and the resistence is increased, the curent flowing through the circuit decreases.',
    'The market equilibrum is the price at which the quantity demanded equals the quantity supplied.',
    'If the market price is below the equilibrum price there is a shortage, and if the market price is above the equilibrum price there is a surplus.',
  ].join(' '),

  blank: '   \n  \n ',
}

/** Lays text out on a synthetic page so words carry usable bounding boxes. */
export function ocrFrom(text: string, options: { confidence?: number; warnings?: string[] } = {}): OcrResult {
  const confidence = options.confidence ?? 100
  const columns = 90
  const rows = 45
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let remaining = paragraph
    if (!remaining.trim()) { lines.push(''); continue }
    while (remaining.length > columns) {
      const cut = remaining.lastIndexOf(' ', columns)
      const at = cut > 40 ? cut : columns
      lines.push(remaining.slice(0, at))
      remaining = remaining.slice(at).trimStart()
    }
    lines.push(remaining)
  }

  const words: OcrWord[] = []
  lines.forEach((line, index) => {
    const page = Math.floor(index / rows)
    const row = index % rows
    const pattern = /\S+/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      words.push({
        text: match[0],
        confidence,
        page,
        x: match.index / columns,
        y: (row + 0.2) / rows,
        width: match[0].length / columns,
        height: 0.8 / rows,
      })
    }
  })

  const pageCount = Math.max(1, Math.ceil(lines.length / rows))
  return {
    uploadId: 'fixture-upload',
    provider: 'pdf-text',
    text,
    averageConfidence: text.trim() ? confidence : 0,
    pages: Array.from({ length: pageCount }, (_, page) => ({
      page,
      width: 595,
      height: 842,
      text: lines.slice(page * rows, (page + 1) * rows).join('\n'),
    })),
    words,
    warnings: options.warnings ?? [],
  }
}

/** Returns whatever it is given, so a test can inject any model response. */
export function stubProvider(response: unknown | (() => unknown)): LlmProvider {
  return {
    name: 'mock',
    async grade() {
      return typeof response === 'function' ? (response as () => unknown)() : response
    },
  }
}

/** Fails every call, like an unreachable or rate-limited API. */
export function failingProvider(message = 'connect ECONNREFUSED', retryable = true) {
  let calls = 0
  const provider: LlmProvider = {
    name: 'mock',
    async grade() {
      calls += 1
      throw new LlmError(message, retryable)
    },
  }
  return { provider, callCount: () => calls }
}

/** Builds a well-formed model reply that awards every criterion `awarded` marks. */
export function gradingReply(awarded: number, options: { quote?: string; ids?: string[] } = {}) {
  const ids = options.ids ?? rubric.questions.flatMap(question => question.criteria.map(criterion => criterion.id))
  return {
    criteria: ids.map(criterionId => ({
      criterionId,
      awarded,
      status: 'correct',
      feedback: 'Looks right.',
      correction: '',
      quote: options.quote ?? '',
    })),
    strengths: ['Clear structure'],
    improvements: [],
    summary: 'Test reply.',
  }
}
