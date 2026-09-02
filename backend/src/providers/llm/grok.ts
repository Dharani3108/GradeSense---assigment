import type { GradeRequest, LlmProvider } from './types.js'
import { LlmError } from './types.js'
import { buildRubricPrompt } from './prompt.js'

export const grokProvider: LlmProvider = {
  name: 'grok' as any,
  async grade(request: GradeRequest, signal: AbortSignal): Promise<string> {
    const apiKey = process.env.GROK_API_KEY?.trim() || process.env.XAI_API_KEY?.trim()
    if (!apiKey) {
      throw new LlmError('GROK_API_KEY or XAI_API_KEY is not configured.', false)
    }

    const model = process.env.GROK_MODEL?.trim() || 'grok-2-latest'
    const endpoint = process.env.GROK_ENDPOINT?.trim() || 'https://api.x.ai/v1/chat/completions'

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are GradeSense, an expert academic examiner that strictly follows marking rubrics.',
            },
            {
              role: 'user',
              content: buildRubricPrompt(request),
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal,
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new LlmError(`Grok API error ${res.status}: ${errorText}`, res.status >= 500 || res.status === 429)
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new LlmError('Grok returned an empty response.', true)
      }

      return content
    } catch (err: any) {
      if (err instanceof LlmError) throw err
      if (err.name === 'AbortError') {
        throw new LlmError('The Grok request timed out.', true)
      }
      throw new LlmError(err.message || 'Failed to communicate with Grok API.', true)
    }
  },
}
