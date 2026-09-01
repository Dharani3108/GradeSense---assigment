import Database from 'better-sqlite3'
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const databasePath = resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/gradesense.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grading_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES grading_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      label TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES grading_sessions(id)
    );
  `)
}
