# Cursor AI Usage Log

This is the honest record of how Cursor (in Plan -> Agent mode) was used to build this take-home in roughly 2-3 hours of human time.

---

## Plan mode summary

Before writing a single line of code, the project was scoped in Cursor's **Plan Mode**. The full plan is reproduced in [`cursor-plan.md`](./cursor-plan.md) and was approved unchanged. The plan covered:

1. Repo layout (A / B / C with the required `pdf-viewer-sdk-mvp` subfolder).
2. Component responsibilities and file boundaries.
3. The state model and *why* each slice lives where it does.
4. PDF operations approach: PDF.js for rendering, pdf-lib for editing, bytes-in / bytes-out helpers.
5. Risks and tradeoffs (no WASM, no streaming, no DnD reorder).
6. A 9-step build order tuned to the 2-3 hour timebox.
7. Items intentionally deferred (annotations, signatures, redaction, drag-and-drop reorder, CI, auth).

Approving the plan first kept the build phase tight: no architectural surprises, no scope creep, no rework.

---

## Cursor transcript

The full reconstructed Plan-mode and Agent-mode transcript that produced this implementation - user prompts, what the assistant did in each turn, the type errors that surfaced and how they were fixed, and a tool-usage summary - lives in [`cursor-transcript.md`](./cursor-transcript.md).

---

## What I changed from AI output and why

These are the meaningful edits I made on top of the first-pass AI output. They are listed because the differences are the most informative part of an AI usage log.

1. **PDF.js worker setup.** The AI's first instinct was `pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` plus a copy step. I moved it to `src/utils/pdfjs.ts` using Vite's `?url` import (`import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"`) so it works in dev and prod without any `public/` shuffling and so there's exactly one place to change versions.
2. **Defensive `Uint8Array` copies.** I added explicit `new Uint8Array(bytes)` copies before handing bytes to PDF.js (`getDocument({ data })`) and Blob constructors. pdf-lib and pdfjs can both end up reading from detached buffers in edge cases; the copy is cheap and removes a class of "works on my machine" bugs.
3. **Session-level overrides vs immediate pdf-lib calls.** The AI's first cut wanted to call pdf-lib on every rotate click. On a 100MB PDF that's painful. I introduced `pageRotations` + `pageOrder` as session-only state, plus a single `flushOverrides()` step that runs pdf-lib once at meaningful boundaries (save, extract, download, delete, merge). It's also documented in `B/architecture.md` so it isn't a hidden trick.
4. **Rotation keyed by *source* index.** When the user reorders pages, rotations should follow each page, not stay pinned to a grid position. So `pageRotations` keys are source indices, and `App.tsx` rebuilds a display-indexed map for the viewer via `remapRotationsForDisplay()`. This was not in the AI's first draft.
5. **Cancellable render tasks.** PDF.js raises "Cannot use the same canvas during multiple render() operations" if you re-render before cancelling. I added `renderTask.cancel()` plus `cancelled` flags in both `PdfViewer` and `PageThumbnailGrid` useEffects.
6. **Continuous-mode current page tracking.** I replaced an `onScroll` listener (which fires constantly and causes jank) with an `IntersectionObserver` that picks the most-visible page. It also avoids the "scroll fights the scrollIntoView" loop by checking visibility before calling `scrollIntoView`.
7. **`deletePages` guard.** pdf-lib lets you remove every page and produces a 0-page document that is then invalid. The helper now throws explicitly and the toolbar's Delete button is disabled when the selection equals the page count.
8. **`ignoreEncryption: true`.** Lots of PDFs in the wild are owner-locked but readable. Without this, they refuse to open even though we are only doing structural edits.
9. **Print path.** AI initially proposed `window.print()` on the main window, which prints the React UI, not the PDF. I switched to a hidden iframe loaded with the current bytes via an object URL, then `iframe.contentWindow.print()`.
10. **README manual checklist.** AI produced a short list; I extended it to 19 explicit steps with pass criteria so a reviewer can rip through validation in a few minutes without guessing what "works" means.

---

## How I validated correctness

- **Unit tests** for `pdfOperations` (`npm test`). Tests use pdf-lib both to build synthetic input documents and to verify the output. Coverage includes:
  - blank doc creation, page-count helper
  - delete / extract / merge / reorder length invariants
  - rotation deltas, negative-rotation normalization, absolute rotations
  - rotation stacking across calls and preservation of untouched pages
  - guards (`deletePages` refuses to empty the doc, `extractPages` refuses empty selection, `reorderPages` requires a full permutation)
- **Manual checklist** in `A/pdf-viewer-sdk-mvp/README.md`. Walked it end to end on:
  - a small text-only PDF
  - a multi-page PDF with mixed orientations
  - a PDF re-opened in a separate viewer after Save, to confirm rotations / deletions / reorders / merges actually persisted in the exported bytes
- **Type-check** as part of `npm run build` (`tsc -b`).
- **Error path**: opened a non-PDF file to confirm the red banner appears and the rest of the UI stays interactive.

---

## Known limitations (call them out to the reviewer)

- No dedicated WebAssembly PDF engine. This MVP uses PDF.js for rendering and pdf-lib for editing. I am not claiming this as a fully WASM-backed PDF SDK. PDF.js may use WebAssembly internally for selected decoding paths depending on version and browser/runtime configuration, but this project does not rely on a WASM PDF engine for rendering or editing. The "+1 day" section of `B/architecture.md` describes the path to PDFium/WASM or a commercial SDK for redaction, annotations, signatures, widgets, bookmarks, and optimized large-document workflows.
- **Whole-file load.** With only the local File API, we can't stream a linearized PDF. With a backend, byte-range loading would unlock that.
- **Structural edits only.** Rotate / delete / reorder / extract / merge. No annotation, redaction, form fill, or signature.
- **Up/Down reorder, not drag-and-drop.** DnD is deferred to "+1 day".
- **No persistence.** Closing the tab drops the document.
- **Some round-trips may lose niche features.** pdf-lib re-serializes the doc on save; rare PDFs with embedded JS, exotic forms, or unusual encryption may not survive cleanly.
- **No CI workflow yet.** The repo has no `.github/workflows`. Adding one (GitHub Actions running `npm ci && npm test && npm run build`) is in the "+1 day" list and would be straightforward.
