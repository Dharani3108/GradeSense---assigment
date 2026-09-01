# Architecture

Two independent packages. The frontend is a Vite/React SPA; the backend is an Express API with a
local SQLite file. They share no code, only a JSON contract that
[`src/types/grading.ts`](../src/types/grading.ts) mirrors from
[`backend/src/types/grading.ts`](../backend/src/types/grading.ts).

```
 Browser (5173)                         Backend (4000)                     Local resources
┌──────────────────┐                  ┌───────────────────────┐
│ UploadWizardPage │ ─ POST /sessions │ session.service       │ ──────▶ SQLite grading_sessions
│                  │ ─ POST /uploads  │ upload.service        │ ──────▶ uploads/*  (never mutated)
├──────────────────┤                  ├───────────────────────┤
│ ProcessingPage   │ ─ POST /grade ──▶│ workflow.service      │
│                  │                  │   ├─ ocr.service ─────┼──────▶ OCR provider
│                  │                  │   ├─ rubric.service   │        vision │ pdf-text │ mock
│                  │                  │   ├─ grading.service ─┼──────▶ LLM provider
│                  │                  │   │   (guard rails)   │        gemini │ mock
│                  │                  │   ├─ history.service  │ ──────▶ SQLite grading_reports
│                  │                  │   └─ annotation.service ─────▶ SQLite annotations
├──────────────────┤                  ├───────────────────────┤
│ ResultsPage      │ ◀ GET  /sessions/:id                     │
│  AnswerCanvas    │ ─ PATCH /annotations/:id ──▶ annotation.service   (no regrade)
│  AnnotationInsp. │ ─ GET  /reports/:id/export ▶ export.service ────▶ annotated COPY (pdf-lib)
├──────────────────┤                  │                       │
│ HistoryPage      │ ◀ GET  /reports  │ history.service        │
└──────────────────┘                  └───────────────────────┘
```

## The five decisions that shape this codebase

### 1. A session is the unit of work

