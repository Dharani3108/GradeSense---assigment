import { GoogleGenAI, Type } from '@google/genai'
import { z } from 'zod'
import type { GradingResult } from '../types/grading.js'
import { ApiError } from '../utils/api-error.js'

export const gradingResultSchema = z.object({
  score: z.number().finite().nonnegative(),
  percentage: z.number().finite().min(0).max(100),
  rubricBreakdown: z.array(z.object({
    criterion: z.string().min(1),
    score: z.number().finite().nonnegative(),
    feedback: z.string().min(1),
  })),
  strengths: z.array(z.string().min(1)),
  improvements: z.array(z.string().min(1)),
  evidence: z.array(z.object({
    quote: z.string().min(1),
    reason: z.string().min(1),
    criterion: z.string().min(1),
  })),
  summary: z.string().min(1),
})

export type GradeRequest = { ocrText: string; rubricText: string; totalMarks: number }

let client: GoogleGenAI | undefined

function getClient() {
  if (client) return client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new ApiError(500, 'GEMINI_API_KEY is not configured.')
  client = new GoogleGenAI({ apiKey })
  return client
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER },
    percentage: { type: Type.NUMBER },
    rubricBreakdown: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { criterion: { type: Type.STRING }, score: { type: Type.NUMBER }, feedback: { type: Type.STRING } }, required: ['criterion', 'score', 'feedback'] } },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
    evidence: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { quote: { type: Type.STRING }, reason: { type: Type.STRING }, criterion: { type: Type.STRING } }, required: ['quote', 'reason', 'criterion'] } },
    summary: { type: Type.STRING },
  },
  required: ['score', 'percentage', 'rubricBreakdown', 'strengths', 'improvements', 'evidence', 'summary'],
}

export async function gradeAnswer({ ocrText, rubricText, totalMarks }: GradeRequest): Promise<GradingResult> {
  const prompt = `You are GradeSense, an explainable educational grading assistant. Assess the student answer strictly against the supplied rubric. Award a total score from 0 to ${totalMarks}. Do not invent evidence. Every evidence quote must be an exact, short quote from the OCR text. Use clear, teacher-facing language. Return only the requested JSON object.\n\n<ocr_text>\n${ocrText}\n</ocr_text>\n\n<rubric>\n${rubricText}\n</rubric>\n\n<total_marks>${totalMarks}</total_marks>`
  let raw: unknown
  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema },
    })
    if (!response.text) throw new ApiError(502, 'Gemini returned an empty grading response.')
    raw = JSON.parse(response.text)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'Gemini grading request failed.')
  }

  const parsed = gradingResultSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(502, 'Gemini returned an invalid grading response.')
  if (parsed.data.score > totalMarks) throw new ApiError(502, 'Gemini returned a score above the total marks.')
  return parsed.data
}
