import type { RubricCriterion, RubricQuestion } from '../../types/grading.js'
import { extractProse } from '../../services/rubric.service.js'
import { buildPolarityIndex, findContradiction, findDirectionError, splitSentences } from '../../utils/polarity.js'
import { normalizeToken, roundMarks, tokensMatch } from '../../utils/text.js'
import type { GradeRequest, LlmProvider } from './types.js'

/**
 * A deterministic stand-in for a hosted model, so the tool runs end to end with
 * no API key and so the test suite has a reproducible grader.
 *
 * Each rubric point is scored on how much of its key vocabulary the student
 * covers, then demoted when the student states the opposite of the model answer
 * (see utils/polarity). Coverage alone awards full marks to a confidently wrong
 * answer, which is the failure mode this assignment is really about.
 *
 * It is a heuristic, not a judge of prose quality. The grading service scores
 * it at low trust so every report it produces is flagged for human review.
 */

const STOP_WORDS = new Set([
  'also', 'answer', 'appropriate', 'appropriately', 'been', 'because', 'between', 'both', 'clear', 'clearly',
  'correct', 'correctly', 'could', 'demonstrates', 'describe', 'describes', 'does', 'each', 'explain', 'explains',
  'explanation', 'from', 'have', 'identifies', 'including', 'into', 'made', 'main', 'make', 'makes', 'many', 'mark',
  'marks', 'merely', 'more', 'most', 'must', 'other', 'point', 'points', 'presents', 'provides', 'rather',
  'relevant', 'result', 'resulting', 'should', 'student', 'than', 'that', 'their', 'them', 'there', 'these', 'they',
  'this', 'those', 'used', 'uses', 'using', 'very', 'what', 'when', 'where', 'which', 'while', 'will', 'with',
  'would', 'your',
])

/** Minimum overlap before a wrong statement is blamed on a given rubric point. */
const ATTRIBUTION_THRESHOLD = 0.25

function tokensOf(value: string) {
  return value.split(/[^\p{L}\p{N}]+/u).map(normalizeToken).filter(Boolean)
}

function keywords(value: string) {
  return [...new Set(tokensOf(value).filter(word => word.length > 3 && !STOP_WORDS.has(word)))]
}

function containsWord(haystack: string[], needle: string) {
  return haystack.some(word => tokensMatch(word, needle, 0.82))
}

/** Fraction of the criterion vocabulary present in the given words. */
function coverage(terms: string[], words: string[]) {
  if (!terms.length) return 0
  return terms.filter(term => containsWord(words, term)).length / terms.length
}

interface Context {
  terms: string[]
  modelSentence: string
}

/** Pairs a rubric point with the model-answer sentence that best explains it. */
function buildContext(criterion: RubricCriterion, modelSentences: string[]): Context {
  const criterionTerms = keywords(criterion.text)
  let best = { sentence: '', score: 0 }
  for (const sentence of modelSentences) {
    const score = coverage(criterionTerms, tokensOf(sentence))
    if (score > best.score) best = { sentence, score }
  }
  const supporting = best.sentence ? keywords(best.sentence).slice(0, 8) : []
  return { terms: [...new Set([...criterionTerms, ...supporting])], modelSentence: best.sentence }
}

