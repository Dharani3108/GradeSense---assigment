# GradeSense

Reads a student answer, compares it with a model answer and marking rubric, gives an explainable
score, and shows the mistakes on the answer paper itself — where a teacher can move, reword or delete
any annotation without regrading, then export an annotated copy as a PDF.

React + TypeScript frontend, Node/Express backend, SQLite for persistence.

**It runs with no API keys.** Grading falls back to a deterministic offline grader and text extraction
reads the PDF text layer, so `npm run dev` works on a clean machine. Add a Gemini key to grade with a
real model; add Google Cloud Vision credentials to read scans and photographs.

---

## Run it

Two terminals, from the repository root.

```bash
# 1 — backend on http://localhost:4000
cd backend
npm install
npm run dev
```

```bash
# 2 — frontend on http://localhost:5173
npm install
npm run dev
```

Open <http://localhost:5173> and grade the bundled sample paper:

| Step | File |
|---|---|
| Question paper | `backend/docs/samples/question-paper.pdf` |
| Model answer and rubric | `backend/docs/samples/model-answer.pdf` |
| Student answer | `backend/docs/samples/student-answer.pdf` |

The sample answer is written to be wrong in specific, documented ways — see
[`docs/ERROR_KEY.md`](docs/ERROR_KEY.md). It scores **4.5 / 15** and is flagged for human review.

No `.env` is needed. Every setting has a working default; copy
[`backend/.env.example`](backend/.env.example) to `backend/.env` to change any of them.

> **Requires Node 20+.** `better-sqlite3` ships prebuilt binaries; on Node 24 it needs v12 or newer,
> which is what this project pins. No build toolchain is required.

### Grading with Gemini instead

```bash
echo "GEMINI_API_KEY=your-key" >> backend/.env
```

Restart the backend. It prints which providers are active on start-up, and the UI says so too. Keys
are read from the environment and never committed — `.env` is gitignored.

### Reading scans and photographs

Set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of a service-account JSON key. Without it,
uploading an image produces an empty extraction **with a warning**, which becomes a zero-score report
flagged for review rather than an invented grade. PDFs with a text layer and `.txt` files need nothing.

## What it does

**Upload** — question paper, model answer/rubric and student answer, as PDF, TXT, PNG or JPG.

**Grade** — the marking rubric is parsed out of the model answer (the bundled one yields 3 questions ×
5 criteria = 15 marks), then each point is marked against it.

**Explain** — per-point marks with the status (correct / partly correct / missing / incorrect), an exact
quote from the student's answer as evidence, specific feedback, and what a full-credit answer would
have said.

**Annotate** — each finding is boxed or underlined on the answer page with its correction alongside.
Misspellings are flagged with the intended word.

**Edit** — drag a box to move it, drag its corner to resize, use the arrow keys, retype the comment or
correction, change its type, delete it, or draw a new one. None of this regrades the paper.

**Export** — an annotated *copy* as a PDF: the original pages widened with a margin column for the
callouts, plus a summary of every rubric point. The uploaded file is only ever read.

**History** — every report, searchable, with its annotations intact.

## Reliability

The model is treated as untrusted input. [`grading.service.ts`](backend/src/services/grading.service.ts)
is the only path from a model response to a stored report:

| Situation | Behaviour |
|---|---|
| Blank or very short answer | Scored zero and flagged; the model is never called |
| Marks above the rubric maximum | Clamped per point, with the correction recorded and shown |
| Total disagreeing with its parts | Impossible: totals are recomputed as the sum of their points |
| Malformed model output | JSON recovered from prose/fences; bad rows discarded and counted; ungraded points flagged, never silently zeroed |
| Model or API failure | Retried with backoff, then a clear error — **no marks are saved** |
| Model that never responds | Rejected on its own timer, not by trusting an abort signal |
| Quoted evidence not in the answer | Marked unverified, recorded, and flagged for review |
| Unreadable scan | Warned, zero-scored, flagged — never guessed |

