# GradeSense backend

Express + TypeScript API over a local SQLite file. It extracts text from the uploaded documents, parses
the marking rubric out of the model answer, grades each rubric point, verifies and clamps the result,
persists editable annotations, and renders an annotated copy of the answer paper as a PDF.

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for how the pieces fit together and why.

## Run

```bash
npm install
npm run dev     # http://localhost:4000
```

No `.env` is required — every setting has a working default. Copy [`.env.example`](.env.example) to
`.env` to change any of them. On start-up the server prints which providers it resolved:

```
GradeSense backend listening on http://localhost:4000
  grading model : mock (offline reference grader - set GEMINI_API_KEY for Gemini)
  text extraction: pdf-text (set GOOGLE_APPLICATION_CREDENTIALS for image OCR)
```

## Providers

Both are chosen by `auto` at start-up: the real provider when its credentials exist, the fallback
otherwise. Force one with `LLM_PROVIDER` / `OCR_PROVIDER`.

| | Real | Fallback |
|---|---|---|
| Grading | Gemini `gemini-2.5-flash` (`GEMINI_API_KEY`) | offline reference grader, `providers/llm/mock.ts` |
| Text | Google Cloud Vision (`GOOGLE_APPLICATION_CREDENTIALS`) | pdf.js text layer and plain text, `providers/ocr/pdf-text.ts` |

Uploads accept PDF, PNG, JPG and TXT up to 10 MB. Reading a scan or a photograph needs Vision; a PDF
with a text layer does not. Without Vision an image extraction returns empty **with a warning**, which
becomes a zero-score report flagged for review rather than an invented grade.

## Tests

```bash
npm test
```

65 tests over the real code path, each file with its own in-memory database. The provider seam lets the
suite simulate API failures, timeouts and malformed output with no network. Output is in
[`../docs/test-output.txt`](../docs/test-output.txt).

## Layout

```
src/
  config/env.ts          settings and provider resolution
  providers/ocr/         vision | pdf-text | mock
  providers/llm/         gemini | mock          (returns raw, unvalidated output)
  services/
    workflow.service     the one path from three uploads to a stored report
    ocr.service          extraction, cached per upload
    rubric.service       parses the marking table; extractProse strips it for reasoning
    grading.service      validation, clamping, evidence checks, retry, confidence
    annotation.service   generation, placement, and CRUD
    export.service       annotated copy via pdf-lib
    history.service      reports
    session.service      ties uploads, report and annotations together
  utils/
    text.ts              fuzzy matching and quote location
    polarity.ts          reversed-reasoning detection
  controllers/ routes/ middleware/
scripts/
  make-student-answer.ts  regenerates docs/samples/student-answer.pdf
docs/samples/             question paper, model answer, student answer
```

## Sample documents

`docs/samples/` holds the three documents the tests and the demo use. `npm run seed:answer` regenerates
the student answer, with the deliberate mistakes listed in [`../docs/ERROR_KEY.md`](../docs/ERROR_KEY.md).

## API

Listed in the [root README](../README.md#api).
