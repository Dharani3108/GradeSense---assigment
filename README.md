# GradeSense

A polished, accessible UI shell for GradeSense AI — a reliable grading and annotation workspace. Built with React, TypeScript, Tailwind CSS, React Router, Lucide, and Framer Motion.

## Getting started

```bash
npm install
npm run dev
```

## Available scripts

```bash
npm run dev      # Start the local development server
npm run build    # Type-check and create a production build
npm run lint     # Lint the source code
```

## Included workflows

The UI includes four routed pages:

- `/` — three-step upload wizard
- `/processing` — AI processing progress experience
- `/results` — annotation and review workspace
- `/history` — searchable grading history

All content comes from typed mock data in `src/data/mockGrading.ts`. No API calls, OCR, PDF processing, or grading logic are included.

See [PROJECT_RULES.md](./PROJECT_RULES.md) for contribution conventions.