Anything uncertain sets `needsReview` with the reason in plain words, on screen and in the exported PDF.
Reports from the offline grader are *always* flagged, because vocabulary matching cannot judge the
quality of an argument.

## Tests

```bash
cd backend
npm test
```

**65 tests, all passing.** Full output: [`docs/test-output.txt`](docs/test-output.txt).

```
 Test Files  4 passed (4)
      Tests  65 passed (65)
```

Every case the assignment asks for, plus the annotation and export guarantees:

| Required case | Test |
|---|---|
| A fully correct answer | `awards full marks with no reversed-reasoning findings` |
| A partially correct answer | `scores between zero and full, and names what is missing` |
| An incorrect answer | `detects reversed relationships that share the expected vocabulary` |
| A blank answer | `scores zero, flags review, and never calls the model` |
| OCR-like spelling errors | `grades it the same as the clean answer` |
| Malformed / incomplete model output | `keeps valid rows, zeroes the malformed ones, and says so` |
| A model / API failure | `retries, then fails with a message instead of a wrong grade` |
| A score exceeding the maximum | `caps each rubric point and records the correction` |

| Also covered | Test |
|---|---|
| Editing does not regrade | `moves an annotation without regrading the paper` |
| The original is never modified | `exports an annotated PDF and leaves the original untouched` |
| Teacher edits reach the PDF | `exports the teacher edits, not the generated set` |
| Marks always sum correctly | `expectMarkInvariants`, asserted on every grading test |

Every grading test runs the real code path with an injected provider, so API failures, timeouts and
malformed output are exercised without a network or a mocking library.

## Deliverables

| | |
|---|---|
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Sample student answer + error key | [`docs/ERROR_KEY.md`](docs/ERROR_KEY.md) |
| Example annotated answer paper | [`docs/example-annotated-answer.pdf`](docs/example-annotated-answer.pdf) |
| Test output | [`docs/test-output.txt`](docs/test-output.txt) |
| Contribution conventions | [`PROJECT_RULES.md`](PROJECT_RULES.md) |

The sample answer is generated, not hand-typed — `cd backend && npm run seed:answer` rewrites
`docs/samples/student-answer.pdf` from
[`scripts/make-student-answer.ts`](backend/scripts/make-student-answer.ts).

## Scripts

| Frontend | |
|---|---|
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | Type-check and build for production |
| `npm run lint` | ESLint |

| Backend | |
|---|---|
| `npm run dev` | API on 4000, restarting on change |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Vitest, once |
| `npm run seed:answer` | Regenerate the sample student answer |

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/config` | Which grading and OCR providers are active |
| `POST` | `/api/sessions` | Start a session (student name, assignment) |
| `GET` | `/api/sessions/:id` | Session, uploads, report, annotations and OCR in one call |
| `POST` | `/api/sessions/:id/uploads` | Upload one document (`questionPaper`, `modelAnswer`, `studentAnswer`) |
| `POST` | `/api/sessions/:id/grade` | Run the grading pipeline |
| `GET` | `/api/sessions/:id/answer-file` | Stream the original answer for the viewer |
| `GET` `POST` | `/api/sessions/:id/annotations` | List or add annotations |
| `PATCH` `DELETE` | `/api/annotations/:id` | Move, edit or delete one — never regrades |
| `GET` | `/api/reports` | Grading history |
| `GET` `DELETE` | `/api/reports/:id` | One report with annotations, or delete it |
| `GET` | `/api/reports/:id/export` | Annotated PDF copy |

## Known limits

- Diagrams and graphs are not interpreted. The bundled paper asks for a circuit diagram and a
  demand-supply graph; GradeSense grades the written explanation around them and marks the drawing
  criteria from the text, so those points in particular deserve the review flag they get.
- The offline grader matches vocabulary and catches reversed reasoning. It cannot judge the quality of
  an argument, which is why it flags every report. Use a Gemini key for real marking.
- Reading handwriting needs Cloud Vision. Without it the tool reads text-layer PDFs and plain text.
- There is no authentication. The assignment says not to build login, so nothing here is
  multi-tenant or internet-facing.