`grading_sessions` ties the three uploads, the OCR cache, the report and its annotations together.
Everything downstream addresses a session id, so the export knows exactly which file a report belongs
to. (The version this replaced guessed, by picking the most recent student upload created before the
report's timestamp.)

### 2. Providers are swappable, and the app runs with no cloud account

| Concern | Real | Fallback | Chosen by |
|---|---|---|---|
| Text extraction | Google Cloud Vision | `pdf-text` (pdf.js text layer, plain text) | `OCR_PROVIDER`, else credentials |
| Grading | Gemini (`gemini-2.5-flash`) | offline reference grader | `LLM_PROVIDER`, else `GEMINI_API_KEY` |

`auto` (the default) picks the real provider when its credentials exist and falls back otherwise, so
`npm run dev` works on a clean machine. Three things follow from this:

- The assignment permits a mock model, and the offline grader is a genuine one rather than canned JSON.
- The failure cases the assignment asks for — API failure, malformed output, timeouts — are testable by
  injecting a provider, with no network and no mocking library.
- Nothing pretends. When an image is uploaded without Vision credentials the OCR result comes back
  empty **with a warning**, which the grading layer turns into a flagged zero-score report rather than
  a hallucinated grade.

### 3. The model is untrusted input

[`grading.service.ts`](../backend/src/services/grading.service.ts) is the only path from a model
response to a stored report, and it treats that response the way you would treat a form post:

- **JSON coercion** — unwraps code fences and prose around the object before parsing.
- **Per-row validation** — each rubric decision is validated on its own. A malformed row is discarded and
  counted; a rubric point the model skipped becomes a flagged zero, never a silent one. One bad
  top-level field cannot discard rows that were fine.
- **Clamping** — every mark is clamped to `[0, criterion.maxMarks]`, each question total is recomputed
  as the sum of its points, and the paper total as the sum of the questions. *Marks above the
  maximum and totals that disagree with their parts are structurally impossible*, not merely unlikely.
- **Evidence verification** — every quote is matched back against the OCR text with a fuzzy comparison
  that survives OCR damage. An unverifiable quote on a scoring point is recorded and flagged.
- **Retry and timeout** — transient failures retry with backoff; the timeout rejects on its own timer
  rather than trusting the client to honour an abort signal.
- **Confidence and review** — confidence blends OCR quality, the verified-evidence rate and how much the
  provider is trusted. Any adjustment, any unparsed rubric, any OCR warning, or use of the offline
  grader sets `needsReview` with a reason in plain words.

Every correction is recorded in `adjustments` and surfaced in the UI and the exported PDF, so a
teacher can see what the system changed and why.

### 4. Annotations are rows, not a view of the grade

This is what makes the output editable. Annotations are generated from the grading result once, then
persisted with their own coordinates, type, comment and correction. Moving, retyping, reclassifying or
deleting one is a `PATCH`/`DELETE` on that row — the report is untouched and the paper is never
regraded. The export renders the persisted rows, so the PDF always reflects the teacher's edits rather
than the AI's first draft.

Geometry is normalised to `0..1` with a top-left origin at OCR time. The same numbers drive the browser
overlay and the PDF, so a box cannot drift between what the teacher sees and what the student receives.

Placement comes from [`locateQuote`](../backend/src/utils/text.ts): the graded quote is matched against
the OCR word stream with a tolerant per-token comparison, and the matched words are grouped by line, so
a quote that wraps produces one underline per line instead of a box swallowing the paragraph. A rubric
point the student never attempted has nothing to underline, so it is pinned in the right margin.

### 5. The offline grader checks reasoning, not just vocabulary

A keyword-coverage grader awards full marks to *"the voltmeter is connected in series with the bulb"* —
every expected word is present. [`utils/polarity.ts`](../backend/src/utils/polarity.ts) is what stops
that, with three checks built from the model answer:

1. **Association** — the model links "voltmeter" to *parallel*; the student links it to *series*.
2. **Swapped pair** — the model links "below" to *shortage*; the student links it to *surplus*.
3. **Direction** — the model has resistance up / current down; the student has both up.

Two details matter. The index counts occurrences instead of flagging them, because the model answer's
own grading guidance *("if the student places the voltmeter in series … that is a substantive error")*
states the wrong pairing, and one such mention must not cancel the correct ones. And the rubric tables
and guidance are stripped before reasoning ([`extractProse`](../backend/src/services/rubric.service.ts)),
because a rubric row repeats its criterion verbatim and so always "matches" itself.

Faults are found across the whole answer first, then attributed to the single rubric point they best
match. Checking each criterion's top-scoring sentence in isolation blamed errors on the wrong question.

## Request flow for a grading run

`POST /api/sessions/:id/grade` →
OCR all three documents (cached per upload) →
parse the rubric from the model answer →
call the grading provider with retry/timeout →
validate, clamp and verify →
save the report →
generate and persist annotations →
mark the session `graded`.

Any failure marks the session `failed` with a message and saves no marks. The UI says so explicitly:
*"No marks were saved."*

## Data model

| Table | Holds |
|---|---|
| `grading_sessions` | the three upload ids, status, student name, assignment, error |
| `uploaded_files` | original name, mime type, stored path (files are read-only after upload) |
| `ocr_results` | cached extraction per upload, so a regrade costs no OCR calls |
| `grading_reports` | marks, maximum, confidence, review flag, plus the full grading and rubric JSON |
| `annotations` | normalised rectangle, type, quote, comment, correction, `ai` or `teacher` |

## Frontend layering

Per [`PROJECT_RULES.md`](../PROJECT_RULES.md): transport in `src/lib` (`api-client.ts` — one fetch
wrapper, one error type, no hard-coded hosts), endpoint calls in `src/services`, reusable async state in
`src/hooks` (`useAsync` aborts in-flight requests on unmount; `useAnnotations` applies edits
optimistically and rolls back on failure), shared types in `src/types`.

The session id lives in the route (`/results/:sessionId`), so a refresh, a bookmark, or a link from
history all restore the same paper. pdf.js is loaded with a dynamic `import()` because only the results
screen needs it, which keeps it out of the initial bundle.

## Testing

65 tests, all against the real code path with an in-memory database per test file. The provider seam is
what makes the reliability cases testable without a network: `stubProvider` returns any response you
like, `failingProvider` throws. See the [README](../README.md#tests) for the case list and output.
