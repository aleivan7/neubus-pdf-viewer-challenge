# PDF Viewer SDK - Architecture

## 1. Diagram

```
+----------------------------------------------------------------------+
|                                BROWSER                               |
|                                                                      |
|   +-----------+   +--------------+   +-----------------------------+ |
|   | AppShell  |-->| ViewerToolbar|-->|  App.tsx (state container)  | |
|   |  (header) |   +--------------+   |                             | |
|   |           |   | EditorToolbar|-->| originalFile                | |
|   |           |   +--------------+   | currentPdfBytes  <--canon-- | |
|   +-----------+                      | pdfDocProxy (derived)       | |
|        |                             | pageCount  / currentPage    | |
|        v                             | zoom / fitMode / pageMode   | |
|   +-----------+                      | viewMode                    | |
|   | <main>    |                      | selectedPages               | |
|   |           |                      | pageOrder (session)         | |
|   |  EmptyState (no doc)             | pageRotations (session)     | |
|   |  PdfViewer (view mode)<--proxy---| busy / progress / error     | |
|   |  PageThumbnailGrid (edit)<--proxy|                             | |
|   |  LoadingIndicator                +--------------+--------------+ |
|   +-----------+                                     |                |
|                                                     |                |
|   File / Blob / <a download>   <----- fileUtils.ts -+                |
|   Print iframe                                      |                |
|                                                     |                |
|   +--------------------------+    pdf-lib edits     |                |
|   | utils/pdfOperations.ts   |<---------------------+                |
|   |  rotatePages             |  bytes in / bytes out                 |
|   |  deletePages             |                                       |
|   |  reorderPages            |                                       |
|   |  mergePdfs               |                                       |
|   |  extractPages            |                                       |
|   |  setPageRotations        |                                       |
|   +--------------------------+                                       |
|                                                                      |
|   +--------------------------+    parse + render                     |
|   | hooks/usePdfDocument.ts  |<----- currentPdfBytes                 |
|   |   bytes -> PDFDocumentProxy --->  PdfViewer / PageThumbnailGrid  |
|   |   uses pdfjs-dist worker (utils/pdfjs.ts)                        |
|   +--------------------------+                                       |
+----------------------------------------------------------------------+
```

## 2. Modules

| Module                                  | Responsibility                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `App.tsx`                               | Single source of truth for all state. Wires toolbars, viewer, grid. Orchestrates pdf-lib + PDF.js handoffs. |
| `components/AppShell.tsx`               | Persistent chrome: title, back button, quick download, toolbar slot.                                        |
| `components/ViewerToolbar.tsx`          | View-mode controls: open, page nav, zoom, fit, mode, print, download, edit toggle.                          |
| `components/EditorToolbar.tsx`          | Edit-mode controls: rotate, move, delete, extract, merge, save.                                             |
| `components/PdfViewer.tsx`              | Renders pages from a PDF.js proxy to `<canvas>` elements in continuous or single mode.                      |
| `components/PageThumbnailGrid.tsx`      | Renders selectable thumbnails (low scale) from the same proxy.                                              |
| `components/LoadingIndicator.tsx`       | Determinate / indeterminate progress UI used in overlay.                                                    |
| `hooks/usePdfDocument.ts`               | Owns the `bytes -> PDFDocumentProxy` lifecycle, including cancellation/teardown.                            |
| `utils/pdfjs.ts`                        | One-place PDF.js worker URL setup (Vite `?url` import).                                                     |
| `utils/fileUtils.ts`                    | Read `File -> Uint8Array`, trigger downloads, open print iframe, filename helpers.                          |
| `utils/pdfOperations.ts`                | Pure-ish pdf-lib helpers. Bytes in / bytes out, fully unit-tested.                                          |

## 3. State management

State is held in `App.tsx` with `useState` + `useCallback` + `useMemo`. There is no Redux/Zustand because:

- The surface area is small.
- Every view needs the same slice anyway.
- The canonical artifact is `currentPdfBytes`. Everything else is derived or session-local.

### State slices

| Slice                       | Type                          | Why it's there                                                                                         |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `originalFile`              | `File \| null`                | Keep the original filename for download naming.                                                        |
| `currentPdfBytes`           | `Uint8Array \| null`          | The authoritative document. Every edit returns new bytes.                                              |
| `pdfDocProxy` (derived)     | `PDFDocumentProxy \| null`    | PDF.js view of the bytes, owned by `usePdfDocument`.                                                   |
| `pageCount`                 | `number`                      | Cached from the proxy.                                                                                 |
| `currentPage`               | `number` (1-indexed)          | Drives single-page mode and the page input.                                                            |
| `viewMode`                  | `"view" \| "edit"`            | Picks between PdfViewer and PageThumbnailGrid.                                                         |
| `pageMode`                  | `"continuous" \| "single"`    | Layout in view mode.                                                                                   |
| `fitMode`                   | `"none" \| "width" \| "page"` | Overrides explicit `zoom` when active; recomputed on resize.                                           |
| `zoom`                      | `number`                      | Effective only when `fitMode === "none"`.                                                              |
| `selectedPages`             | `Set<number>` (display idx)   | Drives editor actions. Shift-click extends a range via `lastSelectedRef`.                              |
| `pageOrder`                 | `number[] \| null`            | Session-only reorder. `null` means identity order. Flushed into bytes on save/extract/delete/merge.    |
| `pageRotations`             | `Record<srcIdx, Rotation>`    | Session-only rotation by source index, so it follows pages across reorders.                            |
| `busy`, `progress`, `error` | misc                          | UI feedback.                                                                                           |

