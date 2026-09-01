import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { env } from '../config/env.js'

function open(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const instance = new Database(path)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  return instance
}

export const db = open(env.databasePath)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS grading_sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    assignment TEXT NOT NULL DEFAULT '',
    question_paper_id TEXT,
    model_answer_id TEXT,
    student_answer_id TEXT,
    report_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES grading_sessions(id) ON DELETE SET NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ocr_results (
    upload_id TEXT PRIMARY KEY REFERENCES uploaded_files(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    text TEXT NOT NULL,
    average_confidence REAL NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grading_reports (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    assignment TEXT NOT NULL,
    total_awarded REAL NOT NULL,
    max_marks REAL NOT NULL,
    percentage REAL NOT NULL,
    confidence REAL NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0,
    ocr_text TEXT NOT NULL,
    grading_json TEXT NOT NULL,
    rubric_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    report_id TEXT,
    criterion_id TEXT,
    page INTEGER NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    type TEXT NOT NULL,
    quote TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    correction TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);
  CREATE INDEX IF NOT EXISTS idx_reports_created ON grading_reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_uploads_session ON uploaded_files(session_id);
`

export function initializeDatabase(instance: Database.Database = db) {
  instance.exec(SCHEMA)
}

// Applied on import so that any entry point - the server, a script or a test
// importing a service directly - gets a database with a schema.
initializeDatabase(db)

/** Used by the test suite to get an isolated in-memory database per file. */
export function createTestDatabase() {
  const instance = open(':memory:')
  initializeDatabase(instance)
  return instance
}
