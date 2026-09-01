import { app } from './app.js'
import { env } from './config/env.js'
import { resolveLlmProvider } from './providers/llm/index.js'
import { resolveOcrProvider } from './providers/ocr/index.js'

app.listen(env.port, () => {
  console.log(`GradeSense backend listening on http://localhost:${env.port}`)
  console.log(`  grading model : ${resolveLlmProvider().name}${resolveLlmProvider().name === 'mock' ? ' (offline reference grader - set GEMINI_API_KEY for Gemini)' : ''}`)
  console.log(`  text extraction: ${resolveOcrProvider('application/pdf').name}${env.googleCredentials ? '' : ' (set GOOGLE_APPLICATION_CREDENTIALS for image OCR)'}`)
})