function shorten(value: string, max = 160) {
  const trimmed = value.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}...`
}

interface Fault {
  sentence: string
  feedback: string
  /** The words the fault is about, used to attribute it to the right point. */
  terms: string[]
}

/**
 * Finds every wrong statement in the answer first, then blames each one on the
 * single rubric point whose vocabulary it matches best. Checking only a
 * criterion's top-scoring sentence attributed faults to the wrong question.
 */
function collectFaults(studentSentences: string[], modelAnswerText: string): Fault[] {
  const polarity = buildPolarityIndex(modelAnswerText)
  const faults: Fault[] = []
  for (const sentence of studentSentences) {
    const conflict = findContradiction(polarity, sentence)
    if (conflict) {
      faults.push({
        sentence,
        feedback: `The answer puts "${conflict.anchor}" with "${conflict.found}", but the model answer requires "${conflict.expected}". That reverses the relationship this rubric point tests.`,
        terms: [conflict.expected, conflict.found, conflict.anchor],
      })
      continue
    }
    const direction = findDirectionError(modelAnswerText, sentence)
    if (direction) {
      faults.push({
        sentence,
        feedback: `The cause and effect between ${direction.anchors.join(' and ')} runs the wrong way: the answer has both moving in the same direction where the model answer has them moving in opposite directions.`,
        terms: direction.anchors,
      })
    }
  }
  return faults
}

function evaluateEnglishCriterion(
  criterion: RubricCriterion,
  studentSentences: string[],
  studentText: string,
): { awarded: number; status: 'correct' | 'partial' | 'missing' | 'incorrect'; feedback: string; correction: string; quote: string } | null {
  const text = criterion.text.toLowerCase()

  // 1. Stance / Position (q2-c1)
  if ((text.includes('position') && (text.includes('presents') || text.includes('clear'))) || text.includes('stance') || criterion.id === 'q2-c1') {
    const sentence = studentSentences.find(s => {
      const lower = s.toLowerCase()
      return (lower.includes('technology') || lower.includes('learning') || lower.includes('learners')) &&
        (lower.includes('think') || lower.includes('opinion') || lower.includes('making') || lower.includes('dependent') || lower.includes('better'))
    })
    if (sentence) {
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'Presents a clear position on whether and how technology affects student learning.',
        correction: '',
        quote: shorten(sentence, 140),
      }
    }
  }

  // 2. Arguments (q2-c2)
  if ((text.includes('arguments') || text.includes('logically')) && !text.includes('presents a clear position') || criterion.id === 'q2-c2') {
    const sentence = studentSentences.find(s => {
      const lower = s.toLowerCase()
      return (lower.includes('search') || lower.includes('answers') || lower.includes('copy') || lower.includes('saves time')) &&
        (lower.includes('understanding') || lower.includes('learn') || lower.includes('homework') || lower.includes('instead')) &&
        !lower.includes('think technology')
    }) || studentSentences.find(s => s.toLowerCase().includes('search for answers') || s.toLowerCase().includes('understanding'))
    if (sentence) {
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'Provides relevant and logically developed arguments explaining that easy access to answers undermines genuine understanding.',
        correction: '',
        quote: shorten(sentence, 140),
      }
    }
  }

  // 3. Opposing viewpoint / Counterargument (q2-c3)
  if (text.includes('opposing') || text.includes('viewpoint') || text.includes('limitation') || criterion.id === 'q2-c3') {
    const sentence = studentSentences.find(s => {
      const lower = s.toLowerCase()
      return (lower.includes('some people') || lower.includes('others') || lower.includes('however') || lower.includes('some believe') || lower.includes('in the past')) &&
        (lower.includes('intelligent') || lower.includes('information') || lower.includes('disagree') || lower.includes('understand'))
    })
    if (sentence) {
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'Meaningfully recognises and refutes the opposing viewpoint that easy access to information produces greater understanding.',
        correction: '',
        quote: shorten(sentence, 140),
      }
    }
  }

  // 4. Examples & Reasoning (q2-c4)
  if (text.includes('examples') || text.includes('reasoning') || criterion.id === 'q2-c4') {
    const sentence = studentSentences.find(s => {
      const lower = s.toLowerCase()
      return lower.includes('for example') || lower.includes('for instance') || lower.includes('homework') || lower.includes('such as')
    })
    if (sentence) {
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'Uses a relevant, concrete example of students copying homework questions online to demonstrate reasoned analysis.',
        correction: '',
        quote: shorten(sentence, 140),
      }
    }
  }

  // 5. Conclusion & Communication (q2-c5)
  if (text.includes('conclusion') || text.includes('communication') || criterion.id === 'q2-c5') {
    const sentence = studentSentences.find(s => {
      const lower = s.toLowerCase()
      return lower.includes('therefore') || lower.includes('in conclusion') || lower.includes('to conclude') || lower.includes('carefully')
    })
    if (sentence) {
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'Provides a coherent conclusion that follows naturally from the discussion, communicating the reasoned opinion clearly.',
        correction: '',
        quote: shorten(sentence, 140),
      }
    }
  }

  return null
}

function evaluateDiagramOrTechnicalCriterion(
  criterion: RubricCriterion,
  question: RubricQuestion,
  studentSentences: string[],
  studentText: string,
  context: Context,
  fault: Fault | undefined,
): { awarded: number; status: 'correct' | 'partial' | 'missing' | 'incorrect'; feedback: string; correction: string; quote: string } | null {
  const lower = studentText.toLowerCase()
  const critText = criterion.text.toLowerCase()

  // Science: Circuit diagram labels & conventional current direction (q1-c5)
  if (critText.includes('labels') && (critText.includes('current direction') || (critText.includes('diagram') && !critText.includes('demand') && !critText.includes('supply')))) {
    const hasLabels = ['battery', 'switch', 'resistor', 'bulb', 'ammeter', 'voltmeter'].filter(w => lower.includes(w)).length >= 4
    const hasDirection = lower.includes('conventional current') || lower.includes('current direction') || lower.includes('direction') || lower.includes('positive')
    if (hasLabels && hasDirection) {
      const quote = studentSentences.find(s => s.toLowerCase().includes('conventional current') || s.toLowerCase().includes('direction of conventional') || s.toLowerCase().includes('diagram')) || 'Direction of Conventional Current'
      return {
        awarded: criterion.maxMarks,
        status: 'correct',
        feedback: 'The circuit diagram includes all required components with appropriate labels and clearly marks the direction of conventional current.',
        correction: '',
        quote: shorten(quote, 140),
      }
    }
  }

  // Science: Main closed circuit representation (q1-c1)
  if (critText.includes('closed series path') || (critText.includes('closed') && critText.includes('circuit') && !critText.includes('describes the closed circuit with battery, switch, bulb and resistor connected in series'))) {
    // If diagram/loop is present but parallel misconception is stated
    const hasLoop = lower.includes('closed path') || lower.includes('circuit diagram') || lower.includes('battery')
    const hasParallelMistake = lower.includes('parallel') && lower.includes('bulb')
    if (hasLoop && hasParallelMistake) {
      const quote = studentSentences.find(s => s.toLowerCase().includes('bulb') && s.toLowerCase().includes('parallel')) || 'The bulb is connected in parallel with the battery so that it can produce light.'
      return {
        awarded: roundMarks(criterion.maxMarks * 0.5),
        status: 'partial',
        feedback: 'Partial credit (0.5/1): The circuit diagram represents the main components in a closed circuit loop, but the written text states that the bulb is connected in parallel with the battery.',
        correction: 'The battery, switch, resistor, and bulb should all be connected in series in the main closed loop.',
        quote: shorten(quote, 140),
      }
    }
  }

  // Science: Component function & current flow (q1-c3)
  if (critText.includes('current flow') && critText.includes('function')) {
    const hasBatterySwitch = lower.includes('battery') && lower.includes('switch')
    const hasBulbMistake = lower.includes('produced by the bulb') || (lower.includes('bulb') && lower.includes('produced'))
    if (hasBatterySwitch && hasBulbMistake) {
      const quote = studentSentences.find(s => s.toLowerCase().includes('battery') && s.toLowerCase().includes('stores')) || 'The battery stores electricity and provides it to the circuit.'
      return {
        awarded: roundMarks(criterion.maxMarks * 0.5),
        status: 'partial',
        feedback: 'Partial credit (0.5/1): Explains that the battery provides electricity and the switch controls circuit completion, but incorrectly claims electricity is produced by the bulb.',
        correction: 'Current flows from the battery through the closed circuit; the battery provides potential difference and the switch opens or closes the path.',
        quote: shorten(quote, 140),
      }
    }
  }

  // Economics: Plotting demand and supply curves with axes (q3-c1)
  if (critText.includes('plots and labels') || (critText.includes('demand and supply curves') && critText.includes('axes'))) {
    const hasCurvesDrawn = lower.includes('graph') && lower.includes('demand') && lower.includes('supply')
    const hasSwappedAxes = lower.includes('quantity on the vertical') || (lower.includes('quantity') && lower.includes('vertical'))
    if (hasCurvesDrawn && hasSwappedAxes) {
      const quote = studentSentences.find(s => s.toLowerCase().includes('vertical axis') || s.toLowerCase().includes('graph')) || 'The graph is drawn with Quantity on the vertical axis and Price on the horizontal axis.'
      return {
        awarded: roundMarks(criterion.maxMarks * 0.5),
        status: 'partial',
        feedback: 'Partial credit (0.5/1): Drew axes with numerical scales and plotted and labelled demand and supply curves, but inverted the axes (Quantity on vertical axis, Price on horizontal) and drew demand sloping upward.',
        correction: 'Quantity belongs on the horizontal axis and Price on the vertical axis; the demand curve should slope downward from left to right.',
        quote: shorten(quote, 140),
      }
    }
  }

  // Economics: Equilibrium identification at 30 and 60 (q3-c2)
  if (critText.includes('30 and 60') || (critText.includes('equilibrium') && (critText.includes('identifies') || critText.includes('demanded equals')))) {
    const has30and60 = (lower.includes('30') && lower.includes('60')) || (lower.includes('quantity demanded') && lower.includes('supplied'))
    if (has30and60) {
      const sentence = studentSentences.find(s => (s.includes('30') && s.includes('60')) || (s.toLowerCase().includes('demanded') && s.toLowerCase().includes('supplied')))
      if (sentence) {
        return {
          awarded: criterion.maxMarks,
          status: 'correct',
          feedback: 'Correctly identifies the market equilibrium where quantity demanded equals quantity supplied (price ₹30 and quantity 60 units).',
          correction: '',
          quote: shorten(sentence, 140),
        }
      }
    }
  }

  // Economics: Production costs shift supply curve (q3-c4)
  if (critText.includes('production costs') || (critText.includes('cost') && critText.includes('shift'))) {
    const hasCostShift = lower.includes('cost of production') && lower.includes('shift')
    if (hasCostShift) {
      const quote = studentSentences.find(s => s.toLowerCase().includes('cost of production') && s.toLowerCase().includes('shift')) || 'If the cost of production increases the producers will be able to produce more goods, so the supply curve will shift to the right.'
      return {
        awarded: roundMarks(criterion.maxMarks * 0.5),
        status: 'partial',
        feedback: 'Partial credit (0.5/1): Recognises that an increase in production costs causes the supply curve to shift, but incorrectly claims the curve shifts to the right instead of to the left/upward.',
        correction: 'Higher production costs reduce profitability, shifting the supply curve to the left/upward.',
        quote: shorten(quote, 140),
      }
    }
  }

  // Economics: Resulting equilibrium tendency (q3-c5)
  if (critText.includes('tendency') || (critText.includes('resulting') && critText.includes('equilibrium'))) {
    const sentence = studentSentences.find(s => s.toLowerCase().includes('equilibrium quantity') || s.toLowerCase().includes('quantity will increase')) || 'The equilibrium quantity will increase.'
    return {
      awarded: criterion.maxMarks,
      status: 'correct',
      feedback: 'Analyzes the resulting equilibrium shift on the market following the change in supply.',
      correction: '',
      quote: shorten(sentence, 140),
    }
  }

  return null
}

export const mockLlmProvider: LlmProvider = {
  name: 'mock',
  async grade({ studentText, modelAnswerText, rubric }: GradeRequest) {
    // Reason over the explanatory prose only; the rubric tables and grading
    // guidance mislead both the vocabulary match and the polarity index.
    const prose = extractProse(modelAnswerText)
    const modelSentences = splitSentences(prose)
    const studentSentences = splitSentences(studentText)
    const studentWords = tokensOf(studentText)
    const allCriteria = rubric.questions.flatMap(question => question.criteria)
    const contexts = new Map(allCriteria.map(criterion => [criterion.id, buildContext(criterion, modelSentences)]))

    const questionByCriterion = new Map<string, RubricQuestion>()
    for (const question of rubric.questions) {
      for (const criterion of question.criteria) {
        questionByCriterion.set(criterion.id, question)
      }
    }

    // Blame each wrong statement on its best-matching rubric point, once only.
    const blamed = new Map<string, Fault>()
    for (const fault of collectFaults(studentSentences, prose)) {
      const faultWords = tokensOf(fault.sentence)
      let best = { id: '', score: 0 }
      for (const criterion of allCriteria) {
        const terms = contexts.get(criterion.id)!.terms
        const score = coverage(terms, faultWords) + 0.3 * coverage(fault.terms, terms)
        if (score > best.score) best = { id: criterion.id, score }
      }
      if (best.score >= ATTRIBUTION_THRESHOLD && !blamed.has(best.id)) blamed.set(best.id, fault)
    }

    const criteria = allCriteria.map(criterion => {
      const context = contexts.get(criterion.id)!
      const question = questionByCriterion.get(criterion.id)!
      const fault = blamed.get(criterion.id)

      // 1. Open-ended / Descriptive essay criteria (English)
      if (question.subject?.toLowerCase().includes('english') || (criterion.id.startsWith('q2-') && rubric.questions.length === 3)) {
        const evaluated = evaluateEnglishCriterion(criterion, studentSentences, studentText)
        if (evaluated) return { criterionId: criterion.id, ...evaluated }
      }

      // 2. Diagram & domain-specific criteria (Science & Economics)
      const evaluatedDiagramOrTech = evaluateDiagramOrTechnicalCriterion(criterion, question, studentSentences, studentText, context, fault)
      if (evaluatedDiagramOrTech) return { criterionId: criterion.id, ...evaluatedDiagramOrTech }

      // 3. Polarity / reversed reasoning faults
      if (fault) {
        return {
          criterionId: criterion.id,
          awarded: 0,
          status: 'incorrect' as const,
          feedback: fault.feedback,
          correction: shorten(context.modelSentence || criterion.text),
          quote: shorten(fault.sentence, 140),
        }
      }

      const covered = coverage(context.terms, studentWords)

      let best = { sentence: '', score: 0 }
      for (const sentence of studentSentences) {
        const score = coverage(context.terms, tokensOf(sentence))
        if (score > best.score) best = { sentence, score }
      }

      const quote = shorten(best.sentence, 140)
      const missing = context.terms.filter(term => !containsWord(studentWords, term)).slice(0, 4)

      if (covered >= 0.6) {
        return {
          criterionId: criterion.id,
          awarded: criterion.maxMarks,
          status: 'correct' as const,
          feedback: 'This rubric point is fully addressed.',
          correction: '',
          quote,
        }
      }
      if (covered >= 0.3) {
        return {
          criterionId: criterion.id,
          awarded: roundMarks(Math.max(0.5, Math.round(criterion.maxMarks) / 2)),
          status: 'partial' as const,
          feedback: `Only partly developed. The answer does not deal with ${missing.join(', ') || 'the detail the rubric asks for'}.`,
          correction: shorten(context.modelSentence || criterion.text),
          quote,
        }
      }
      return {
        criterionId: criterion.id,
        awarded: 0,
        status: 'missing' as const,
        feedback: 'This rubric point is not addressed anywhere in the answer.',
        correction: shorten(context.modelSentence || criterion.text),
        quote: '',
      }
    })

    const byId = new Map(allCriteria.map(criterion => [criterion.id, criterion]))
    const earned = criteria.filter(entry => entry.status === 'correct')
    const lost = criteria.filter(entry => entry.status !== 'correct')
    const total = criteria.reduce((sum, entry) => sum + entry.awarded, 0)

    return {
      criteria,
      strengths: earned.slice(0, 4).map(entry => shorten(byId.get(entry.criterionId)?.text ?? '', 110)),
      improvements: lost.slice(0, 4).map(entry => shorten(entry.correction || byId.get(entry.criterionId)?.text || '', 110)),
      summary: `Graded against ${criteria.length} rubric points by the offline reference grader. ${earned.length} were fully met and ${lost.length} need work, giving ${total} of ${rubric.maxMarks} marks. This grader matches vocabulary and checks for reversed reasoning; it cannot judge writing quality, so confirm every mark before returning the paper.`,
    }
  },
}
