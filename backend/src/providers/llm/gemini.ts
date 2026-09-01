import { env } from '../../config/env.js'
import type { GradeRequest, LlmProvider } from './types.js'
import { LlmError } from './types.js'

/** Mirrors the shape the grading service validates, as a generation constraint. */
function responseSchema(Type: Record<string, string>) {
  return {
    type: Type.OBJECT,
    properties: {
      criteria: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            criterionId: { type: Type.STRING },
            awarded: { type: Type.NUMBER },
            status: { type: Type.STRING, enum: ['correct', 'partial', 'missing', 'incorrect'] },
            feedback: { type: Type.STRING },
            correction: { type: Type.STRING },
            quote: { type: Type.STRING },
          },
          required: ['criterionId', 'awarded', 'status', 'feedback', 'correction', 'quote'],
        },
      },
      strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
      improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
      summary: { type: Type.STRING },
    },
    required: ['criteria', 'strengths', 'improvements', 'summary'],
  }
}

function buildPrompt({ studentText, modelAnswerText, questionPaperText, rubric }: GradeRequest) {
  const criteria = rubric.questions
    .flatMap(question => question.criteria.map(criterion => `- id=${criterion.id} (question ${question.number}, max ${criterion.maxMarks} mark(s)): ${criterion.text}`))
    .join('\n')
  return `You are GradeSense, an examiner that must be auditable by a teacher.

Grade the student answer against the marking rubric. Return one entry for EVERY rubric id listed, in the same order.

Rules you must follow:
- "awarded" must be between 0 and the criterion's max marks. Never exceed the max.
- Judge the quality of the reasoning, NOT similarity to the model answer. A student who argues a different position can still earn full marks.
- "quote" must be an EXACT, short span copied from the student answer that justifies your decision. Copy it character for character. If the point is entirely absent, use an empty string.
- "status": "correct" for full credit, "partial" when the point is only half made, "missing" when the student never addresses it, "incorrect" when the student addresses it but states something wrong.
- "feedback" states specifically what the student did or failed to do.
- "correction" states what a full-credit answer would have said, in one sentence.
- Do not invent evidence. If you are unsure, say so in the feedback and mark it partial.

Rubric:
${criteria}

<question_paper>
${questionPaperText.slice(0, 6000)}
</question_paper>

<model_answer_and_guidance>
${modelAnswerText.slice(0, 12000)}
</model_answer_and_guidance>

<student_answer>
${studentText.slice(0, 12000)}
</student_answer>

Return only the JSON object.`
}

export const geminiProvider: LlmProvider = {
  name: 'gemini',
  async grade(request: GradeRequest, signal: AbortSignal) {
    if (!env.geminiApiKey) throw new LlmError('GEMINI_API_KEY is not configured.', false)
    const { GoogleGenAI, Type } = await import('@google/genai')
    const client = new GoogleGenAI({ apiKey: env.geminiApiKey })
    let response
    try {
      response = await client.models.generateContent({
        model: env.geminiModel,
        contents: buildPrompt(request),
        config: { responseMimeType: 'application/json', responseSchema: responseSchema(Type as unknown as Record<string, string>), abortSignal: signal },
      })
    } catch (error) {
      throw new LlmError(error instanceof Error ? error.message : 'The Gemini request failed.', true)
    }
    if (!response.text) throw new LlmError('Gemini returned an empty response.', true)
    // Deliberately not parsed here: malformed JSON is the grading service's problem to repair.
    return response.text
  },
}
