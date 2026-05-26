# Cursor Plan (as approved before implementation)

This is the plan that was produced in Cursor's Plan Mode and approved before any code was written. It is reproduced verbatim from the approved plan to leave a clean audit trail.

---

## 1. Repo Layout

```
/
|-- A/pdf-viewer-sdk-mvp/        # working app (npm i && npm run dev)
|   |-- index.html
|   |-- package.json
|   |-- tsconfig.json
|   |-- vite.config.ts
|   |-- README.md                # setup, manual checklist, known limits
|   |-- public/                  # optional sample.pdf
|   |-- src/
|       |-- main.tsx
|       |-- App.tsx
|       |-- components/
|       |   |-- AppShell.tsx
|       |   |-- PdfViewer.tsx
|       |   |-- ViewerToolbar.tsx
|       |   |-- EditorToolbar.tsx
|       |   |-- PageThumbnailGrid.tsx
|       |   |-- LoadingIndicator.tsx
|       |-- hooks/
|       |   |-- usePdfDocument.ts
|       |-- utils/
|       |   |-- pdfOperations.ts # pdf-lib edits (pure-ish)
|       |   |-- fileUtils.ts     # read/download helpers
|       |   |-- pdfjs.ts         # worker setup
|       |-- types.ts
|       |-- styles.css
|       |-- __tests__/
|           |-- pdfOperations.test.ts
|-- B/
|   |-- architecture.md          # diagram, state, tradeoffs, +1 day
|-- C/
|   |-- cursor-plan.md           # this file
|   |-- ai-usage-log.md          # AI usage log
```

## 2. Component Responsibilities

- `App.tsx` - top-level state container; wires hook, toolbar, viewer, grid; mode switch.
- `AppShell.tsx` - header (back, doc title, quick download).
- `ViewerToolbar.tsx` - upload, view/edit toggle, prev/next + page number, zoom +/-, fit-width, fit-viewport, continuous/single toggle, print, download.
- `EditorToolbar.tsx` - rotate L/R, delete selected, move up/down, extract selected, import/merge, save.
- `PdfViewer.tsx` - renders pages from `pdfDocProxy` to canvas via PDF.js; supports continuous list and single-page.
- `PageThumbnailGrid.tsx` - small canvas thumbnails, selection state, page-number badges.
- `LoadingIndicator.tsx` - determinate bar when bytes are loading; spinner during edit operations.
- `usePdfDocument.ts` - takes bytes, returns `{ pdfDocProxy, pageCount, loading, error }`.
- `pdfOperations.ts` - pure functions over `Uint8Array` using pdf-lib.
- `fileUtils.ts` - `readFileAsBytes(File)`, `downloadBytes(bytes, name)`, `printPdfBytes(bytes)`.

## 3. State Model

`App.tsx` is the single owner. Slices:

- `originalFile: File | null`
- `currentPdfBytes: Uint8Array | null` - canonical document
- `pdfDocProxy` (derived in hook)
- `pageCount: number`
- `currentPage: number`
- `zoom: number`, `fitMode: 'none'|'width'|'page'`
- `viewMode: 'view'|'edit'`, `pageMode: 'continuous'|'single'`
- `selectedPages: Set<number>`
- `pageOrder: number[] | null`, `pageRotations: Record<number, Rotation>` - session-only overrides flushed into bytes on save/extract/download/edit
- `busy/progress/error`

## 4. PDF Operations Approach

- Read via `File.arrayBuffer()` -> `Uint8Array`.
- Render with pdfjs-dist (worker URL imported via Vite `?url`).
- Edit via pdf-lib: load, mutate, `save()` -> new bytes -> set as `currentPdfBytes`.
- Session rotations / order flushed into bytes before any save/extract/delete/merge.
- Print: hidden iframe with `window.print()`.

## 5. Risks / Tradeoffs

- PDF.js is JS (no WASM here). Documented honestly.
- Whole-file load (no linearized streaming) because of local-File API constraints.
- pdf-lib may degrade some forms/annotations on re-save.
- Re-parsing after each edit is O(doc) but acceptable for MVP.
- Thumbnails capped at ~160px to keep memory bounded.

## 6. Build Order

1. Scaffold Vite-React-TS, configure pdfjs worker.
2. fileUtils + upload + `usePdfDocument`.
3. PdfViewer continuous + single + zoom + fit.
4. ViewerToolbar + loading UI.
5. View/Edit toggle + thumbnail grid + selection.
6. pdfOperations + EditorToolbar wiring.
7. Save / Extract / Merge / Download flow.
8. Vitest unit tests for pdfOperations.
9. README + architecture.md + AI usage log.

## 7. Intentionally Deferred

- Real annotations/redactions/signatures (would need PDFium/WASM or commercial SDK).
- True linearized/range-request streaming (no backend).
- Drag-and-drop reorder (using up/down buttons instead).
- Multi-document tabs, persistence, cloud storage, auth.
- Comprehensive a11y pass and i18n.
- E2E tests (Playwright) and CI workflow.