### Why session-only `pageRotations` / `pageOrder`?

Re-running pdf-lib on every click would feel slow on large PDFs. We accumulate cheap session edits and pay the pdf-lib cost only at meaningful boundaries (Save, Extract, Download, Delete, Merge). `flushOverrides()` in `App.tsx` is the single place that bakes them into bytes.

## 4. Key tradeoffs

| Tradeoff                                              | Choice                                                            | Why                                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Renderer                                              | **PDF.js (JS)**                                                   | First-class browser support, no WASM toolchain to wire, MIT-licensed, fits the 2-3h timebox. We do **not** claim WASM. |
| Editor engine                                         | **pdf-lib (JS)**                                                  | Tiny API, no native deps, predictable bytes-in/bytes-out shape, works in the browser and in Node tests.               |
| State store                                           | Local React state in `App.tsx`                                    | One owner of one document. Adding Redux/Zustand here would be ceremony without benefit.                               |
| Edits applied                                         | Session overrides flushed at boundaries                           | Avoids re-parsing 100MB PDFs on every rotate click; still produces correct exports.                                   |
| File loading                                          | Whole-file `arrayBuffer()`                                        | No backend, so no range requests / linearized streaming. Documented as a limitation.                                  |
| Page reorder                                          | Up/Down buttons                                                   | Drag-and-drop is +1-day work (HTML5 DnD + keyboard equivalents + reordering animations).                              |
| Print                                                 | Hidden iframe + `window.print()`                                  | Works cross-browser, no extra dependency.                                                                             |
| HiDPI                                                 | Backing-store scaled by `devicePixelRatio`                        | Crisp text on Retina/4K without blowing up CPU/memory for low-DPI screens.                                            |
| Encryption                                            | `ignoreEncryption: true` in pdf-lib                               | Lets owner-locked PDFs at least open. True user-passworded PDFs are out of scope.                                     |
| Error reporting                                       | Banner + console warning                                          | Non-fatal; the rest of the UI stays interactive.                                                                      |

## 5. Accessibility / performance notes

### Accessibility
- All buttons have `title` and visible labels; icon-only buttons (`+/-/</>`) also have `aria-label`.
- Toolbars are wrapped with `role="toolbar"` and grouped via `role="toolbar"` / labelled `aria-label`s.
- Thumbnail grid uses `role="listbox"` with `role="option"` + `aria-selected` on each thumbnail.
- Errors and loading use `role="alert"` / `role="status"` so screen readers announce them.
- The hidden file inputs are reached via real `<button>`s, so keyboard users can open files.
- We avoid color-only signals: selected pages have both a border ring and a background tint.

### Performance
- Render tasks are cancellable. Rapid zoom changes do not stack pdfjs render calls on the same canvas.
- `IntersectionObserver` updates `currentPage` in continuous mode without per-scroll layout reads.
- `ResizeObserver` recomputes fit-mode scale only on actual resize, not on every paint.
- Thumbnails render at a small fixed width (~160px) to keep memory bounded for large docs.
- pdf-lib edits are deferred to "real" actions via `flushOverrides()` instead of running on every UI tick.
- PDF.js runs in a Web Worker (default for pdfjs-dist v4 with our `?url` worker setup).

### Reliability
- Defensive copies of `Uint8Array` are made before handing bytes to PDF.js or Blob constructors, because some code paths can detach or share the underlying ArrayBuffer.
- `usePdfDocument` cancels in-flight loads and destroys old proxies on unmount, preventing worker leaks.

## 6. If I had 1 more day

1. **Drag-and-drop reorder** in the thumbnail grid with HTML5 DnD and keyboard equivalents (arrow keys + space-to-grab).
2. **Range-request loading** behind a small mock server: serve a linearized PDF and let PDF.js stream just the needed bytes. Document the same path for production S3/CloudFront.
3. **WASM PDF engine evaluation spike**: wrap PDFium (via the `pdfium-wasm` family) or evaluate Apryse/Foxit web SDK for redactions, annotations, signatures, widgets, bookmarks. Keep our React surface; swap the engine behind the same `pdfOperations` interface.
4. **Annotation MVP**: text notes stored as JSON in React state, rendered as overlay layers over the canvas, persisted into the PDF on save via pdf-lib's annotation API.
5. **End-to-end tests** (Playwright): open, navigate, rotate, delete, extract, merge, save, reopen.
6. **CI/CD**: GitHub Actions running `npm ci && npm test && npm run build`, plus a Vite preview deploy to S3/CloudFront via Terraform/CDK (IaC).
7. **OAuth2 / JWT-protected document gateway**: a thin BFF service in front of S3 that issues short-lived signed URLs after verifying a user's JWT (Cognito or Auth0). Client stays the same.
8. **Telemetry / observability**: load latency, render durations, edit operation counts, error rates piped to CloudWatch RUM + structured logs in any backend pieces (OpenTelemetry).

## 7. WebAssembly / bonus feature position

This MVP uses PDF.js for browser-based PDF rendering and pdf-lib for document manipulation. I am intentionally not claiming this as a fully WebAssembly-backed PDF SDK. PDF.js may use WebAssembly internally for selected decoding paths depending on build/runtime configuration, but this project does not depend on a WASM PDF engine.

For a production-grade SDK, I would evaluate a WASM-backed engine such as PDFium/WASM or a commercial PDF SDK if the product required advanced capabilities like true redaction annotations, signature form fields, widget annotations, bookmark read/write support, and highly optimized large-document workflows.

Given the 2–3 hour timebox, I prioritized a working, understandable MVP with clean architecture and honest documentation over a partially integrated WASM engine.

