import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Runs before each test file's imports, so config/env picks these up. Every
 * file gets an isolated database and upload directory.
 */
const directory = mkdtempSync(join(tmpdir(), 'gradesense-test-'))

process.env.DATABASE_PATH = join(directory, 'gradesense.sqlite')
process.env.UPLOAD_ROOT = join(directory, 'uploads')
process.env.LLM_PROVIDER = 'mock'
process.env.OCR_PROVIDER = 'pdf-text'
process.env.LLM_MAX_ATTEMPTS = '2'
process.env.LLM_TIMEOUT_MS = '2000'
process.env.GEMINI_API_KEY = ''
process.env.GOOGLE_APPLICATION_CREDENTIALS = ''
