# Neubus PDF Viewer Challenge

A take-home challenge consisting of three deliverables: a working MVP web app, an architecture write-up, and a record of the AI-assisted workflow used to build it.

## Repo layout

```
/
├── A/pdf-viewer-sdk-mvp/   # Working MVP — React + Vite + TypeScript + PDF.js + pdf-lib
├── B/                      # Architecture document
│   └── architecture.md
└── C/                      # AI workflow artifacts
    ├── cursor-plan.md          # Plan approved before any code was written
    ├── cursor-transcript.md    # Curated transcript of the AI session
    └── ai-usage-log.md         # Summary of how AI was used
```

## A — Run the MVP

```bash
cd A/pdf-viewer-sdk-mvp
npm install
npm run dev
```

Then open the URL Vite prints (typically http://localhost:5173).

Other scripts:

```bash
npm run build     # type-check + production build
npm run preview   # serve the production build locally
npm test          # run vitest once
```

See [`A/pdf-viewer-sdk-mvp/README.md`](A/pdf-viewer-sdk-mvp/README.md) for setup details, the manual test checklist, and known limitations.

## B — Architecture

See [`B/architecture.md`](B/architecture.md) for the component diagram, state model, data flow, and trade-offs.

## C — AI workflow

- [`C/cursor-plan.md`](C/cursor-plan.md) — the plan reviewed and approved in Cursor's Plan Mode before implementation.
- [`C/cursor-transcript.md`](C/cursor-transcript.md) — curated transcript of the AI-assisted session.
- [`C/ai-usage-log.md`](C/ai-usage-log.md) — summary of how AI was used and which decisions were human-driven.
