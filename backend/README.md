# GradeSense backend

The backend is a standalone Express + TypeScript wrapper. It currently provides typed placeholder endpoints, multipart document storage, and automatic SQLite schema initialisation only. No OCR, AI grading, annotation generation, or report export is implemented.

## Run locally

```bash
cd backend
npm install
npm run dev
```

The service runs on `http://localhost:4000` by default. Copy `.env.example` to `.env` to change the port, frontend origin, or database location.

## Upload endpoint

`POST /api/upload` accepts `multipart/form-data` fields named `questionPaper`, `modelAnswer`, and `studentAnswer`. Each field accepts one PDF, PNG, JPG, or JPEG file up to 10 MB.
