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

import { buildRubricPrompt } from './prompt.js'

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
        contents: buildRubricPrompt(request),
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
