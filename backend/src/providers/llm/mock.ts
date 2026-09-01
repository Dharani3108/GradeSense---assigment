import type { RubricCriterion } from '../../types/grading.js'
import { extractProse } from '../../services/rubric.service.js'
import { buildPolarityIndex, findContradiction, findDirectionError, splitSentences } from '../../utils/polarity.js'
import { normalizeToken, tokensMatch } from '../../utils/text.js'
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

    // Blame each wrong statement on its best-matching rubric point, once only.
    const blamed = new Map<string, Fault>()
    for (const fault of collectFaults(studentSentences, prose)) {
      const faultWords = tokensOf(fault.sentence)
      let best = { id: '', score: 0 }
      for (const criterion of allCriteria) {
        const terms = contexts.get(criterion.id)!.terms
        // Sentence overlap says which question; the fault's own vocabulary says
        // which point within it, e.g. an axes reversal belongs to the point
        // about labelling the axes, not the one about the new equilibrium.
        const score = coverage(terms, faultWords) + 0.3 * coverage(fault.terms, terms)
        if (score > best.score) best = { id: criterion.id, score }
      }
      if (best.score >= ATTRIBUTION_THRESHOLD && !blamed.has(best.id)) blamed.set(best.id, fault)
    }

    const criteria = allCriteria.map(criterion => {
      const context = contexts.get(criterion.id)!
      const covered = coverage(context.terms, studentWords)

      let best = { sentence: '', score: 0 }
      for (const sentence of studentSentences) {
        const score = coverage(context.terms, tokensOf(sentence))
        if (score > best.score) best = { sentence, score }
      }

      const fault = blamed.get(criterion.id)
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
          awarded: Math.max(0.5, Math.round(criterion.maxMarks) / 2),
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
